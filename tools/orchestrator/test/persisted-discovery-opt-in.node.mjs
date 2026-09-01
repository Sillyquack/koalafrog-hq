import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
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
import { WatcherCircuitBreaker } from "../src/watcher-v2.mjs"

const repository = "Sillyquack/koalafrog-hq"
const requiredLabel = "koalafrog-orchestrator"

function taskDirectory(root, issueNumber) {
  return path.join(root, `Sillyquack-koalafrog-hq-issue-${issueNumber}`)
}

async function writeState(root, issueNumber, state) {
  const directory = taskDirectory(root, issueNumber)
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, "state.json"), JSON.stringify(state))
}

function stateFixture(issueNumber, { status = "ready", labels = [] } = {}) {
  const state = initialState({
    repository,
    issueNumber,
    issueUrl: `https://github.com/Sillyquack/koalafrog-hq/issues/${issueNumber}`,
  })
  state.status = status
  state.task.originIssueLabels = labels
  return state
}

function legacyFixture(issueNumber, failureCount) {
  return {
    schemaVersion: 10,
    stateRevision: failureCount + 10,
    status: issueNumber === 71 ? "ready" : "failed",
    activeInstruction: {
      instructionId: `legacy-${issueNumber}-stale-control`,
    },
    retryCount: failureCount,
    task: {
      repository,
      issueNumber,
      originIssueNumber: issueNumber,
      originIssueUrl: `https://github.com/Sillyquack/koalafrog-hq/issues/${issueNumber}`,
      originIssueLabels: [requiredLabel],
    },
  }
}

function config(root, overrides = {}) {
  return {
    command: "watch",
    repository,
    stateDirectory: root,
    requiredLabel,
    issueAllowlist: [],
    issueNumberExplicit: false,
    maxTasksPerPoll: 1,
    retryBaseMs: 1,
    ...overrides,
  }
}

function liveCandidate(issueNumber, labels = [requiredLabel]) {
  return {
    issueNumber,
    issueUrl: `https://github.com/Sillyquack/koalafrog-hq/issues/${issueNumber}`,
    labels,
    searchMatched: true,
  }
}

function issue(issueNumber, labels = [requiredLabel]) {
  return {
    number: issueNumber,
    html_url: `https://github.com/Sillyquack/koalafrog-hq/issues/${issueNumber}`,
    state: "open",
    labels: labels.map((name) => ({ name })),
    updated_at: "2026-08-31T20:00:00.000Z",
    body: `\`\`\`yaml
agent_control:
  action: start
  task_state: ready
  instruction_id: synthetic-live-opt-in-${issueNumber}
  owner_approval_required: false
  max_turns: 1
  prompt: |
    Perform the synthetic read-only opt-in test.
\`\`\``,
  }
}

test("persistent GitHub search builds an authoritative live-label index", async () => {
  const calls = []
  const scanner = {
    threadId: "scanner",
    appServer: {
      async callMcpTool(request) {
        calls.push(request)
        if (request.tool === "github.fetch_issue") {
          return { structuredContent: { issue: issue(79) } }
        }
        return {
          structuredContent: {
            items: [
              {
                ...issue(79),
                body: "No control is required merely to establish live opt-in.",
              },
            ],
          },
        }
      },
    },
  }
  const candidates = await searchOpenIssueCandidates(
    scanner,
    config("/synthetic/state", { discoveryLimit: 50 }),
  )
  assert.deepEqual(candidates.map(({ issueNumber }) => issueNumber), [79])
  assert.match(calls[0].arguments.query, /label:"koalafrog-orchestrator"/)
  assert.doesNotMatch(calls[0].arguments.query, /agent_control/)
  assert.deepEqual(calls.map(({ tool }) => tool), [
    "github.search_issues",
    "github.fetch_issue",
  ])
})

test("explicit allowlist fetches only allowlisted live issue detail without label", async () => {
  const calls = []
  const scanner = {
    threadId: "scanner",
    appServer: {
      async callMcpTool(request) {
        calls.push(request)
        return {
          structuredContent: { issue: issue(79, []) },
        }
      },
    },
  }
  const candidates = await searchOpenIssueCandidates(
    scanner,
    config("/synthetic/state", {
      requiredLabel: null,
      issueAllowlist: [79],
    }),
  )
  assert.deepEqual(candidates.map(({ issueNumber }) => issueNumber), [79])
  assert.deepEqual(calls.map(({ tool }) => tool), ["github.fetch_issue"])
})

test("unlabeled persisted legacy directories cause zero state reads", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "persisted-opt-in-zero-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const issueNumbers = [53, 54, 56, 60, 62, 63, 64, 65, 66, 67, 68, 70, 71, 72, 78]
  for (const issueNumber of issueNumbers) {
    await writeState(
      root,
      issueNumber,
      issueNumber === 68
        ? legacyFixture(68, 5_001)
        : issueNumber === 71
          ? legacyFixture(71, 1_001)
          : stateFixture(issueNumber, {
              status: issueNumber === 70 ? "done" : "needs_review",
              labels: [requiredLabel],
            }),
    )
  }
  const reads = []
  const candidates = await discoverPersistedIssueCandidates(config(root), {
    liveCandidates: [],
    readState: async (...args) => {
      reads.push(args[0])
      return readFile(...args)
    },
  })
  assert.deepEqual(candidates, [])
  assert.deepEqual(reads, [])
})

test("only the one authoritatively live-labeled persisted issue is state-loaded", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "persisted-opt-in-one-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeState(root, 68, legacyFixture(68, 5_001))
  await writeState(root, 71, legacyFixture(71, 1_001))
  await writeState(root, 79, stateFixture(79, { labels: [requiredLabel] }))
  const reads = []
  const candidates = await discoverPersistedIssueCandidates(config(root), {
    liveCandidates: [liveCandidate(79)],
    readState: async (...args) => {
      reads.push(args[0])
      return readFile(...args)
    },
  })
  assert.deepEqual(candidates.map(({ issueNumber }) => issueNumber), [79])
  assert.deepEqual(reads, [path.join(taskDirectory(root, 79), "state.json")])
})

test("cached label is never sufficient and a newly added live label is eligible next poll", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "persisted-opt-in-cache-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeState(root, 79, stateFixture(79, { labels: [requiredLabel] }))
  let reads = 0
  const readState = async (...args) => {
    reads += 1
    return readFile(...args)
  }
  assert.deepEqual(
    await discoverPersistedIssueCandidates(config(root), {
      liveCandidates: [],
      readState,
    }),
    [],
  )
  assert.equal(reads, 0)
  const candidates = await discoverPersistedIssueCandidates(config(root), {
    liveCandidates: [liveCandidate(79)],
    readState,
  })
  assert.deepEqual(candidates.map(({ issueNumber }) => issueNumber), [79])
  assert.equal(reads, 1)
})

test("allowlist and exact canary inspect only their exact configured issue", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "persisted-opt-in-scoped-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  for (const issueNumber of [68, 71, 78]) {
    await writeState(root, issueNumber, stateFixture(issueNumber))
  }
  const allowlistReads = []
  const allowlisted = await discoverPersistedIssueCandidates(
    config(root, { issueAllowlist: [68] }),
    {
      readState: async (...args) => {
        allowlistReads.push(args[0])
        return readFile(...args)
      },
    },
  )
  assert.deepEqual(allowlisted.map(({ issueNumber }) => issueNumber), [68])
  assert.deepEqual(allowlistReads, [path.join(taskDirectory(root, 68), "state.json")])

  const canaryReads = []
  const canary = await discoverPersistedIssueCandidates(
    config(root, {
      issueNumber: 78,
      issueNumberExplicit: true,
      requiredLabel: null,
    }),
    {
      readState: async (...args) => {
        canaryReads.push(args[0])
        return readFile(...args)
      },
    },
  )
  assert.deepEqual(canary.map(({ issueNumber }) => issueNumber), [78])
  assert.deepEqual(canaryReads, [path.join(taskDirectory(root, 78), "state.json")])
})

test("live label removal rejects a cached candidate before StateStore.load", async () => {
  let loads = 0
  class FakeStateStore {
    async load() {
      loads += 1
      throw new Error("ineligible state must not load")
    }
  }
  class UnlabeledControlPlane {
    async fetchIssue() {
      return issue(79, [])
    }
  }
  const result = await runRepositoryIssue(
    { appServer: {}, threadId: "scanner" },
    config("/synthetic/state"),
    liveCandidate(79),
    {
      ControlPlaneClass: UnlabeledControlPlane,
      StateStoreClass: FakeStateStore,
    },
  )
  assert.equal(result.status, "persistent_opt_in_revoked")
  assert.equal(result.reason, "live_label_absent")
  assert.equal(result.claimed, false)
  assert.equal(loads, 0)
})

test("label removal between pre-state detail and selection stops before instruction claim", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "persisted-opt-in-detail-race-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  class RemovedDuringTaskFetch {
    async fetchIssue() {
      return issue(79)
    }

    async fetchTask() {
      return { issue: issue(79, []), comments: [] }
    }
  }
  class UnexpectedOrchestrator {
    constructor() {
      throw new Error("revoked instruction must not start")
    }
  }
  const result = await runRepositoryIssue(
    { appServer: {}, threadId: "scanner" },
    config(root),
    liveCandidate(79),
    {
      ControlPlaneClass: RemovedDuringTaskFetch,
      OrchestratorClass: UnexpectedOrchestrator,
      claimStore: new QueueClaimStore({
        stateDirectory: root,
        retryBaseMs: 1,
        watcherV2: true,
      }),
    },
  )
  assert.equal(result.status, "persistent_opt_in_revoked")
  assert.equal(result.claimed, false)
})

test("live label lookup failure is a global poll failure, not an issue result", async () => {
  let stateLoads = 0
  class FailingControlPlane {
    async fetchIssue() {
      throw new Error("GitHub detail unavailable")
    }
  }
  class UnreadStateStore {
    async load() {
      stateLoads += 1
      throw new Error("lookup failure must precede state load")
    }
  }
  await assert.rejects(
    runRepositoryIssue(
      { appServer: {}, threadId: "scanner" },
      config("/synthetic/state"),
      liveCandidate(79),
      {
        ControlPlaneClass: FailingControlPlane,
        StateStoreClass: UnreadStateStore,
      },
    ),
    (error) => error.code === "WATCHER_ELIGIBILITY_LOOKUP_FAILED",
  )
  assert.equal(stateLoads, 0)

  let issueCalls = 0
  await assert.rejects(
    runRepositoryCycle(
      {},
      config("/synthetic/state"),
      {
        search: async () => [liveCandidate(79)],
        discoverPersisted: async () => [],
        rawSchemaPreflight: async () => [],
        runIssue: async () => {
          issueCalls += 1
          throw Object.assign(new Error("GitHub detail unavailable"), {
            code: "WATCHER_ELIGIBILITY_LOOKUP_FAILED",
          })
        },
      },
    ),
    (error) => error.code === "WATCHER_ELIGIBILITY_LOOKUP_FAILED",
  )
  assert.equal(issueCalls, 1)
})

test("eligibility lookup failure opens the repository circuit without issue retry", async () => {
  const controller = new AbortController()
  const lines = []
  const breaker = new WatcherCircuitBreaker({
    now: () => new Date("2026-08-31T20:00:00.000Z"),
  })
  let scannerStops = 0
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
        appServer: {
          async stop() {
            scannerStops += 1
          },
        },
      }),
      runCycle: async () => {
        throw Object.assign(new Error("GitHub detail unavailable"), {
          code: "WATCHER_ELIGIBILITY_LOOKUP_FAILED",
        })
      },
      sleep: async () => {
        controller.abort("test complete")
      },
      write: (line) => lines.push(JSON.parse(line)),
      circuitBreaker: breaker,
    },
  )
  const failure = lines.find(({ event }) => event === "repository_poll_failed")
  assert.equal(failure.circuitBreaker.failureCount, 1)
  assert.equal(failure.circuitBreaker.state, "open")
  assert.equal(scannerStops, 1)
})

test("label removal after selection is caught before an instruction claim", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "persisted-opt-in-race-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const live = issue(79)
  const removed = issue(79, [])
  let issueFetches = 0
  class ChangingControlPlane {
    async fetchIssue() {
      issueFetches += 1
      return issueFetches === 1 ? live : removed
    }

    async fetchTask() {
      return { issue: live, comments: [] }
    }
  }
  class UnexpectedOrchestrator {
    constructor() {
      throw new Error("revoked instruction must not start")
    }
  }
  const claimStore = new QueueClaimStore({
    stateDirectory: root,
    retryBaseMs: 1,
    watcherV2: true,
  })
  const result = await runRepositoryIssue(
    { appServer: {}, threadId: "scanner" },
    config(root),
    liveCandidate(79),
    {
      ControlPlaneClass: ChangingControlPlane,
      OrchestratorClass: UnexpectedOrchestrator,
      claimStore,
    },
  )
  assert.equal(result.status, "persistent_opt_in_revoked")
  assert.equal(result.reason, "live_label_absent")
  assert.equal(result.claimed, false)
  await assert.rejects(
    readFile(
      path.join(
        root,
        "repository-queue",
        "instructions",
        "synthetic-live-opt-in-79.json",
      ),
    ),
    (error) => error.code === "ENOENT",
  )
})

test("label change after authoritative claim does not alter eligibility retroactively", () => {
  const watchConfig = config("/synthetic/state")
  assert.deepEqual(
    persistentLiveEligibilityDecision(issue(79), watchConfig, 79),
    { eligible: true, mechanism: "required_live_label" },
  )
  assert.deepEqual(
    persistentLiveEligibilityDecision(issue(79, []), watchConfig, 79),
    { eligible: false, mechanism: null, reason: "live_label_absent" },
  )
  assert.deepEqual(
    persistentLiveEligibilityDecision(
      { ...issue(79), state: "closed" },
      watchConfig,
      79,
    ),
    { eligible: false, mechanism: null, reason: "issue_not_open" },
  )
  assert.deepEqual(
    persistentLiveEligibilityDecision(
      issue(79, []),
      { ...watchConfig, command: "once" },
      79,
    ),
    { eligible: true, mechanism: "bounded" },
  )
})

test("label removal after authoritative claim does not fabricate cancellation or replay", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "persisted-opt-in-post-claim-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  let currentLabels = [requiredLabel]
  let runs = 0
  let stops = 0
  class ClaimedControlPlane {
    async fetchIssue() {
      return issue(79, currentLabels)
    }

    async fetchTask() {
      return { issue: issue(79, currentLabels), comments: [] }
    }
  }
  class ClaimedOrchestrator {
    async runOnce() {
      runs += 1
      currentLabels = []
      return {
        instructionId: "synthetic-live-opt-in-79",
        status: "needs_review",
      }
    }

    async stop() {
      stops += 1
    }
  }
  const result = await runRepositoryIssue(
    { appServer: {}, threadId: "scanner" },
    config(root),
    liveCandidate(79),
    {
      ControlPlaneClass: ClaimedControlPlane,
      OrchestratorClass: ClaimedOrchestrator,
      claimStore: new QueueClaimStore({
        stateDirectory: root,
        retryBaseMs: 1,
        watcherV2: true,
      }),
    },
  )
  assert.equal(result.status, "needs_review")
  assert.equal(result.claimed, true)
  assert.equal(runs, 1)
  assert.equal(stops, 1)
})

test("synthetic production inventory loads one labeled issue then none after revocation", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "persisted-opt-in-inventory-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const legacy = [53, 54, 56, 60, 62, 63, 64, 65, 66, 67, 68, 70, 71, 72, 78]
  for (const issueNumber of legacy) {
    await writeState(root, issueNumber, stateFixture(issueNumber))
  }
  await writeState(root, 79, stateFixture(79))
  const reads = []
  const eligible = await discoverPersistedIssueCandidates(config(root), {
    liveCandidates: [liveCandidate(79)],
    readState: async (...args) => {
      reads.push(args[0])
      return readFile(...args)
    },
  })
  assert.deepEqual(eligible.map(({ issueNumber }) => issueNumber), [79])
  assert.deepEqual(reads, [path.join(taskDirectory(root, 79), "state.json")])

  reads.length = 0
  const revoked = await discoverPersistedIssueCandidates(config(root), {
    liveCandidates: [],
    readState: async (...args) => {
      reads.push(args[0])
      return readFile(...args)
    },
  })
  assert.deepEqual(revoked, [])
  assert.deepEqual(reads, [])
})

test("synthetic repository cycle applies fairness only after live opt-in filtering", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "persisted-opt-in-cycle-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const legacy = [53, 54, 56, 60, 62, 63, 64, 65, 66, 67, 68, 70, 71, 72, 78]
  for (const issueNumber of [...legacy, 79]) {
    await writeState(root, issueNumber, stateFixture(issueNumber))
  }
  const stateReads = []
  const fairness = []
  const cycle = async (liveCandidates) =>
    runRepositoryCycle({}, config(root), {
      search: async () => liveCandidates,
      discoverPersisted: async (cycleConfig, options) =>
        discoverPersistedIssueCandidates(cycleConfig, {
          ...options,
          readState: async (...args) => {
            stateReads.push(args[0])
            return readFile(...args)
          },
        }),
      rawSchemaPreflight: async (_cycleConfig, candidates) => {
        assert.deepEqual(
          candidates.map(({ issueNumber }) => issueNumber),
          liveCandidates.map(({ issueNumber }) => issueNumber),
        )
      },
      runIssue: async (_scanner, _cycleConfig, candidate) => {
        fairness.push(candidate.issueNumber)
        return {
          issueNumber: candidate.issueNumber,
          status: "needs_review",
          claimed: true,
        }
      },
    })

  const first = await cycle([liveCandidate(79)])
  assert.deepEqual(first.map(({ issueNumber }) => issueNumber), [79])
  assert.deepEqual(fairness, [79])
  assert.deepEqual(stateReads, [path.join(taskDirectory(root, 79), "state.json")])

  stateReads.length = 0
  fairness.length = 0
  assert.deepEqual(await cycle([]), [])
  assert.deepEqual(stateReads, [])
  assert.deepEqual(fairness, [])
})
