import { extractValidAgentControls } from "./control-plane.mjs"

export function extractIssueNumber(issue) {
  const direct = issue?.issue_number ?? issue?.number
  if (Number.isSafeInteger(direct) && direct > 0) return direct

  const url = issue?.url ?? issue?.html_url ?? issue?.display_url ?? ""
  const match = String(url).match(/\/issues\/(\d+)(?:$|[?#/])/)
  return match ? Number.parseInt(match[1], 10) : null
}

export function issueContainsAgentControl(issue) {
  return extractValidAgentControls(issue?.body ?? "").length > 0
}

export function isPullRequest(issue) {
  const type = String(issue?.type ?? issue?.__typename ?? "").toLowerCase()
  const url = String(issue?.url ?? issue?.html_url ?? issue?.display_url ?? "")
  return Boolean(
    issue?.pull_request ||
      issue?.is_pull_request ||
      type === "pullrequest" ||
      /\/pulls?\/\d+(?:$|[?#/])/.test(url),
  )
}

export function discoverIssueCandidates(searchPayload) {
  const root = searchPayload?.result ?? searchPayload ?? {}
  const candidates = root.results ?? root.issues ?? root.items ?? []
  const issues = []
  const seen = new Set()

  for (const issue of candidates) {
    if (isPullRequest(issue)) continue
    if (
      typeof issue?.body === "string" &&
      !issueContainsAgentControl(issue)
    ) {
      continue
    }
    const number = extractIssueNumber(issue)
    if (!number || seen.has(number)) continue
    seen.add(number)
    issues.push({
      issueNumber: number,
      issueUrl:
        issue?.html_url ?? issue?.display_url ?? issue?.url ?? null,
      createdAt: issue?.created_at ?? issue?.createdAt ?? null,
      updatedAt: issue?.updated_at ?? issue?.updatedAt ?? null,
      searchMatched: true,
    })
  }
  return issues.sort((left, right) => {
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

export function discoverIssueNumbers(searchPayload) {
  return discoverIssueCandidates(searchPayload).map(
    (candidate) => candidate.issueNumber,
  )
}
