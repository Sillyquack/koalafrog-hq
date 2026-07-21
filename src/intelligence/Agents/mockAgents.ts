import type { Agent, AgentExecutionContext } from './Agent'
import type { IntelligenceResult } from '../Shared/models'

const now = () => new Date().toISOString()
const resultFor = (agentId: string, { context, action }: AgentExecutionContext): IntelligenceResult => {
  const first = context.relevantEntities[0]
  const related = first ? [{ entityType: first.entityType, entityId: first.entityId, label: first.label }] : []
  const observationId = `${agentId}-${action.id}-observation`
  const observation = {
    id: observationId,
    description: `${context.historicalEntities.length} historical records are available for this analysis.`,
    confidence: 1,
    relatedEntities: related,
    observedAt: now(),
    source: agentId,
  }
  return {
    provenance: 'mock',
    summary: `Demo / mocked output: ${action.label} is ready to use with the available ${context.currentModule} context. No authoritative records were changed.`,
    observations: [observation],
    insights: [{ id: `${agentId}-${action.id}-insight`, title: 'Context is ready for review', description: `${context.relevantEntities.length} current and ${context.historicalEntities.length} historical records were considered.`, confidence: .82, severity: 'info', relatedEntities: related, createdAt: now(), dismissed: false, resolved: false, sourceAgent: agentId }],
    recommendations: action.kind === 'Recommend' ? [{ id: `${agentId}-${action.id}-recommendation`, reason: 'Review the latest result before the next planned session.', confidence: .76, priority: 'medium', expectedBenefit: 'A more deliberate next iteration.', supportingObservations: [observationId], accepted: false, dismissed: false, sourceAgent: agentId, createdAt: now() }] : [],
  }
}

class MockAgent implements Agent {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly description: string,
    readonly supportedActions: Agent['supportedActions'],
    readonly supportedModules: readonly string[] = ['*'],
  ) {}
  async execute(context: AgentExecutionContext) {
    await new Promise(resolve => setTimeout(resolve, 150))
    return resultFor(this.id, context)
  }
}

export class BeardCoachAgent extends MockAgent { constructor() { super('beard-coach', 'Beard Coach', 'Interprets grooming context without changing Beard Studio records.', ['Analyze', 'Recommend', 'Summarize', 'Predict', 'Compare', 'Review'], ['beard-studio']) } }
export class VisionAgent extends MockAgent { constructor() { super('vision', 'Vision', 'Turns image analysis observations into structured intelligence.', ['Analyze', 'Compare', 'Review']) } }
export class InsightAgent extends MockAgent { constructor() { super('insight', 'Insight', 'Identifies noteworthy patterns in supplied observations.', ['Analyze', 'Compare', 'Review', 'Explain']) } }
export class RecommendationAgent extends MockAgent { constructor() { super('recommendation', 'Recommendation', 'Creates optional recommendations from observations and insights.', ['Recommend', 'Explain']) } }
export class HistoryAgent extends MockAgent { constructor() { super('history', 'History', 'Analyzes trends, changes and personal baselines.', ['Analyze', 'Predict', 'Compare', 'Summarize']) } }
export class SummaryAgent extends MockAgent { constructor() { super('summary', 'Summary', 'Produces concise summaries of supplied context.', ['Summarize', 'Explain']) } }

export const defaultAgents: readonly Agent[] = [new BeardCoachAgent(), new VisionAgent(), new InsightAgent(), new RecommendationAgent(), new HistoryAgent(), new SummaryAgent()]
