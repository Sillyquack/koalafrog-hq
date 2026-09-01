import assert from "node:assert/strict"
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import {
  discoverPersistedIssueCandidates,
  persistentLiveEligibilityDecision,
  runRepositoryCycle,
  runRepositoryIssue,
  searchOpenIssueCandidates,
  watchRepository,
} from "../src/repository-runner.mjs"
import { QueueClaimStore } from "../src/queue-claim-store.mjs"
import { initialState } from "../src/state-store.mjs"

const repository = "Sillyquack/koalafrog-hq"
const requiredLabel = "koalafrog-orchestrator"

function config(stateDirectory, overrides = {}) {
  return {
    command: "watch",
    repository,
    stateDirectory,
    requiredLabel,
    issueAllowlist: [],
    issueNumberExplicit: false,
    discoveryLimit: 50,
    maxTasksPerPoll: 1,
    retryBaseMs: 1,
    ...overrides,
  }
}

function controlBlock(
  issueNumber,
  { action = "start", taskState = "ready" } = {},
) {
  return `\`\`\`yaml
agent_control:
  action: ${action}
  task_state: ${taskState}
  instruction_id: authoritative-live-admission-${issueNumber}
  owner_approval_required: false
  max_turns: 1
  prompt: |
    Perform the synthetic read-only admission test.
\`\`\``
}

function issueDetail(
  issueNumber,
  {
    labels = [requiredLabel],
    state = "open",
    body = controlBlock(issueNumber),
    url = `https://github.com/${repository}/issues/${issueNumber}`,
    number = issueNumber,
  } = {},
) {
  return {
    number,
    html_url: url,
    state,
    labels: labels?.map((name) => ({ name })) ?? labels,
    created_at: "2026-09-01T08:00:00.000Z",
    updated_at: "2026-09-01T08:00:00.000Z",
    body,
  }
}

function liveCandidate(issueNumber, overrides = {}) {
  return {
    issueNumber,
    issueUrl: `https://github.com/${repository}/issues/${issueNumber}`,
    labels: [requiredLabel],
    searchMatched: true,
    persistedState: false,
    ...overrides,
  }
}

function taskDirectory(root, issueNumber) {
  return path.join(root, `Sillyquack-koalafrog-hq-issue-${issueNumber}`)
}

async function assertTaskStateMissing(root, issueNumber) {
  await assert.rejects(
    access(path.join(taskDirectory(root, issueNumber), "state.json")),
    (error) => error.code === "ENOENT",
  )
}

function scannerFixture({ summaries, detail, comments = [] }) {
  const calls = []
  const scanner = {
    threadId: "authoritative-live-admission-scanner",
    appServer: {
      async stop() {},

      async callMcpTool(request) {
        calls.push(request)
        if (request.tool === "github.search_issues") {
          return { structuredContent: { items: summaries } }
        }
        if (request.tool === "github.fetch_issue") {
          if (detail instanceof Error) throw detail
          return {
            structuredContent: {
              issue: typeof detail === "function" ? detail() : detail,
            },
          }
        }
        if (request.tool === "github.fetch_issue_comments") {
          return { structuredContent: { comments } }
        }
        throw new Error(`Unexpected MCP tool ${request.tool}`)
      },
    },
  }
  return { scanner, calls }
}

test("labels:null search summary is hydrated before required-label admission", async () => {
  const { scanner, calls } = scannerFixture({
    summaries: [{ issue_number: 82, labels: null }],
    detail: issueDetail(82),
  })
  const candidates = await searchOpenIssueCandidates(
    scanner,
    config("/synthetic/state"),
  )
  assert.deepEqual(candidates.map(({ issueNumber }) => issueNumber), [82])
  assert.equal(candidates[0].persistedState, false)
  assert.equal(candidates[0].summaryLabelsComplete, false)
  assert.deepEqual(candidates.discoveryTelemetry, {
    searchReferenceIssueIds: [82],
    searchSummaryLabelsCompleteIssueIds: [],
    searchSummaryLabelsIncompleteIssueIds: [82],
    hydrationAttemptIssueIds: [82],
    hydrationSuccessIssueIds: [82],
    liveEligibleIssueIds: [82],
    liveExclusions: [],
    persistedEligibleIssueIds: [],
    mergedCandidateIssueIds: [],
    rawSchemaPreflightIssueIds: [],
    selectedIssueIds: [],
    claimAttemptIssueIds: [],
  })
  assert.deepEqual(calls.map(({ tool }) => tool), [
    "github.search_issues",
    "github.fetch_issue",
  ])
})

test("hydrated eligibility, not summary labels, is authoritative", async (t) => {
  await t.test("definitively unlabeled detail is a normal exclusion", async () => {
    const { scanner } = scannerFixture({
      summaries: [{ issue_number: 82, labels: [{ name: requiredLabel }] }],
      detail: issueDetail(82, { labels: [] }),
    })
    const candidates = await searchOpenIssueCandidates(
      scanner,
      config("/synthetic/state"),
    )
    assert.deepEqual(candidates, [])
    assert.deepEqual(candidates.discoveryTelemetry.liveExclusions, [
      { issueNumber: 82, reason: "live_label_absent" },
    ])
  })

  await t.test("closed issue is a normal exclusion", async () => {
    const { scanner } = scannerFixture({
      summaries: [{ issue_number: 82, labels: null }],
      detail: issueDetail(82, { state: "closed" }),
    })
    const candidates = await searchOpenIssueCandidates(
      scanner,
      config("/synthetic/state"),
    )
    assert.deepEqual(candidates, [])
    assert.equal(candidates.discoveryTelemetry.liveExclusions[0].reason, "issue_not_open")
  })

  await t.test("pull request is a normal exclusion", async () => {
    const { scanner } = scannerFixture({
      summaries: [{ issue_number: 82, labels: null }],
      detail: issueDetail(82, {
        url: `https://github.com/${repository}/pull/82`,
      }),
    })
    const candidates = await searchOpenIssueCandidates(
      scanner,
      config("/synthetic/state"),
    )
    assert.deepEqual(candidates, [])
    assert.equal(candidates.discoveryTelemetry.liveExclusions[0].reason, "pull_request")
  })
})

test("authoritative hydration uncertainty fails the repository poll closed", async (t) => {
  const cases = [
    ["lookup failure", new Error("connector unavailable"), "authoritative_issue_lookup_failed"],
    ["missing detail", null, "authoritative_issue_missing"],
    [
      "wrong issue number",
      issueDetail(83, { url: `https://github.com/${repository}/issues/83` }),
      "authoritative_issue_identity_mismatch",
    ],
    [
      "wrong repository",
      issueDetail(82, {
        url: "https://github.com/Sillyquack/other-repository/issues/82",
      }),
      "authoritative_issue_identity_mismatch",
    ],
    [
      "missing labels",
      { ...issueDetail(82), labels: null },
      "authoritative_issue_labels_incomplete",
    ],
    [
      "malformed labels",
      { ...issueDetail(82), labels: [{}] },
      "authoritative_issue_labels_incomplete",
    ],
    [
      "missing state",
      { ...issueDetail(82), state: null },
      "authoritative_issue_state_incomplete",
    ],
  ]
  for (const [name, detail, reason] of cases) {
    await t.test(name, async () => {
      const { scanner } = scannerFixture({
        summaries: [{ issue_number: 82, labels: null }],
        detail,
      })
      await assert.rejects(
        searchOpenIssueCandidates(scanner, config("/synthetic/state")),
        (error) =>
          error.code === "WATCHER_ELIGIBILITY_LOOKUP_FAILED" &&
          error.reason === reason,
      )
    })
  }
})

test("authoritative identity decision requires one exact repository and issue", () => {
  const watchConfig = config("/synthetic/state")
  assert.equal(
    persistentLiveEligibilityDecision(issueDetail(82), watchConfig, 82).eligible,
    true,
  )
  assert.equal(
    persistentLiveEligibilityDecision(
      issueDetail(82, {
        url: "https://github.com/Sillyquack/not-koalafrog/issues/82",
      }),
      watchConfig,
      82,
    ).lookupFailed,
    true,
  )
})

test("actual hydration lookup failure opens the repository circuit", async () => {
  const controller = new AbortController()
  const lines = []
  const { scanner } = scannerFixture({
    summaries: [{ issue_number: 82, labels: null }],
    detail: new Error("authoritative detail unavailable"),
  })
  await watchRepository(
    {
      ...config("/synthetic/state"),
      checkoutPath: "/synthetic/coordinator",
      pollMs: 60_000,
      unsafeDevelopmentWatch: true,
      healthPath: null,
    },
    {
      signal: controller.signal,
      createScanner: async () => scanner,
      sleep: async () => controller.abort("test complete"),
      write: (line) => lines.push(JSON.parse(line)),
    },
  )
  const failure = lines.find(({ event }) => event === "repository_poll_failed")
  assert.equal(failure.circuitBreaker.failureCount, 1)
  assert.equal(failure.circuitBreaker.state, "open")
  assert.deepEqual(failure.discovery.searchReferenceIssueIds, [82])
  assert.deepEqual(failure.discovery.hydrationAttemptIssueIds, [82])
  assert.deepEqual(failure.discovery.liveEligibleIssueIds, [])
})

function newIssueControlPlane({ taskIssue, finalIssues = null }) {
  let fetchCount = 0
  return class NewIssueControlPlane {
    async fetchIssue() {
      if (!finalIssues) return taskIssue
      const value = finalIssues[Math.min(fetchCount, finalIssues.length - 1)]
      fetchCount += 1
      return value
    }

    async fetchTask() {
      return { issue: taskIssue, comments: [] }
    }
  }
}

class ReadOnlyTrialOrchestrator {
  static turns = 0

  async runOnce({ expectedInstructionId }) {
    ReadOnlyTrialOrchestrator.turns += 1
    return { status: "needs_review", instructionId: expectedInstructionId }
  }

  async stop() {}
}

test("a valid new labeled start is initialized under lease and claimed once", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "new-live-admission-valid-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  ReadOnlyTrialOrchestrator.turns = 0
  const detail = issueDetail(82)
  const result = await runRepositoryIssue(
    { appServer: {}, threadId: "scanner" },
    config(root),
    liveCandidate(82),
    {
      ControlPlaneClass: newIssueControlPlane({ taskIssue: detail }),
      OrchestratorClass: ReadOnlyTrialOrchestrator,
      claimStore: new QueueClaimStore({
        stateDirectory: root,
        retryBaseMs: 1,
        watcherV2: true,
      }),
    },
  )
  assert.equal(result.claimed, true)
  assert.equal(result.status, "needs_review")
  assert.equal(ReadOnlyTrialOrchestrator.turns, 1)
  const state = JSON.parse(
    await readFile(path.join(taskDirectory(root, 82), "state.json"), "utf8"),
  )
  assert.equal(state.task.originIssueNumber, 82)
  const queue = JSON.parse(
    await readFile(
      path.join(
        root,
        "repository-queue",
        "instructions",
        "authoritative-live-admission-82.json",
      ),
      "utf8",
    ),
  )
  assert.equal(queue.status, "completed")
  assert.equal(queue.attempt, 1)
})

test("an explicitly allowlisted new issue retains label-bypass admission", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "new-allowlist-admission-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  ReadOnlyTrialOrchestrator.turns = 0
  const detail = issueDetail(82, { labels: [] })
  const result = await runRepositoryIssue(
    { appServer: {}, threadId: "scanner" },
    config(root, { requiredLabel: null, issueAllowlist: [82] }),
    liveCandidate(82, { labels: [] }),
    {
      ControlPlaneClass: newIssueControlPlane({ taskIssue: detail }),
      OrchestratorClass: ReadOnlyTrialOrchestrator,
      claimStore: new QueueClaimStore({
        stateDirectory: root,
        retryBaseMs: 1,
        watcherV2: true,
      }),
    },
  )
  assert.equal(result.claimed, true)
  assert.equal(ReadOnlyTrialOrchestrator.turns, 1)
})

test("inadmissible new issues leave no durable task state", async (t) => {
  const cases = [
    [
      "malformed control",
      issueDetail(82, { body: "```yaml\nagent_control:\n  action: start\n```" }),
      "missing_valid_start_control",
    ],
    [
      "wrong task state",
      issueDetail(82, {
        body: controlBlock(82, { action: "start", taskState: "needs_review" }),
      }),
      "initial_control_not_start_ready",
    ],
    [
      "ambiguous controls",
      issueDetail(82, { body: `${controlBlock(82)}\n${controlBlock(83)}` }),
      "ambiguous_initial_controls",
    ],
  ]
  for (const [name, detail, reason] of cases) {
    await t.test(name, async (subtest) => {
      const root = await mkdtemp(path.join(os.tmpdir(), "new-live-inadmissible-"))
      subtest.after(() => rm(root, { recursive: true, force: true }))
      const result = await runRepositoryIssue(
        { appServer: {}, threadId: "scanner" },
        config(root),
        liveCandidate(82),
        {
          ControlPlaneClass: newIssueControlPlane({ taskIssue: detail }),
          OrchestratorClass: ReadOnlyTrialOrchestrator,
          claimStore: new QueueClaimStore({
            stateDirectory: root,
            retryBaseMs: 1,
            watcherV2: true,
          }),
        },
      )
      assert.equal(result.status, "new_issue_not_admitted")
      assert.equal(result.reason, reason)
      await assertTaskStateMissing(root, 82)
    })
  }
})

test("label removal at final admission revokes before first state creation", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "new-live-admission-revoke-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const labeled = issueDetail(82)
  const unlabeled = issueDetail(82, { labels: [] })
  const result = await runRepositoryIssue(
    { appServer: {}, threadId: "scanner" },
    config(root),
    liveCandidate(82),
    {
      ControlPlaneClass: newIssueControlPlane({
        taskIssue: labeled,
        finalIssues: [labeled, unlabeled],
      }),
      OrchestratorClass: ReadOnlyTrialOrchestrator,
      claimStore: new QueueClaimStore({
        stateDirectory: root,
        retryBaseMs: 1,
        watcherV2: true,
      }),
    },
  )
  assert.equal(result.status, "persistent_opt_in_revoked")
  assert.equal(result.reason, "live_label_absent")
  await assertTaskStateMissing(root, 82)
})

test("concurrent first admission and restart produce one state, claim, and turn", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "new-live-admission-race-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  ReadOnlyTrialOrchestrator.turns = 0
  const detail = issueDetail(82)
  const claimStore = new QueueClaimStore({
    stateDirectory: root,
    retryBaseMs: 1,
    watcherV2: true,
  })
  const dependencies = {
    ControlPlaneClass: newIssueControlPlane({ taskIssue: detail }),
    OrchestratorClass: ReadOnlyTrialOrchestrator,
    claimStore,
  }
  const firstPair = await Promise.all([
    runRepositoryIssue(
      { appServer: {}, threadId: "scanner-a" },
      config(root),
      liveCandidate(82),
      dependencies,
    ),
    runRepositoryIssue(
      { appServer: {}, threadId: "scanner-b" },
      config(root),
      liveCandidate(82),
      dependencies,
    ),
  ])
  assert.equal(firstPair.filter(({ claimed }) => claimed).length, 1)
  assert.equal(ReadOnlyTrialOrchestrator.turns, 1)
  const restarted = await runRepositoryIssue(
    { appServer: {}, threadId: "scanner-restart" },
    config(root),
    liveCandidate(82),
    dependencies,
  )
  assert.equal(restarted.claimed, false)
  assert.equal(ReadOnlyTrialOrchestrator.turns, 1)
  const queue = JSON.parse(
    await readFile(
      path.join(
        root,
        "repository-queue",
        "instructions",
        "authoritative-live-admission-82.json",
      ),
      "utf8",
    ),
  )
  assert.equal(queue.attempt, 1)
})

test("two new candidates remain subject to deterministic max-task fairness", async () => {
  const visited = []
  const results = await runRepositoryCycle(
    {},
    config("/synthetic/state"),
    {
      search: async () => [liveCandidate(82), liveCandidate(83)],
      discoverPersisted: async () => [],
      rawSchemaPreflight: async () => [],
      runIssue: async (_scanner, _config, candidate) => {
        visited.push(candidate.issueNumber)
        return {
          issueNumber: candidate.issueNumber,
          status: "needs_review",
          claimed: true,
        }
      },
    },
  )
  assert.deepEqual(visited, [82])
  assert.deepEqual(results.map(({ issueNumber }) => issueNumber), [82])
})

test("production-shaped poll admits only new hydrated Issue 82 and exposes stages", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "live-admission-full-cycle-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const legacy = [53, 54, 56, 60, 62, 63, 64, 65, 66, 67, 68, 70, 71, 72, 78]
  const legacyContents = new Map()
  for (const issueNumber of legacy) {
    const directory = taskDirectory(root, issueNumber)
    await mkdir(directory, { recursive: true })
    const state = initialState({ repository, issueNumber })
    state.status = issueNumber === 70 ? "done" : "needs_review"
    const contents = JSON.stringify(state)
    legacyContents.set(issueNumber, contents)
    await writeFile(path.join(directory, "state.json"), contents)
  }
  let searchSummaries = []
  let currentDetail = issueDetail(82)
  const { scanner } = scannerFixture({
    get summaries() {
      return searchSummaries
    },
    detail: () => currentDetail,
  })
  // The fixture's search response is intentionally mutable between polls.
  scanner.appServer.callMcpTool = async (request) => {
    if (request.tool === "github.search_issues") {
      return { structuredContent: { items: searchSummaries } }
    }
    if (request.tool === "github.fetch_issue") {
      return { structuredContent: { issue: currentDetail } }
    }
    if (request.tool === "github.fetch_issue_comments") {
      return { structuredContent: { comments: [] } }
    }
    throw new Error(`Unexpected MCP tool ${request.tool}`)
  }
  const stateReads = []
  ReadOnlyTrialOrchestrator.turns = 0
  const claimStore = new QueueClaimStore({
    stateDirectory: root,
    retryBaseMs: 1,
    watcherV2: true,
  })
  const cycle = () =>
    runRepositoryCycle(scanner, config(root), {
      discoverPersisted: async (cycleConfig, options) =>
        discoverPersistedIssueCandidates(cycleConfig, {
          ...options,
          readState: async (...args) => {
            stateReads.push(args[0])
            return readFile(...args)
          },
        }),
      runIssue: async (_scanner, cycleConfig, candidate, options) =>
        runRepositoryIssue(_scanner, cycleConfig, candidate, {
          ...options,
          OrchestratorClass: ReadOnlyTrialOrchestrator,
        }),
      claimStore,
    })

  const beforeEnrollment = await cycle()
  assert.deepEqual(beforeEnrollment, [])
  assert.deepEqual(stateReads, [])
  await assertTaskStateMissing(root, 82)

  searchSummaries = [{ issue_number: 82, labels: null }]
  const first = await cycle()
  assert.equal(first.length, 1)
  assert.equal(first[0].issueNumber, 82)
  assert.equal(first[0].claimed, true)
  assert.equal(ReadOnlyTrialOrchestrator.turns, 1)
  assert.deepEqual(stateReads, [])
  assert.deepEqual(first.discoveryTelemetry.searchReferenceIssueIds, [82])
  assert.deepEqual(first.discoveryTelemetry.liveEligibleIssueIds, [82])
  assert.deepEqual(first.discoveryTelemetry.persistedEligibleIssueIds, [])
  assert.deepEqual(first.discoveryTelemetry.mergedCandidateIssueIds, [82])
  assert.deepEqual(first.discoveryTelemetry.selectedIssueIds, [82])
  assert.deepEqual(first.discoveryTelemetry.claimAttemptIssueIds, [82])
  assert.deepEqual(first.discoveryTelemetry.rawSchemaPreflightIssueIds, [])

  searchSummaries = []
  currentDetail = issueDetail(82, { labels: [] })
  stateReads.length = 0
  const revoked = await cycle()
  assert.deepEqual(revoked, [])
  assert.deepEqual(stateReads, [])
  assert.equal(ReadOnlyTrialOrchestrator.turns, 1)
  for (const issueNumber of legacy) {
    assert.equal(
      await readFile(path.join(taskDirectory(root, issueNumber), "state.json"), "utf8"),
      legacyContents.get(issueNumber),
    )
  }
})

test("persistent poll output carries only stage-level discovery telemetry", async () => {
  const controller = new AbortController()
  const lines = []
  const results = []
  const discoveryTelemetry = {
    searchReferenceIssueIds: [82],
    searchSummaryLabelsCompleteIssueIds: [],
    searchSummaryLabelsIncompleteIssueIds: [82],
    hydrationAttemptIssueIds: [82],
    hydrationSuccessIssueIds: [82],
    liveEligibleIssueIds: [82],
    liveExclusions: [],
    persistedEligibleIssueIds: [],
    mergedCandidateIssueIds: [82],
    rawSchemaPreflightIssueIds: [],
    selectedIssueIds: [82],
    claimAttemptIssueIds: [82],
  }
  Object.defineProperty(results, "discoveryTelemetry", {
    enumerable: false,
    value: discoveryTelemetry,
  })
  await watchRepository(
    {
      ...config("/synthetic/state"),
      checkoutPath: "/synthetic/coordinator",
      pollMs: 60_000,
      unsafeDevelopmentWatch: true,
      healthPath: null,
    },
    {
      signal: controller.signal,
      createScanner: async () => ({
        appServer: { async stop() {} },
      }),
      runCycle: async () => results,
      sleep: async () => controller.abort("test complete"),
      write: (line) => lines.push(JSON.parse(line)),
    },
  )
  const completed = lines.find(
    ({ event }) => event === "repository_poll_completed",
  )
  assert.deepEqual(completed.discovery, discoveryTelemetry)
  assert.equal(JSON.stringify(completed).includes("agent_control"), false)
  assert.equal(JSON.stringify(completed).includes("prompt"), false)
})
