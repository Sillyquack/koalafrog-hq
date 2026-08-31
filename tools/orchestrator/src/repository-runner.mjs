import { setTimeout as delay } from "node:timers/promises"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { AppServerClient } from "./app-server.mjs"
import { reconcileLaunchAgentApproval } from "./approval-decisions.mjs"
import {
  instructionSupersessionAuditEvents,
  instructionSupersessionDecision,
  isInstructionEligible,
  listAgentControls,
  recordInstructionSupersession,
  requireInstructionSupersessionReconciliation,
  selectInstructionSupersessionCandidate,
} from "./control-plane.mjs"
import { GithubControlPlane } from "./github-control-plane.mjs"
import {
  durableTaskInstructionDecision,
  recoverCompletedCheckpointActivation,
} from "./git-execution-boundary.mjs"
import { Orchestrator } from "./orchestrator.mjs"
import { QueueClaimStore } from "./queue-claim-store.mjs"
import {
  discoverIssueCandidates,
  isPullRequest,
} from "./repository-discovery.mjs"
import { installTaskThreadPolicy } from "./runtime-policy.mjs"
import { launchAgentLabel } from "./launchd.mjs"
import {
  recordIssueObservation,
  redactForLog,
  StateStore,
} from "./state-store.mjs"
import { terminalityReconciliationRecordIsValid } from "./terminality-reconciliation.mjs"
import {
  recordTerminalCloseout,
  selectTerminalCloseoutCandidate,
  terminalCloseoutAuditEvents,
  terminalCloseoutDecision,
  validateTerminalCloseoutRecord,
} from "./terminal-closeout.mjs"

installTaskThreadPolicy(AppServerClient)

const commentContinuationStates = new Set([
  "needs_review",
  "needs_owner",
  "failed",
])

function retryAuthorizationId({ state, instruction, recovery }) {
  const ids = new Set()
  if (recovery?.accepted) {
    const recoveryId = recovery.value?.record?.recoveryId
    if (typeof recoveryId !== "string" || !recoveryId) {
      throw new Error("Accepted checkpoint recovery is missing its durable identity")
    }
    ids.add(recoveryId)
  }
  const activeRecoveryId =
    state.activeInstruction?.checkpointActivationRecovery?.recoveryId
  if (activeRecoveryId != null) {
    if (typeof activeRecoveryId !== "string" || !activeRecoveryId) {
      throw new Error("Active checkpoint recovery has an invalid identity")
    }
    ids.add(activeRecoveryId)
  }
  if ((state.retryInstructionIds ?? []).includes(instruction.instructionId)) {
    ids.add(`instruction-retry:${instruction.instructionId}`)
  }
  if (ids.size > 1) {
    throw new Error("Instruction has ambiguous retry authorization")
  }
  return [...ids][0] ?? null
}

function terminalDurableResultRun(state) {
  if (state.activeInstruction || !state.lastConsumedInstructionId) return null
  const matches = (state.runs ?? []).filter(
    (run) => run.instructionId === state.lastConsumedInstructionId,
  )
  if (matches.length > 1) {
    throw new Error("Durable instruction result is ambiguous")
  }
  if (matches.length === 0) return null
  const run = matches[0]
  if (
    run.status !== "failed" ||
    run.resultArtifact?.source !== "app_server_turn_failure" ||
    run.resultArtifact?.failure?.willRetry !== false
  ) {
    const terminality = run.resultArtifact?.terminality
    if (
      !new Set(["failed", "needs_review"]).has(run.status) ||
      run.resultArtifact?.source !==
        "interrupted_command_terminality_reconciliation" ||
      !terminality ||
      !new Set(["terminality_proven", "terminality_unprovable"]).has(
        terminality.classification,
      )
    ) {
      return null
    }
    const records = (state.terminalityReconciliations ?? []).filter(
      (record) => record.reconciliationId === terminality.reconciliationId,
    )
    if (
      records.length !== 1 ||
      !terminalityReconciliationRecordIsValid(records[0]) ||
      records[0].status !== "finalized" ||
      records[0].resultStatus !== run.status ||
      records[0].originIssueNumber !== state.task.originIssueNumber ||
      records[0].originIssueUrl !== state.task.originIssueUrl ||
      records[0].instructionId !== run.instructionId ||
      records[0].threadId !== run.threadId ||
      records[0].turnId !== terminality.turnId ||
      records[0].classification !== terminality.classification ||
      records[0].terminalOutcome !== terminality.terminalOutcome ||
      records[0].instructionId !== terminality.instructionId ||
      records[0].evidenceIdentity !== terminality.evidenceIdentity ||
      JSON.stringify(records[0].itemIds) !== JSON.stringify(terminality.itemIds)
    ) {
      throw new Error("Durable terminality result binding is invalid")
    }
    return run
  }
  const failure = run.resultArtifact.failure
  if (
    typeof run.threadId !== "string" ||
    !run.threadId ||
    !/^[A-Za-z0-9._:/-]{1,160}$/.test(run.threadId) ||
    failure.threadId !== run.threadId ||
    typeof failure.turnId !== "string" ||
    !failure.turnId ||
    !/^[A-Za-z0-9._:/-]{1,160}$/.test(failure.turnId) ||
    run.resultArtifact.turnId !== failure.turnId ||
    failure.eventId !== `turn_failed:${failure.threadId}:${failure.turnId}` ||
    failure.errorClass !== "AppServerTurnError" ||
    failure.code !== "APP_SERVER_TURN_ERROR" ||
    typeof failure.codexErrorInfo !== "string" ||
    !/^[A-Za-z0-9._:/-]{1,160}$/.test(failure.codexErrorInfo) ||
    failure.category !== failure.codexErrorInfo
  ) {
    throw new Error("Durable terminal failure result binding is invalid")
  }
  return run
}

async function reconcileTerminalFailureQueueCompletion({
  claimStore,
  issueClaim,
  state,
  store,
}) {
  const run = terminalDurableResultRun(state)
  if (
    !run ||
    (typeof claimStore.completeClaimFromDurableTerminalResult !== "function" &&
      typeof claimStore.completeClaimFromDurableTerminalFailure !== "function")
  ) {
    return null
  }
  const complete =
    claimStore.completeClaimFromDurableTerminalResult?.bind(claimStore) ??
    claimStore.completeClaimFromDurableTerminalFailure.bind(claimStore)
  const result = await complete(
    {
      instructionId: run.instructionId,
      originIssueNumber: state.task.originIssueNumber,
      originIssueUrl: state.task.originIssueUrl,
      resultStatus: run.status,
    },
    { issueClaim },
  )
  if (result.completed) {
    await store.appendEventOnce(
      `queue_completion_reconciled:${run.instructionId}`,
      {
        type: "queue_completion_reconciled",
        instructionId: run.instructionId,
        issueNumber: state.task.originIssueNumber,
        resultStatus: run.status,
      },
    )
  }
  return result
}

export async function reconcilePendingInstructionSupersession({
  state,
  task,
  store,
  claimStore,
  issueClaim,
}) {
  if (!issueClaim) return { status: "issue_claim_required" }

  const candidate = selectInstructionSupersessionCandidate(
    task.issue,
    task.comments,
    state,
  )
  if (!candidate) {
    for (const record of state.instructionSupersessions ?? []) {
      for (const event of instructionSupersessionAuditEvents(record)) {
        await store.appendEventOnce(event.eventId, event)
      }
    }
    return { status: "none" }
  }

  const claimRecords = await claimStore.inspectInstructionClaims(
    {
      instructionIds: [candidate.instructionId, ...candidate.supersedes],
      originIssueNumber: state.task.originIssueNumber,
    },
    { issueClaim },
  )
  const decision = instructionSupersessionDecision({
    issue: task.issue,
    comments: task.comments,
    state,
    supersedingInstruction: candidate,
    claimRecords,
  })
  if (!decision.accepted) {
    return {
      status: "rejected",
      supersedingInstructionId: candidate.instructionId,
      rejection: decision.rejection,
    }
  }

  const priorStatus = state.status
  const record = decision.value.alreadyApplied
    ? decision.value.record
    : recordInstructionSupersession(state, decision.value)
  if (!decision.value.alreadyApplied) {
    await store.save(state)
    if (
      state.stateRevision !== record.committedStateRevision ||
      state.status !== priorStatus
    ) {
      throw new Error("Instruction supersession state commit drifted")
    }
  }
  for (const event of instructionSupersessionAuditEvents(record)) {
    await store.appendEventOnce(event.eventId, event)
  }
  return {
    status: decision.value.alreadyApplied ? "reconciled" : "applied",
    supersessionId: record.supersessionId,
    supersedingInstructionId: record.supersedingInstructionId,
    supersededInstructionIds: record.supersededInstructionIds,
    stateRevision: state.stateRevision,
  }
}

export async function reconcileTerminalCloseout({
  state,
  task,
  store,
  claimStore,
  issueClaim,
}) {
  if (!issueClaim) return { status: "issue_claim_required" }
  const candidate = selectTerminalCloseoutCandidate(
    task.issue,
    task.comments,
    state,
  )
  if (!candidate) return { status: "none" }

  const controls = listAgentControls(task.issue, task.comments)
  const instructionIds = [...new Set(controls.map((control) => control.instructionId))]
  const claimRecords =
    state.status === "done"
      ? {}
      : await claimStore.inspectInstructionClaims(
          {
            instructionIds,
            originIssueNumber: state.task.originIssueNumber,
          },
          { issueClaim },
        )
  const decision = terminalCloseoutDecision({
    issue: task.issue,
    comments: task.comments,
    state,
    closeoutInstruction: candidate,
    claimRecords,
  })
  if (!decision.accepted) {
    return {
      status: "rejected",
      closeoutInstructionId: candidate.instructionId,
      rejection: decision.rejection,
    }
  }
  const record = decision.value.alreadyApplied
    ? decision.value.record
    : recordTerminalCloseout(state, decision.value)
  if (!decision.value.alreadyApplied) {
    await store.save(state)
    if (
      state.stateRevision !== record.committedStateRevision ||
      state.status !== "done" ||
      state.task.originIssueClosed !== true
    ) {
      throw new Error("Terminal closeout state commit drifted")
    }
  }
  for (const event of terminalCloseoutAuditEvents(record)) {
    await store.appendEventOnce(event.eventId, event)
  }
  return {
    status: decision.value.alreadyApplied ? "reconciled" : "applied",
    closeoutId: record.closeoutId,
    closeoutInstructionId: record.closeoutInstructionId,
    stateRevision: record.committedStateRevision,
    retiredInstructionIds: record.retiredInstructionIds,
    approvalKeys: record.approvalTombstones.map((approval) => approval.key),
  }
}

export async function reconcilePersistedTerminalCloseoutAudits(
  config,
  { StateStoreClass = StateStore } = {},
) {
  const prefix = `${config.repository.replaceAll("/", "-")}-issue-`
  let entries
  try {
    entries = await readdir(config.stateDirectory, { withFileTypes: true })
  } catch (error) {
    if (error.code === "ENOENT") return []
    throw error
  }
  const reconciled = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(prefix)) continue
    const issueNumber = Number.parseInt(entry.name.slice(prefix.length), 10)
    if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) continue
    let state
    try {
      state = JSON.parse(
        await readFile(
          path.join(config.stateDirectory, entry.name, "state.json"),
          "utf8",
        ),
      )
    } catch (error) {
      if (error.code === "ENOENT" || error.name === "SyntaxError") continue
      throw error
    }
    if (
      state.status !== "done" ||
      state.task?.originIssueNumber !== issueNumber ||
      !Array.isArray(state.terminalCloseouts) ||
      state.terminalCloseouts.length === 0
    ) {
      continue
    }
    const store = new StateStoreClass({
      stateDirectory: config.stateDirectory,
      repository: config.repository,
      issueNumber,
    })
    for (const record of state.terminalCloseouts) {
      validateTerminalCloseoutRecord(record, { state })
      for (const event of terminalCloseoutAuditEvents(record)) {
        await store.appendEventOnce(event.eventId, event)
      }
    }
    reconciled.push(issueNumber)
  }
  return reconciled
}

function unwrap(result, operation) {
  if (!result || result.isError) {
    throw new Error(`${operation} failed through the connected GitHub app`)
  }
  const content = result.structuredContent ?? {}
  return content.result ?? content
}

function writeJson(write, value) {
  write(`${JSON.stringify(redactForLog(value))}\n`)
}

async function stopScanner(scanner) {
  if (!scanner?.appServer) return
  await scanner.appServer.stop()
}

async function waitForNextCycle(milliseconds, signal, sleep) {
  try {
    await sleep(milliseconds, undefined, { signal })
  } catch (error) {
    if (error.name !== "AbortError") throw error
  }
}

export async function reconcileServiceTransition(
  config,
  {
    serviceLabel = process.env.XPC_SERVICE_NAME ?? null,
    orchestratorScript = process.argv[1] ?? null,
    workingDirectory = process.cwd(),
    StateStoreClass = StateStore,
  } = {},
) {
  if (
    serviceLabel !== launchAgentLabel ||
    !config.stateDirectory ||
    !config.checkoutPath ||
    workingDirectory !== config.checkoutPath
  ) {
    return null
  }
  const runtimeDirectory = path.join(config.stateDirectory, "runtime")
  if (
    !String(orchestratorScript ?? "").startsWith(
      `${runtimeDirectory}/releases/`,
    )
  ) {
    return null
  }
  const store = new StateStoreClass({
    stateDirectory: config.stateDirectory,
    repository: config.repository,
    issueNumber: 53,
  })
  const state = await store.load()
  const completion = reconcileLaunchAgentApproval({
    state,
    serviceLabel,
    expectedServiceLabel: launchAgentLabel,
    orchestratorScript,
    runtimeDirectory,
    checkoutPath: config.checkoutPath,
    workingDirectory,
  })
  if (!completion?.cleared) return null
  if (
    state.pendingOwnerRequest?.reason === completion.pending?.reason
  ) {
    state.pendingOwnerRequest = null
  }
  await store.save(state)
  await store.appendEvent({
    type: "owner_approved_action_reconciled",
    decisionId: completion.decision.decisionId,
    pendingRequestKey: completion.decision.pendingRequestKey,
    serviceLabel,
    orchestratorScript,
    checkoutPath: config.checkoutPath,
  })
  return completion
}

export async function createRepositoryScanner(config) {
  const appServer = new AppServerClient({
    binary: config.codexBinary,
    cwd: config.checkoutPath,
  })
  await appServer.start()
  const response = await appServer.startThread({
    cwd: config.checkoutPath,
    approvalPolicy: "never",
    sandbox: "read-only",
    ephemeral: true,
    serviceName: "koalafrog_repository_control_plane",
    threadSource: "appServer",
  })
  const threadId = response.thread.id
  await appServer.waitForMcpReady(threadId)
  return { appServer, threadId }
}

export async function searchOpenIssueCandidates(scanner, config) {
  const result = await scanner.appServer.callMcpTool({
    threadId: scanner.threadId,
    server: "codex_apps",
    tool: "github.search_issues",
    arguments: {
      query: `repo:${config.repository} is:issue is:open agent_control in:body`,
      repository_full_name: config.repository,
      sort: "created",
      order: "asc",
      topn: config.discoveryLimit,
    },
  })
  return discoverIssueCandidates(unwrap(result, "Search repository issues"))
}

export async function discoverPersistedIssueCandidates(config) {
  const prefix = `${config.repository.replaceAll("/", "-")}-issue-`
  let entries
  try {
    entries = await readdir(config.stateDirectory, { withFileTypes: true })
  } catch (error) {
    if (error.code === "ENOENT") return []
    throw error
  }
  const issueEntries = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => ({
      entry,
      issueNumber: Number.parseInt(entry.name.slice(prefix.length), 10),
    }))
    .filter(({ issueNumber }) => Number.isSafeInteger(issueNumber) && issueNumber > 0)
    .sort((left, right) => left.issueNumber - right.issueNumber)
  const candidates = await Promise.all(
    issueEntries.map(async ({ entry, issueNumber }) => {
      let task = null
      try {
        task = JSON.parse(
          await readFile(
            path.join(config.stateDirectory, entry.name, "state.json"),
            "utf8",
          ),
        ).task
      } catch (error) {
        if (error.code !== "ENOENT" && error.name !== "SyntaxError") throw error
      }
      if (task?.originIssueClosed) return null
      return {
        issueNumber,
        issueUrl: task?.originIssueUrl ?? null,
        createdAt: null,
        updatedAt: task?.lastObservedIssueUpdatedAt ?? null,
        searchMatched: false,
      }
    }),
  )
  return candidates.filter(Boolean)
}

export function mergeIssueCandidates(...candidateLists) {
  const merged = new Map()
  for (const candidate of candidateLists.flat()) {
    const existing = merged.get(candidate.issueNumber)
    merged.set(candidate.issueNumber, {
      issueNumber: candidate.issueNumber,
      issueUrl: candidate.issueUrl ?? existing?.issueUrl ?? null,
      createdAt: candidate.createdAt ?? existing?.createdAt ?? null,
      updatedAt: candidate.updatedAt ?? existing?.updatedAt ?? null,
      searchMatched: Boolean(
        candidate.searchMatched || existing?.searchMatched,
      ),
    })
  }
  return [...merged.values()].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt ?? "")
    const rightTime = Date.parse(right.createdAt ?? "")
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
      if (leftTime !== rightTime) return leftTime - rightTime
    } else if (Number.isFinite(leftTime)) {
      return -1
    } else if (Number.isFinite(rightTime)) {
      return 1
    }
    return left.issueNumber - right.issueNumber
  })
}

export async function runRepositoryIssue(
  scanner,
  baseConfig,
  candidate,
  {
    OrchestratorClass = Orchestrator,
    recoverCheckpointActivation = recoverCompletedCheckpointActivation,
    claimStore = new QueueClaimStore({
      stateDirectory: baseConfig.stateDirectory,
      retryBaseMs: baseConfig.retryBaseMs,
    }),
    StateStoreClass = StateStore,
  } = {},
) {
  const issueNumber = candidate.issueNumber ?? candidate
  const store = new StateStoreClass({
    stateDirectory: baseConfig.stateDirectory,
    repository: baseConfig.repository,
    issueNumber,
  })
  const state = await store.load()
  if (
    !state.activeInstruction &&
    !commentContinuationStates.has(state.status) &&
    candidate.searchMatched &&
    candidate.updatedAt &&
    candidate.updatedAt === state.task.lastObservedIssueUpdatedAt
  ) {
    return { issueNumber, status: "unchanged", claimed: false }
  }
  const controlPlane = new GithubControlPlane({
    appServer: scanner.appServer,
    threadId: scanner.threadId,
    repository: baseConfig.repository,
    issueNumber,
  })
  // Terminal closeout must bind its closed-issue/control read while holding the
  // issue lease. Normal polls retain their existing pre-lease fetch ordering;
  // after waiting for the lease they reload durable state and a terminal CAS
  // always wins before selection.
  const preClaimTask = baseConfig.terminalCloseout
    ? null
    : await controlPlane.fetchTask()
  const issueClaim = await claimStore.withIssueClaim(
    { originIssueNumber: issueNumber },
    async (claimedIssue) => {
      const task = preClaimTask ?? (await controlPlane.fetchTask())
      const observation = {
        issueNumber,
        issueUrl:
          task.issue?.html_url ??
          task.issue?.display_url ??
          task.issue?.url ??
          candidate.issueUrl ??
          null,
        updatedAt:
          task.issue?.updated_at ?? task.issue?.updatedAt ?? candidate.updatedAt,
        closed: task.issue?.state === "closed",
      }
      const currentState = await store.load()
      const observedAt = Date.parse(observation.updatedAt ?? "")
      const durableObservedAt = Date.parse(
        currentState.task.lastObservedIssueUpdatedAt ?? "",
      )
      if (
        Number.isFinite(observedAt) &&
        Number.isFinite(durableObservedAt) &&
        observedAt < durableObservedAt
      ) {
        await store.appendEvent({
          type: "repository_issue_observation_deferred",
          code: "stale_issue_observation",
          issueNumber,
        })
        return {
          issueNumber,
          status: "stale_issue_observation",
          claimed: false,
        }
      }

      if (baseConfig.terminalCloseout) {
        const closeout = await reconcileTerminalCloseout({
          state: currentState,
          task,
          store,
          claimStore,
          issueClaim: claimedIssue,
        })
        if (closeout.status === "rejected") {
          return {
            issueNumber,
            instructionId: closeout.closeoutInstructionId,
            status: "terminal_closeout_rejected",
            rejectionCode: closeout.rejection.code,
            claimed: false,
          }
        }
        if (closeout.status === "none") {
          return {
            issueNumber,
            status: "no_terminal_closeout_control",
            claimed: false,
          }
        }
        return {
          issueNumber,
          originIssueUrl: currentState.task.originIssueUrl,
          status: "done",
          closeoutStatus: closeout.status,
          closeoutId: closeout.closeoutId,
          instructionId: closeout.closeoutInstructionId,
          retiredInstructionIds: closeout.retiredInstructionIds,
          approvalKeys: closeout.approvalKeys,
          claimed: closeout.status === "applied",
        }
      }

      if (currentState.status === "done") {
        return { issueNumber, status: "done", claimed: false }
      }
      recordIssueObservation(currentState, observation)
      if (task.issue?.state === "closed") {
        await store.save(currentState)
        return { issueNumber, status: "closed", claimed: false }
      }
      if (isPullRequest(task.issue)) {
        await store.save(currentState)
        return { issueNumber, status: "pull_request_ignored", claimed: false }
      }

      const queueCompletion =
        await reconcileTerminalFailureQueueCompletion({
          claimStore,
          issueClaim: claimedIssue,
          state: currentState,
          store,
        })
      if (
        queueCompletion &&
        !queueCompletion.completed &&
        !new Set(["already_completed", "claim_missing"]).has(
          queueCompletion.reason,
        )
      ) {
        return {
          issueNumber,
          instructionId: currentState.lastConsumedInstructionId,
          status: "queue_completion_deferred",
          reason: queueCompletion.reason,
          claimed: false,
        }
      }

      const supersession = await reconcilePendingInstructionSupersession({
        state: currentState,
        task,
        store,
        claimStore,
        issueClaim: claimedIssue,
      })
      if (supersession.status === "rejected") {
        return {
          issueNumber,
          instructionId: supersession.supersedingInstructionId,
          status: "instruction_supersession_rejected",
          rejectionCode: supersession.rejection.code,
          claimed: false,
        }
      }

      const reconciledInstructionId =
        new Set(["applied", "reconciled"]).has(supersession.status)
          ? supersession.supersedingInstructionId
          : null
      requireInstructionSupersessionReconciliation({
        issue: task.issue,
        comments: task.comments,
        state: currentState,
        reconciledInstructionId,
      })
      const selection = durableTaskInstructionDecision({
        state: currentState,
        task,
        recover: recoverCheckpointActivation,
      })
      const recovery = selection.recoveryDiscovery?.decision ?? null
      const instruction = selection.selectedInstruction
      if (!instruction) {
        await store.save(currentState)
        if (
          selection.recoveryDiscovery?.applicable &&
          !selection.recoveryDiscovery.terminal &&
          recovery &&
          !recovery.accepted
        ) {
          await store.appendEvent({
            type: "checkpoint_activation_recovery_discovery_rejected",
            code: recovery.rejection?.code ??
              "checkpoint_activation_recovery_discovery_rejected",
            instructionId: currentState.lastConsumedInstructionId,
            issueNumber,
          })
          return {
            issueNumber,
            instructionId: currentState.lastConsumedInstructionId,
            status: "checkpoint_activation_recovery_rejected",
            rejectionCode: recovery.rejection?.code ?? null,
            claimed: false,
          }
        }
        return {
          issueNumber,
          status: "no_pending_agent_control",
          claimed: false,
        }
      }
      if (!isInstructionEligible(instruction)) {
        await store.save(currentState)
        return {
          issueNumber,
          instructionId: instruction.instructionId,
          status: "ineligible_agent_control_state",
          claimed: false,
        }
      }

      const claim = await claimStore.withClaim(
        {
          instructionId: instruction.instructionId,
          originIssueNumber: issueNumber,
          originIssueUrl:
            task.issue?.html_url ??
            task.issue?.display_url ??
            task.issue?.url ??
            candidate.issueUrl ??
            null,
          retryAuthorizationId: retryAuthorizationId({
            state: currentState,
            instruction,
            recovery,
          }),
        },
        async () => {
          const orchestrator = new OrchestratorClass(
            {
              ...baseConfig,
              command: "once",
              issueNumber,
              instructionSupersessionReconciledInstructionId:
                reconciledInstructionId,
            },
            { controlPlane, store },
          )
          try {
            const value = await orchestrator.runOnce({
              task,
              expectedInstructionId: instruction.instructionId,
            })
            const completedState = await store.load()
            recordIssueObservation(completedState, observation)
            await store.save(completedState)
            return value
          } finally {
            await orchestrator.stop()
          }
        },
        { issueClaim: claimedIssue },
      )
      if (!claim.claimed) {
        if (recovery?.accepted) {
          await store.appendEvent({
            type: "checkpoint_activation_recovery_discovery_deferred",
            code: claim.reason,
            instructionId: instruction.instructionId,
            issueNumber,
          })
        }
        return {
          issueNumber,
          instructionId: instruction.instructionId,
          status: claim.reason,
          claimed: false,
          ...(claim.nextEligibleAt
            ? { nextEligibleAt: claim.nextEligibleAt }
            : {}),
        }
      }
      return {
        issueNumber,
        originIssueUrl:
          task.issue?.html_url ??
          task.issue?.display_url ??
          task.issue?.url ??
          candidate.issueUrl ??
          null,
        ...claim.value,
        claimed: !new Set(["claim_deferred", "queue_changed"]).has(
          claim.value?.status,
        ),
      }
    },
  )
  return issueClaim.claimed
    ? issueClaim.value
    : { issueNumber, status: issueClaim.reason, claimed: false }
}

export async function runRepositoryCycle(
  scanner,
  config,
  {
    search = searchOpenIssueCandidates,
    discoverPersisted = discoverPersistedIssueCandidates,
    runIssue = runRepositoryIssue,
    reconcileTerminalAudits = reconcilePersistedTerminalCloseoutAudits,
    claimStore = new QueueClaimStore({
      stateDirectory: config.stateDirectory,
      retryBaseMs: config.retryBaseMs,
    }),
  } = {},
) {
  if (config.repository && config.stateDirectory) {
    await reconcileTerminalAudits(config)
  }
  const candidates = config.issueNumberExplicit
    ? [
        {
          issueNumber: config.issueNumber,
          issueUrl: null,
          createdAt: null,
          updatedAt: null,
          searchMatched: false,
        },
      ]
    : mergeIssueCandidates(
        await search(scanner, config),
        await discoverPersisted(config),
      )
  const results = []
  let claimedCount = 0
  for (const candidate of candidates) {
    if (claimedCount >= config.maxTasksPerPoll) break
    try {
      const result = await runIssue(scanner, config, candidate, { claimStore })
      results.push(result)
      if (result.claimed) claimedCount += 1
    } catch (error) {
      results.push({
        issueNumber: candidate.issueNumber,
        status: "failed",
        error: error.message,
      })
    }
  }
  return results
}

export async function runRepositoryOnce(
  config,
  {
    createScanner = createRepositoryScanner,
    runCycle = runRepositoryCycle,
    reconcile = reconcileServiceTransition,
  } = {},
) {
  await reconcile(config)
  const scanner = await createScanner(config)
  try {
    return await runCycle(scanner, config)
  } finally {
    await stopScanner(scanner)
  }
}

export async function watchRepository(
  config,
  {
    signal,
    createScanner = createRepositoryScanner,
    runCycle = runRepositoryCycle,
    reconcile = reconcileServiceTransition,
    sleep = delay,
    write = (line) => process.stdout.write(line),
  } = {},
) {
  let scanner = null
  await reconcile(config)
  writeJson(write, {
    event: "repository_watch_started",
    pid: process.pid,
    repository: config.repository,
    pollMs: config.pollMs,
  })

  try {
    while (!signal?.aborted) {
      try {
        scanner ??= await createScanner(config)
        const results = await runCycle(scanner, config)
        writeJson(write, {
          event: "repository_poll_completed",
          results,
        })
        await waitForNextCycle(config.pollMs, signal, sleep)
      } catch (error) {
        writeJson(write, {
          event: "repository_poll_failed",
          error: error.message,
        })
        try {
          await stopScanner(scanner)
        } catch (stopError) {
          writeJson(write, {
            event: "repository_scanner_stop_failed",
            error: stopError.message,
          })
        }
        scanner = null
        await waitForNextCycle(
          Math.min(config.retryBaseMs, config.pollMs),
          signal,
          sleep,
        )
      }
    }
  } finally {
    await stopScanner(scanner)
  }
}
