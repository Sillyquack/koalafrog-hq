import type { LaunchDecision,ReadinessIssue } from '../../../types/domain'
export const launchComplianceBlockers=(issues:ReadinessIssue[])=>issues.filter(i=>i.status==='Open'&&i.severity==='Blocking')
export function recordDecision(history:LaunchDecision[],decision:LaunchDecision){return[...history,decision]}
