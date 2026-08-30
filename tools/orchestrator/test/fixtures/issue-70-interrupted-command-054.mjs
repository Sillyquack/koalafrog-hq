export const issue70OriginIssueNumber = 70
export const issue70OriginIssueUrl =
  "https://github.com/Sillyquack/koalafrog-hq/issues/70"
export const issue70InstructionId =
  "orchestrator-cooperative-local-process-model-finalization-054"
export const issue70ThreadId = "thread-issue-70-054"
export const issue70TurnId = "01a04480-b784-7f93-bdc2-da9a7abd7638"
export const issue70CommandItemId =
  "exec-ab448cf6-3f2e-4258-985c-f708bc8222c5"
export const issue70InterruptedAt = "2026-08-27T18:54:41.403Z"
export const issue70LastOutputAt = "2026-08-27T18:55:39.796Z"

function notification(at, method, fields = {}) {
  return {
    at,
    type: "notification",
    message: {
      method,
      threadId: issue70ThreadId,
      turnId: issue70TurnId,
      itemId: issue70CommandItemId,
      ...fields,
    },
  }
}

export function issue70InterruptedCommand054Events({
  includeProcessAbsence = true,
} = {}) {
  const events = [
    notification("2026-08-27T18:53:58.000Z", "item/started", {
      itemType: "commandExecution",
      itemStatus: "inProgress",
    }),
    notification(issue70InterruptedAt, "turn/completed", {
      itemId: null,
      status: "interrupted",
    }),
  ]
  for (let index = 0; index < 4; index += 1) {
    events.push(
      notification(
        new Date(Date.parse(issue70InterruptedAt) + 1_000 + index * 2_000)
          .toISOString(),
        "item/commandExecution/terminalInteraction",
      ),
    )
  }
  for (let index = 0; index < 9; index += 1) {
    events.push(
      notification(
        index === 8
          ? issue70LastOutputAt
          : new Date(Date.parse(issue70InterruptedAt) + 2_000 + index * 6_000)
              .toISOString(),
        "item/commandExecution/outputDelta",
        { deltaBytes: 64 + index },
      ),
    )
  }
  if (includeProcessAbsence) {
    events.push({
      at: "2026-08-27T19:02:00.000Z",
      type: "command_process_inspection",
      threadId: issue70ThreadId,
      turnId: issue70TurnId,
      itemId: issue70CommandItemId,
      processPresent: false,
    })
  }
  return events
}

export function issue70ReadbackWithCommand(status, exitCode = null) {
  return {
    thread: {
      id: issue70ThreadId,
      turns: [
        {
          id: issue70TurnId,
          status: "interrupted",
          items: [
            {
              id: issue70CommandItemId,
              type: "commandExecution",
              command: "node --test tools/orchestrator/test/*.node.mjs",
              status,
              ...(Number.isInteger(exitCode) ? { exitCode } : {}),
            },
          ],
        },
      ],
    },
  }
}
