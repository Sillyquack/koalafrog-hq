import { describe, expect, it } from 'vitest'
import { buildIntelligenceContext } from './contextBuilder'
import { executeIntelligencePipeline } from './intelligencePipeline'
import { defaultAgents } from '../Agents/mockAgents'
import { changeDetection, growthEstimation, personalBaseline } from '../History/trends'

describe('intelligence platform', () => {
  it('builds a complete immutable context at the shared boundary', () => {
    const source = { entityType: 'profile', entityId: 'p1', data: { name: 'Original' } }
    const context = buildIntelligenceContext({ workspace: { id: 'workspace-1' }, currentModule: 'beard-studio', relevantEntities: [source] })
    expect(context).toMatchObject({ currentModule: 'beard-studio', relevantEntities: [{ entityId: 'p1' }], historicalEntities: [], relatedImages: [], recentLogs: [], currentSelections: {}, userPreferences: {} })
    expect(Object.isFrozen(context)).toBe(true)
    expect(Object.isFrozen(context.relevantEntities[0].data)).toBe(true)
    expect(context.relevantEntities[0]).not.toBe(source)
  })

  it('routes configured module actions without mutating context', async () => {
    const context = buildIntelligenceContext({ workspace: {}, currentModule: 'beard-studio' })
    const result = await executeIntelligencePipeline(defaultAgents, context, { id: 'review', label: 'Review Symmetry', kind: 'Review' })
    expect(result.summary).toContain('No authoritative records were changed')
    expect(result.provenance).toBe('mock')
    expect(context.relevantEntities).toEqual([])
  })

  it('fails safely when no agent or provider is available', async () => {
    const context = buildIntelligenceContext({ workspace: {}, currentModule: 'beard-studio' })
    await expect(executeIntelligencePipeline([], context, { id: 'analyze', label: 'Analyze Beard', kind: 'Analyze' }))
      .rejects.toThrow('No intelligence agent supports Analyze Beard in beard-studio.')
  })

  it('provides reusable trend calculations', () => {
    const points = [{ timestamp: '2026-01-01', value: 4 }, { timestamp: '2026-01-03', value: 8 }]
    expect(growthEstimation(points)).toBe(2)
    expect(personalBaseline(points)).toBe(6)
    expect(changeDetection(points)).toHaveLength(1)
  })
})
