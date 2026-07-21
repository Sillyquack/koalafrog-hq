import type { IntelligenceAction } from '../Actions/actions'
import type { IntelligenceContext, IntelligenceResult } from '../Shared/models'

export interface AgentExecutionContext {
  context: IntelligenceContext
  action: IntelligenceAction
}

export interface Agent {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly supportedModules: readonly string[]
  readonly supportedActions: readonly IntelligenceAction['kind'][]
  execute(context: AgentExecutionContext): Promise<IntelligenceResult>
}

export function canAgentExecute(agent: Agent, context: AgentExecutionContext) {
  return (agent.supportedModules.includes('*') || agent.supportedModules.includes(context.context.currentModule))
    && agent.supportedActions.includes(context.action.kind)
}
