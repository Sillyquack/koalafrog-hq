import { IntelligencePanel } from '../../../intelligence/Actions/IntelligencePanel'
import type { IntelligenceAction } from '../../../intelligence/Actions/actions'
import { defaultAgents } from '../../../intelligence/Agents/mockAgents'
import { buildIntelligenceContext } from '../../../intelligence/Pipelines/contextBuilder'
import type { ContextEntity, IntelligenceResult } from '../../../intelligence/Shared/models'
import type { BeardStudioState } from '../../../types/beardStudio'
import { useActiveWorkspace } from '../../../platform/startup/ActiveWorkspaceContext'
import { BeardPhotoAnalysisFlow } from './BeardPhotoAnalysisFlow'
import { BeardAnalysisSupportLookup } from './BeardAnalysisSupportLookup'

const actions: readonly IntelligenceAction[] = [
  { id: 'analyze-beard', label: 'Analyze Beard', kind: 'Analyze', description: 'Review current profile and available records.' },
  { id: 'summarize-progress', label: 'Summarize Progress', kind: 'Summarize', description: 'Summarize the recorded grooming history.' },
  { id: 'recommend-next-trim', label: 'Recommend Next Trim', kind: 'Recommend', description: 'Suggest a next step for review.' },
  { id: 'estimate-growth', label: 'Estimate Growth', kind: 'Predict', description: 'Estimate from personal historical records.' },
  { id: 'compare-last-trim', label: 'Compare Last Trim', kind: 'Compare', description: 'Compare the latest two recorded trims.' },
  { id: 'review-symmetry', label: 'Review Symmetry', kind: 'Review', description: 'Review recorded symmetry information.' },
]

const entity = (entityType: string, entityId: string, label: string, data: object): ContextEntity => ({ entityType, entityId, label, data: data as Record<string, unknown> })

export function BeardIntelligencePanel({ state }: { state: BeardStudioState }) {
  const workspace = useActiveWorkspace()
  const profile = state.profiles.find(item => item.status === 'Active')
  const relevantEntities = profile ? [
    entity('beardProfile', profile.id, profile.name, profile),
    ...state.lengthMaps.filter(item => item.profileId === profile.id).map(item => entity('beardLengthMap', item.id, 'Active length map', item)),
    ...state.recipes.filter(item => item.profileId === profile.id && item.status === 'Active').map(item => entity('trimRecipe', item.id, item.name, item)),
  ] : []
  const logs = profile ? state.logs.filter(item => item.profileId === profile.id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)) : []
  const context = buildIntelligenceContext({
    workspace: { kind: 'private-owner-workspace', revision: state.revision },
    currentModule: 'beard-studio',
    relevantEntities,
    historicalEntities: logs.map(item => entity('beardLog', item.id, `Trim ${item.occurredAt}`, item)),
    recentLogs: logs.slice(0, 10).map(item => ({ id: item.id, occurredAt: item.occurredAt, message: `Trim rated ${item.overallRating} of 5`, entity: { entityType: 'beardLog', entityId: item.id } })),
    currentSelections: { profileId: profile?.id ?? null },
    userPreferences: { lengthUnit: 'mm' },
  })
  const development = import.meta.env.DEV
  return <><IntelligencePanel context={context} actions={actions} agents={development?defaultAgents:[]} initialResult={development?mockResult(logs.length):computedResult(logs.length)} title="Beard Intelligence"/><BeardAnalysisSupportLookup workspaceId={workspace?.workspaceId}/><BeardPhotoAnalysisFlow state={state} workspaceId={workspace?.workspaceId}/></>
}

function mockResult(logCount: number): IntelligenceResult {
  return { provenance: 'mock', summary: logCount ? `Demo / mocked output: ${logCount} recorded trim${logCount === 1 ? '' : 's'} available for progress analysis.` : 'Demo / mocked output: No trims recorded yet. Intelligence will become more personal as Beard Log history grows.', insights: [{ id: 'beard-history-ready', title: logCount ? 'Demo: personal history available' : 'Demo: baseline not established', description: logCount ? `${logCount} Beard Log records could support future comparisons and trend analysis.` : 'Record completed trims to establish a future personal baseline.', confidence: 1, severity: 'info', relatedEntities: [], createdAt: new Date().toISOString(), dismissed: false, resolved: false, sourceAgent: 'mock-history' }], recommendations: [] }
}
function computedResult(logCount:number):IntelligenceResult{return{provenance:'computed',summary:`${logCount} recorded trim${logCount===1?'':'s'} available. Photo analysis runs only through the separate consented workflow.`,insights:[],recommendations:[]}}
