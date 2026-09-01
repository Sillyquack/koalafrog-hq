import { setTimeout as delay } from "node:timers/promises"
import { readdir, readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import path from "node:path"
import { promisify } from "node:util"
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
  currentStateSchemaVersion,
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
import {
  activeInstructionQuarantines,
  checkpointRecoveryRejectionDecision,
  createInstructionQuarantineRecord,
  filterPersistentCandidates,
  preflightRawTaskSchemas,
  quarantineAuditEvent,
  recordInstructionQuarantine,
  recordQuarantineReopen,
  recordWatcherNotification,
  recordWatcherNotificationDelivery,
  serviceConfigurationDigest,
  validateWatcherIdentityShape,
  watcherIdentityDecision,
  watcherServiceProfile,
  WatcherCircuitBreaker,
  WatcherHealthStore,
  watcherNotificationComment,
} from "./watcher-v2.mjs"

installTaskThreadPolicy(AppServerClient)

const execFileAsync = promisify(execFile)

const commentContinuationStates = new Set([
  "needs_review",
  "needs_owner",
  "failed",
])

function taskLabelNames(issue) {
  return (issue?.labels ?? [])
    .map((label) => (typeof label === "string" ? label : label?.name))
    .filter((label) => typeof label === "string")
}

function persistentLiveLabelRequired(config, issueNumber) {
  return Boolean(
    config.command === "watch" &&
    !config.issueNumberExplicit &&
    !(config.issueAllowlist ?? []).includes(issueNumber) &&
    config.requiredLabel,
  )
}

export function persistentLiveEligibilityDecision(issue, config, issueNumber) {
  if (config.command !== "watch") {
    return { eligible: true, mechanism: "bounded" }
  }
  if (config.issueNumberExplicit && issueNumber === config.issueNumber) {
    return { eligible: true, mechanism: "exact_issue" }
  }
  if ((config.issueAllowlist ?? []).includes(issueNumber)) {
    return { eligible: true, mechanism: "allowlist" }
  }
  if (!config.requiredLabel) {
    return { eligible: false, mechanism: null, reason: "missing_opt_in" }
  }
  if (!issue || issue.state === "closed" || isPullRequest(issue)) {
    return { eligible: false, mechanism: null, reason: "issue_not_open" }
  }
  if (!taskLabelNames(issue).includes(config.requiredLabel)) {
    return { eligible: false, mechanism: null, reason: "live_label_absent" }
  }
  return { eligible: true, mechanism: "required_live_label" }
}

function watcherEligibilityLookupError(error, issueNumber) {
  const failure = new Error(
    `Unable to revalidate persistent eligibility for issue ${issueNumber}: ${error.message}`,
    { cause: error },
  )
  failure.code = "WATCHER_ELIGIBILITY_LOOKUP_FAILED"
  failure.issueNumber = issueNumber
  return failure
}

async function fetchWatcherIssue(controlPlane, issueNumber) {
  try {
    return await controlPlane.fetchIssue()
  } catch (error) {
    throw watcherEligibilityLookupError(error, issueNumber)
  }
}

async function fetchWatcherTask(controlPlane, issueNumber) {
  try {
    return await controlPlane.fetchTask()
  } catch (error) {
    throw watcherEligibilityLookupError(error, issueNumber)
  }
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return
  const error = new Error("Watcher shutdown requested")
  error.name = "AbortError"
  error.code = "WATCHER_SHUTDOWN"
  throw error
}

async function persistQueueQuarantine({
  store,
  queueRecord,
  instructionId,
}) {
  if (!queueRecord || queueRecord.status !== "quarantined") return null
  const state = await store.load()
  const existing = activeInstructionQuarantines(state).find(
    (record) => record.instructionId === instructionId,
  )
  if (existing) return existing
  const failureHistory = queueRecord.failureHistory ?? []
  const record = createInstructionQuarantineRecord({
    state,
    instructionId,
    failure: {
      failureClass: queueRecord.failureClass ?? "transient_instruction",
      errorDigest: queueRecord.normalizedErrorDigest,
    },
    attemptCount:
      queueRecord.legacyFailureCount ??
      queueRecord.failureCount ??
      queueRecord.attempt ??
      0,
    firstFailureAt:
      failureHistory[0]?.at ??
      queueRecord.claimedAt ??
      queueRecord.updatedAt,
    lastFailureAt:
      failureHistory.at(-1)?.at ??
      queueRecord.updatedAt ??
      queueRecord.quarantinedAt,
    exhaustedReason:
      queueRecord.retryPolicyExhaustedReason ?? "claim_retry_policy_exhausted",
    executionOccurred: Boolean(
      (state.runs ?? []).some(
        (run) => run.instructionId === instructionId && run.turnCount > 0,
      ) ||
        (state.activeInstruction?.instructionId === instructionId &&
          state.turnCount > 0),
    ),
    now: new Date(queueRecord.quarantinedAt ?? queueRecord.updatedAt),
  })
  const quarantine = recordInstructionQuarantine(state, record)
  const notification = recordWatcherNotification(state, {
    kind: "quarantine",
    quarantineId: record.quarantineId,
    instructionId,
    errorDigest: record.normalizedErrorDigest,
    now: new Date(record.quarantinedAt),
  })
  if (quarantine.appended || notification.appended) await store.save(state)
  if (quarantine.appended) {
    const event = quarantineAuditEvent(record)
    await store.appendEventOnce(event.eventId, event)
  }
  if (notification.appended) {
    await store.appendEventOnce(notification.record.notificationId, {
      type: "watcher_owner_notification_pending",
      ...notification.record,
    })
  }
  return record
}

async function persistThirdFailureWarning({ store, queueRecord, instructionId }) {
  if (queueRecord?.notificationKind !== "third_failure_warning") return null
  const state = await store.load()
  const notification = recordWatcherNotification(state, {
    kind: "third_failure_warning",
    instructionId,
    errorDigest: queueRecord.normalizedErrorDigest,
    now: new Date(queueRecord.updatedAt),
  })
  if (!notification.appended) return notification.record
  await store.save(state)
  await store.appendEventOnce(notification.record.notificationId, {
    type: "watcher_owner_notification_pending",
    ...notification.record,
  })
  return notification.record
}

function commentIdentity(comment) {
  return comment?.id ?? comment?.databaseId ?? comment?.comment_id ?? null
}

async function reconcileWatcherNotifications({
  state,
  task,
  store,
  controlPlane,
}) {
  const delivered = new Set(
    (state.watcherNotificationDeliveries ?? []).map(
      (record) => record.notificationId,
    ),
  )
  const pending = (state.watcherNotifications ?? []).filter(
    (record) => !delivered.has(record.notificationId),
  )
  for (const notification of pending) {
    const marker = `koalafrog-watcher-notification:${notification.notificationId}`
    const existing = (task.comments ?? []).find((comment) =>
      String(comment?.body ?? "").includes(marker),
    )
    let commentId = commentIdentity(existing)
    let observedExisting = Boolean(existing)
    if (!existing) {
      const posted = await controlPlane.postComment(
        watcherNotificationComment(notification),
      )
      commentId = commentIdentity(posted?.comment ?? posted)
      observedExisting = false
    }
    const delivery = recordWatcherNotificationDelivery(state, {
      notificationId: notification.notificationId,
      commentId,
      observedExisting,
    })
    if (delivery.appended) {
      await store.save(state)
      await store.appendEventOnce(delivery.record.deliveryId, {
        type: "watcher_owner_notification_delivered",
        ...delivery.record,
      })
    }
  }
}

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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

async function defaultGitIdentity(checkoutPath, args) {
  const result = await execFileAsync("git", args, {
    cwd: checkoutPath,
    encoding: "utf8",
  })
  return result.stdout.trim()
}

export async function inspectWatcherStartupIdentity(
  config,
  {
    orchestratorScript = process.argv[1] ?? null,
    read = readFile,
    gitIdentity = defaultGitIdentity,
  } = {},
) {
  const releaseDirectory = path.dirname(path.dirname(orchestratorScript ?? ""))
  const manifestPath = path.join(releaseDirectory, "manifest.json")
  const manifestContents = await read(manifestPath)
  const manifest = JSON.parse(manifestContents.toString("utf8"))
  const observed = validateWatcherIdentityShape({
    runtimeRelease: path.basename(releaseDirectory),
    manifestSha256: sha256(manifestContents),
    sourceCommit: await gitIdentity(config.checkoutPath, ["rev-parse", "HEAD"]),
    sourceTree: await gitIdentity(config.checkoutPath, ["rev-parse", "HEAD^{tree}"]),
    repository: config.repository,
    coordinatorCheckout: config.checkoutPath
      ? path.resolve(config.checkoutPath)
      : null,
    serviceConfigSha256: config.expectedServiceConfigSha256,
  })
  if (
    manifest.digest !== observed.runtimeRelease ||
    manifest.source?.commit &&
      manifest.source.commit !== observed.sourceCommit ||
    manifest.source?.tree && manifest.source.tree !== observed.sourceTree
  ) {
    throw new Error("Runtime manifest source identity conflicts with startup")
  }
  return observed
}

export async function verifyWatcherStartupIdentity(config, dependencies = {}) {
  if (config.unsafeDevelopmentWatch) return null
  const observed = await inspectWatcherStartupIdentity(config, dependencies)
  observed.serviceConfigSha256 = serviceConfigurationDigest(
    watcherServiceProfile(config),
  )
  const decision = watcherIdentityDecision(
    {
      runtimeRelease: config.expectedRuntimeRelease,
      manifestSha256: config.expectedManifestSha256,
      sourceCommit: config.expectedSourceCommit,
      sourceTree: config.expectedSourceTree,
      repository: config.repository,
      coordinatorCheckout: path.resolve(config.checkoutPath),
      serviceConfigSha256: config.expectedServiceConfigSha256,
    },
    observed,
  )
  if (!decision.accepted) {
    const error = new Error(`Watcher startup rejected: ${decision.code}`)
    error.code = "WATCHER_IDENTITY_MISMATCH"
    throw error
  }
  return decision.identity
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
  const labeled = []
  if (config.requiredLabel) {
    const result = await scanner.appServer.callMcpTool({
      threadId: scanner.threadId,
      server: "codex_apps",
      tool: "github.search_issues",
      arguments: {
        query: [
          `repo:${config.repository}`,
          "is:issue",
          "is:open",
          config.command === "watch" ? null : "agent_control in:body",
          `label:\"${config.requiredLabel}\"`,
        ]
          .filter(Boolean)
          .join(" "),
        repository_full_name: config.repository,
        sort: "created",
        order: "asc",
        topn: config.discoveryLimit,
      },
    })
    labeled.push(
      ...discoverIssueCandidates(unwrap(result, "Search repository issues"), {
        requiredLabel: config.requiredLabel,
        issueAllowlist: config.issueAllowlist ?? [],
        requireAgentControl: config.command !== "watch",
      }),
    )
  }

  const allowlisted = await Promise.all(
    [...new Set(config.issueAllowlist ?? [])].map(async (issueNumber) => {
      const controlPlane = new GithubControlPlane({
        appServer: scanner.appServer,
        threadId: scanner.threadId,
        repository: config.repository,
        issueNumber,
      })
      const issue = await controlPlane.fetchIssue()
      return discoverIssueCandidates(
        { items: [issue] },
        {
          issueAllowlist: [issueNumber],
          requireAgentControl: false,
        },
      )[0] ?? null
    }),
  )
  return mergeIssueCandidates(labeled, allowlisted.filter(Boolean))
}

export async function discoverPersistedIssueCandidates(
  config,
  { liveCandidates = [], readState = readFile } = {},
) {
  const prefix = `${config.repository.replaceAll("/", "-")}-issue-`
  let entries
  try {
    entries = await readdir(config.stateDirectory, { withFileTypes: true })
  } catch (error) {
    if (error.code === "ENOENT") return []
    throw error
  }
  const liveByIssue = new Map(
    liveCandidates.map((candidate) => [candidate.issueNumber, candidate]),
  )
  const issueEntries = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => ({
      entry,
      issueNumber: Number.parseInt(entry.name.slice(prefix.length), 10),
    }))
    .filter(({ issueNumber }) => Number.isSafeInteger(issueNumber) && issueNumber > 0)
    .filter(({ issueNumber }) => {
      if (config.command !== "watch") return true
      if (
        config.issueNumberExplicit &&
        issueNumber === config.issueNumber
      ) {
        return true
      }
      if ((config.issueAllowlist ?? []).includes(issueNumber)) return true
      const live = liveByIssue.get(issueNumber)
      return Boolean(
        config.requiredLabel &&
        live?.labels?.includes(config.requiredLabel),
      )
    })
    .sort((left, right) => left.issueNumber - right.issueNumber)
  const candidates = await Promise.all(
    issueEntries.map(async ({ entry, issueNumber }) => {
      let rawState = null
      try {
        rawState = JSON.parse(
          await readState(
            path.join(config.stateDirectory, entry.name, "state.json"),
            "utf8",
          ),
        )
      } catch (error) {
        if (error.code !== "ENOENT" && error.name !== "SyntaxError") throw error
      }
      const task = rawState?.task
      if (task?.originIssueClosed || rawState?.status === "done") return null
      const allowlisted = (config.issueAllowlist ?? []).includes(issueNumber)
      const exactIssue = Boolean(
        config.issueNumberExplicit && issueNumber === config.issueNumber,
      )
      const live = liveByIssue.get(issueNumber)
      const labels =
        config.command === "watch"
          ? live?.labels ?? []
          : Array.isArray(task?.originIssueLabels)
            ? task.originIssueLabels
            : []
      if (
        config.command === "watch" &&
        !allowlisted &&
        !exactIssue &&
        (!config.requiredLabel || !labels.includes(config.requiredLabel))
      ) {
        return null
      }
      const activeQuarantineCount = activeInstructionQuarantines(
        rawState ?? {},
      ).length
      return {
        issueNumber,
        issueUrl: task?.originIssueUrl ?? null,
        createdAt: null,
        updatedAt: task?.lastObservedIssueUpdatedAt ?? null,
        searchMatched: false,
        labels,
        claimable: activeQuarantineCount === 0,
        quarantineCount: activeQuarantineCount,
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
      labels: candidate.labels ?? existing?.labels ?? [],
      claimable:
        candidate.claimable !== false && existing?.claimable !== false,
      quarantineCount: Math.max(
        candidate.quarantineCount ?? 0,
        existing?.quarantineCount ?? 0,
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
    ControlPlaneClass = GithubControlPlane,
    recoverCheckpointActivation = recoverCompletedCheckpointActivation,
    claimStore = new QueueClaimStore({
      stateDirectory: baseConfig.stateDirectory,
      retryBaseMs: baseConfig.retryBaseMs,
      watcherV2: baseConfig.command === "watch",
    }),
    StateStoreClass = StateStore,
    signal = null,
    onActivity = async () => {},
  } = {},
) {
  throwIfAborted(signal)
  const issueNumber = candidate.issueNumber ?? candidate
  const controlPlane = new ControlPlaneClass({
    appServer: scanner.appServer,
    threadId: scanner.threadId,
    repository: baseConfig.repository,
    issueNumber,
  })
  const liveLabelRequired = persistentLiveLabelRequired(baseConfig, issueNumber)
  if (liveLabelRequired) {
    const liveIssue = await fetchWatcherIssue(controlPlane, issueNumber)
    const eligibility = persistentLiveEligibilityDecision(
      liveIssue,
      baseConfig,
      issueNumber,
    )
    if (!eligibility.eligible) {
      return {
        issueNumber,
        status: "persistent_opt_in_revoked",
        reason: eligibility.reason,
        claimed: false,
      }
    }
  }
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
  // Terminal closeout must bind its closed-issue/control read while holding the
  // issue lease. Normal polls retain their existing pre-lease fetch ordering;
  // after waiting for the lease they reload durable state and a terminal CAS
  // always wins before selection.
  const preClaimTask = baseConfig.terminalCloseout || liveLabelRequired
    ? null
    : baseConfig.command === "watch"
      ? await fetchWatcherTask(controlPlane, issueNumber)
      : await controlPlane.fetchTask()
  const issueClaim = await claimStore.withIssueClaim(
    { originIssueNumber: issueNumber },
    async (claimedIssue) => {
      const task =
        preClaimTask ??
        (baseConfig.command === "watch"
          ? await fetchWatcherTask(controlPlane, issueNumber)
          : await controlPlane.fetchTask())
      if (liveLabelRequired) {
        const eligibility = persistentLiveEligibilityDecision(
          task.issue,
          baseConfig,
          issueNumber,
        )
        if (!eligibility.eligible) {
          return {
            issueNumber,
            status: "persistent_opt_in_revoked",
            reason: eligibility.reason,
            claimed: false,
          }
        }
      }
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
        labels: taskLabelNames(task.issue),
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
      if (baseConfig.command === "watch") {
        await reconcileWatcherNotifications({
          state: currentState,
          task,
          store,
          controlPlane,
        })
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
        const alreadyQuarantined = activeInstructionQuarantines(currentState)
        if (alreadyQuarantined.length > 0) {
          return {
            issueNumber,
            status: "quarantined",
            quarantineIds: alreadyQuarantined.map(
              (record) => record.quarantineId,
            ),
            claimed: false,
          }
        }
        let checkpointRejection = null
        let checkpointQuarantine = null
        if (
          baseConfig.command === "watch" &&
          selection.recoveryDiscovery?.applicable &&
          !selection.recoveryDiscovery.terminal &&
          recovery &&
          !recovery.accepted &&
          currentState.lastConsumedInstructionId
        ) {
          checkpointRejection = checkpointRecoveryRejectionDecision(
            currentState,
            {
              instructionId: currentState.lastConsumedInstructionId,
              rejectionCode:
                recovery.rejection?.code ??
                "checkpoint_activation_recovery_discovery_rejected",
              evidence: recovery.rejection ?? null,
            },
          )
          if (checkpointRejection.quarantine) {
            const record = createInstructionQuarantineRecord({
              state: currentState,
              instructionId: currentState.lastConsumedInstructionId,
              failure: {
                failureClass: "checkpoint_recovery_rejection",
                errorDigest: checkpointRejection.record.evidenceDigest,
              },
              attemptCount: checkpointRejection.record.sequence,
              firstFailureAt:
                currentState.checkpointRecoveryRejections[0]?.recordedAt,
              lastFailureAt: checkpointRejection.record.recordedAt,
              exhaustedReason: checkpointRejection.reason,
              executionOccurred: false,
              now: new Date(checkpointRejection.record.recordedAt),
            })
            checkpointQuarantine = recordInstructionQuarantine(
              currentState,
              record,
            )
            recordWatcherNotification(currentState, {
              kind: "quarantine",
              quarantineId: record.quarantineId,
              instructionId: record.instructionId,
              errorDigest: record.normalizedErrorDigest,
            })
          }
        }
        await store.save(currentState)
        if (checkpointRejection?.appended) {
          await store.appendEventOnce(
            checkpointRejection.record.rejectionId,
            {
              type: "checkpoint_recovery_rejection_recorded",
              ...checkpointRejection.record,
            },
          )
        }
        if (checkpointQuarantine?.appended) {
          const event = quarantineAuditEvent(checkpointQuarantine.record)
          await store.appendEventOnce(event.eventId, event)
        }
        const quarantines = activeInstructionQuarantines(currentState)
        if (quarantines.length > 0) {
          return {
            issueNumber,
            status: "quarantined",
            quarantineIds: quarantines.map((record) => record.quarantineId),
            claimed: false,
          }
        }
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

      if (liveLabelRequired) {
        const finalIssue = await fetchWatcherIssue(controlPlane, issueNumber)
        const eligibility = persistentLiveEligibilityDecision(
          finalIssue,
          baseConfig,
          issueNumber,
        )
        if (!eligibility.eligible) {
          return {
            issueNumber,
            instructionId: instruction.instructionId,
            status: "persistent_opt_in_revoked",
            reason: eligibility.reason,
            claimed: false,
          }
        }
      }

      await onActivity({
        activeIssue: issueNumber,
        activeInstruction: instruction.instructionId,
        activeClaim: "instruction_pending",
      })

      if (instruction.quarantineReopen) {
        const reopened = recordQuarantineReopen(currentState, instruction)
        if (!reopened.accepted) {
          return {
            issueNumber,
            instructionId: instruction.instructionId,
            status: "quarantine_reopen_rejected",
            rejectionCode: reopened.code,
            claimed: false,
          }
        }
        if (reopened.appended) {
          await store.save(currentState)
          await store.appendEventOnce(reopened.record.reopenId, {
            type: "instruction_quarantine_reopened",
            ...reopened.record,
          })
        }
      }

      throwIfAborted(signal)
      let claim
      try {
        claim = await claimStore.withClaim(
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
          throwIfAborted(signal)
          const orchestrator = new OrchestratorClass(
            {
              ...baseConfig,
              command: "once",
              persistentWatch: baseConfig.command === "watch",
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
              signal,
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
      } catch (error) {
        if (baseConfig.command === "watch" && error.queueRecord) {
          await persistThirdFailureWarning({
            store,
            queueRecord: error.queueRecord,
            instructionId: instruction.instructionId,
          })
          const quarantine = await persistQueueQuarantine({
            store,
            queueRecord: error.queueRecord,
            instructionId: instruction.instructionId,
          })
          if (quarantine) {
            return {
              issueNumber,
              instructionId: instruction.instructionId,
              status: "quarantined",
              quarantineId: quarantine.quarantineId,
              claimed: false,
            }
          }
        }
        throw error
      }
      if (!claim.claimed) {
        if (claim.quarantineRecord) {
          const quarantine = await persistQueueQuarantine({
            store,
            queueRecord: claim.quarantineRecord,
            instructionId: instruction.instructionId,
          })
          return {
            issueNumber,
            instructionId: instruction.instructionId,
            status: "quarantined",
            quarantineId: quarantine?.quarantineId ?? null,
            claimed: false,
          }
        }
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
      watcherV2: config.command === "watch",
    }),
    signal = null,
    rawSchemaPreflight = preflightRawTaskSchemas,
    onActivity = async () => {},
  } = {},
) {
  throwIfAborted(signal)
  if (
    config.command !== "watch" &&
    config.repository &&
    config.stateDirectory
  ) {
    await reconcileTerminalAudits(config)
  }
  let discovered
  if (config.issueNumberExplicit) {
    discovered = [
      {
        issueNumber: config.issueNumber,
        issueUrl: null,
        createdAt: null,
        updatedAt: null,
        searchMatched: false,
      },
    ]
  } else {
    const liveCandidates = await search(scanner, config)
    discovered = mergeIssueCandidates(
      liveCandidates,
      await discoverPersisted(config, { liveCandidates }),
    )
  }
  const candidates = filterPersistentCandidates(discovered, config)
  if (config.command === "watch") {
    await rawSchemaPreflight(
      { ...config, supportedStateSchema: currentStateSchemaVersion },
      candidates,
    )
  }
  const results = []
  let claimedCount = 0
  for (const candidate of candidates) {
    throwIfAborted(signal)
    if (claimedCount >= config.maxTasksPerPoll) break
    try {
      await onActivity({
        activeIssue: candidate.issueNumber,
        activeInstruction: null,
        activeClaim: "issue_pending",
      })
      const result = await runIssue(scanner, config, candidate, {
        claimStore,
        signal,
        onActivity,
      })
      results.push(result)
      if (result.claimed) claimedCount += 1
    } catch (error) {
      if (
        error.name === "AbortError" ||
        error.code === "WATCHER_SHUTDOWN" ||
        error.code === "WATCHER_ELIGIBILITY_LOOKUP_FAILED"
      ) {
        throw error
      }
      results.push({
        issueNumber: candidate.issueNumber,
        status: "failed",
        error: error.message,
      })
    } finally {
      await onActivity({
        activeIssue: null,
        activeInstruction: null,
        activeClaim: null,
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
    verifyIdentity = verifyWatcherStartupIdentity,
    HealthStoreClass = WatcherHealthStore,
    circuitBreaker = new WatcherCircuitBreaker(),
  } = {},
) {
  let scanner = null
  let scannerStop = null
  const stopActiveScanner = async () => {
    const active = scanner
    scanner = null
    if (!active) return scannerStop
    scannerStop = Promise.resolve(stopScanner(active)).finally(() => {
      scannerStop = null
    })
    return scannerStop
  }
  const stopDiscoveryOnShutdown = () => {
    void stopActiveScanner()
  }
  signal?.addEventListener("abort", stopDiscoveryOnShutdown, { once: true })
  const identity =
    config.unsafeDevelopmentWatch === false
      ? await verifyIdentity(config)
      : null
  const health = config.healthPath
    ? new HealthStoreClass(config.healthPath)
    : { write: async (value) => value }
  const startupTimestamp = new Date().toISOString()
  const baseHealth = {
    runtimeRelease: identity?.runtimeRelease ?? null,
    manifestSha256: identity?.manifestSha256 ?? null,
    sourceCommit: identity?.sourceCommit ?? null,
    sourceTree: identity?.sourceTree ?? null,
    repository: config.repository,
    coordinatorCheckout: config.checkoutPath
      ? path.resolve(config.checkoutPath)
      : null,
    serviceConfigSha256: identity?.serviceConfigSha256 ?? null,
    servicePid: process.pid,
    startupTimestamp,
    schemaSupportLevel: currentStateSchemaVersion,
    requiredLabel: config.requiredLabel,
    issueAllowlist: config.issueAllowlist,
    canaryIssue: config.canaryMode ? config.issueNumber : null,
    autoCommit: false,
  }
  await health.write({
    ...baseHealth,
    state: "starting",
    lastPollStart: null,
    lastPollEnd: null,
    nextPoll: null,
    activeIssue: null,
    activeInstruction: null,
    activeClaim: null,
    quarantines: [],
    circuitBreaker: circuitBreaker.snapshot(),
    shutdown: { requested: false, inProgress: false },
  })
  writeJson(write, {
    event: "repository_watch_started",
    ...baseHealth,
    pollMs: config.pollMs,
  })

  try {
    while (!signal?.aborted) {
      const pollStartedAt = new Date().toISOString()
      try {
        scanner ??= await createScanner(config)
        const results = await runCycle(scanner, config, {
          signal,
          onActivity: async (activity) => {
            await health.write({
              ...baseHealth,
              state: activity.activeIssue ? "active" : "polling",
              lastPollStart: pollStartedAt,
              lastPollEnd: null,
              nextPoll: null,
              ...activity,
              quarantines: [],
              circuitBreaker: circuitBreaker.snapshot(),
              shutdown: { requested: false, inProgress: false },
            })
          },
        })
        circuitBreaker.success()
        const pollEndedAt = new Date().toISOString()
        const quarantines = results
          .filter((result) => result.status === "quarantined")
          .map((result) => ({
            issueNumber: result.issueNumber,
            instructionId: result.instructionId ?? null,
            quarantineId:
              result.quarantineId ?? result.quarantineIds?.[0] ?? null,
          }))
        await health.write({
          ...baseHealth,
          state: "idle",
          lastPollStart: pollStartedAt,
          lastPollEnd: pollEndedAt,
          nextPoll: new Date(Date.now() + config.pollMs).toISOString(),
          activeIssue: null,
          activeInstruction: null,
          activeClaim: null,
          quarantines,
          circuitBreaker: circuitBreaker.snapshot(),
          shutdown: { requested: false, inProgress: false },
        })
        writeJson(write, {
          event: "repository_poll_completed",
          results,
        })
        await waitForNextCycle(config.pollMs, signal, sleep)
      } catch (error) {
        if (error.name === "AbortError" || error.code === "WATCHER_SHUTDOWN") {
          break
        }
        if (error.code === "WATCHER_UNSUPPORTED_SCHEMA") {
          throw error
        }
        const breaker = circuitBreaker.fail(error)
        writeJson(write, {
          event: "repository_poll_failed",
          error: error.message,
          circuitBreaker: breaker,
        })
        try {
          await stopActiveScanner()
        } catch (stopError) {
          writeJson(write, {
            event: "repository_scanner_stop_failed",
            error: stopError.message,
          })
        }
        await health.write({
          ...baseHealth,
          state: "circuit_open",
          lastPollStart: pollStartedAt,
          lastPollEnd: new Date().toISOString(),
          nextPoll: breaker.nextProbeAt,
          activeIssue: null,
          activeInstruction: null,
          activeClaim: null,
          quarantines: [],
          circuitBreaker: breaker,
          shutdown: { requested: false, inProgress: false },
        })
        const breakerDelay = Math.max(
          0,
          Date.parse(breaker.nextProbeAt) - Date.now(),
        )
        await waitForNextCycle(
          breakerDelay,
          signal,
          sleep,
        )
      }
    }
  } finally {
    signal?.removeEventListener("abort", stopDiscoveryOnShutdown)
    await stopActiveScanner()
    await health.write({
      ...baseHealth,
      state: "stopped",
      lastPollStart: null,
      lastPollEnd: new Date().toISOString(),
      nextPoll: null,
      activeIssue: null,
      activeInstruction: null,
      activeClaim: null,
      quarantines: [],
      circuitBreaker: circuitBreaker.snapshot(),
      shutdown: {
        requested: Boolean(signal?.aborted),
        inProgress: false,
        reason: signal?.reason ?? null,
      },
    })
  }
}
