import { describe, expect, it } from 'vitest'
import {
  normalizeBeardPhotoRecommendationIds,
  validateBeardPhotoAnalysisResult,
  type BeardPhotoAnalysisResult,
} from '../supabase/functions/_shared/beardPhotoAnalysisContract'

const failedProviderFixture = (): BeardPhotoAnalysisResult => ({
  analysisId: '4d9e50b3-dda2-4c91-8c9f-d71c3f42a245',
  schemaVersion: 2,
  contractVersion: 'beard-photo-result-contract-v2',
  promptVersion: 'beard-photo-analysis-v4',
  provider: 'openai',
  model: 'configured-model',
  createdAt: '2026-07-26T10:00:00.000Z',
  provenance: 'ai',
  status: 'completed',
  photoQuality: {
    overall: 'suitable',
    perView: [
      { view: 'front', quality: 'suitable', issues: [] },
      { view: 'left_profile', quality: 'suitable', issues: [] },
      { view: 'right_profile', quality: 'suitable', issues: [] },
    ],
    issues: [],
    retakeRecommended: false,
  },
  observations: [{
    observationKey: 'front_density_distribution',
    category: 'density',
    statement: 'The front view appears visually even.',
    confidence: 0.8,
    supportingViews: ['front'],
    evidenceDescription: 'Visible in the supplied front view.',
    limitations: [],
    relatedBeardZones: [],
    provenance: 'ai',
  }],
  symmetry: [],
  densityDistribution: [],
  lineAssessment: [],
  recommendations: [{
    id: 'recommendation_1',
    title: 'Keep the next trim conservative',
    reason: 'The visible distribution does not suggest a large adjustment.',
    confidence: 0.7,
    priority: 'low',
    expectedBenefit: 'Preserve the current visual balance.',
    supportingObservationKeys: ['front_density_distribution'],
    affectedZones: [],
    toolConstraints: [],
    proposedGuardStrategy: null,
    status: 'undecided',
    provenance: 'ai',
  }],
  limitations: ['Photos cannot provide calibrated measurement.'],
  unknowns: [],
  safetyFlags: [],
  correlationId: '719465a3-9ba6-4bbc-90d2-36e2406b70bc',
})

describe('beard recommendation persistence boundary', () => {
  it('replaces the provider display id with a server-owned UUID', () => {
    const providerResult = failedProviderFixture()
    expect(validateBeardPhotoAnalysisResult(providerResult)).toBe(false)

    const normalized = normalizeBeardPhotoRecommendationIds(
      providerResult,
      () => 'a2257a31-3d8b-42d0-ad07-cf81e83e2b41',
    )

    expect(normalized.recommendations[0].id).toBe(
      'a2257a31-3d8b-42d0-ad07-cf81e83e2b41',
    )
    expect(validateBeardPhotoAnalysisResult(normalized)).toBe(true)
  })
})
