import { extractAgentControls } from "./control-plane.mjs"

export function extractIssueNumber(issue) {
  const direct = issue?.issue_number ?? issue?.number
  if (Number.isSafeInteger(direct) && direct > 0) return direct

  const url = issue?.url ?? issue?.html_url ?? issue?.display_url ?? ""
  const match = String(url).match(/\/issues\/(\d+)(?:$|[?#/])/)
  return match ? Number.parseInt(match[1], 10) : null
}

export function issueContainsAgentControl(issue) {
  return extractAgentControls(issue?.body ?? "").length > 0
}

export function discoverIssueNumbers(searchPayload) {
  const root = searchPayload?.result ?? searchPayload ?? {}
  const candidates = root.results ?? root.issues ?? root.items ?? []
  const numbers = []
  const seen = new Set()

  for (const issue of candidates) {
    const number = extractIssueNumber(issue)
    if (!number || seen.has(number)) continue
    seen.add(number)
    numbers.push(number)
  }
  return numbers
}
