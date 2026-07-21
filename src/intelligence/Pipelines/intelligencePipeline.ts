import type { Agent } from '../Agents/Agent'
import { canAgentExecute } from '../Agents/Agent'
import type { IntelligenceAction } from '../Actions/actions'
import type { IntelligenceContext, IntelligenceResult } from '../Shared/models'

export async function executeIntelligencePipeline(agents: readonly Agent[], context: IntelligenceContext, action: IntelligenceAction): Promise<IntelligenceResult> {
  const agent = agents.find(candidate => canAgentExecute(candidate, { context, action }))
  if (!agent) throw new Error(`No intelligence agent supports ${action.label} in ${context.currentModule}.`)
  return agent.execute({ context, action })
}
