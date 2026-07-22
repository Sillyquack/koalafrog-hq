import { describe, expect, it } from 'vitest'
import {
  BEARD_PHOTO_MAX_BYTES,
  validateBeardPhotoAnalysisResult,
  validateBeardPhotoFile,
  type BeardPhotoAnalysisResult,
} from './beardPhotoAnalysis'

const validResult = (): BeardPhotoAnalysisResult => ({
  analysisId: 'analysis-1',
  schemaVersion: 2,
  contractVersion: 'beard-photo-result-contract-v2',
  promptVersion: 'beard-photo-analysis-v4',
  provider: 'openai',
  model: 'configured-model',
  createdAt: '2026-07-21T12:00:00.000Z',
  provenance: 'ai',
  status: 'completed',
  photoQuality: {
    overall: 'suitable',
    perView: [
      { view: 'front', quality: 'suitable', issues: [] },
      { view: 'left_profile', quality: 'suitable', issues: [] },
      { view: 'right_profile', quality: 'limited', issues: ['Uneven lighting'] },
    ],
    issues: [],
    retakeRecommended: false,
  },
  observations: [
    {
      observationKey: 'left_jaw_density',
      category: 'visible-density',
      statement: 'The left jaw appears less visually dense than the right jaw.',
      confidence: 0.72,
      supportingViews: ['front', 'left_profile', 'right_profile'],
      evidenceDescription: 'A larger skin-visible area is present on the left jaw.',
      limitations: ['Lighting differs slightly between profile images.'],
      relatedBeardZones: ['left-jaw', 'right-jaw'],
      provenance: 'ai',
    },
  ],
  symmetry: [],
  densityDistribution: [],
  lineAssessment: [],
  recommendations: [
    {
      id: 'recommendation-1',
      title: 'Review the left jaw before trimming',
      reason: 'The visible density difference may benefit from a conservative review.',
      confidence: 0.68,
      priority: 'medium',
      expectedBenefit: 'Avoid removing more visual weight from the left jaw.',
      supportingObservationKeys: ['left_jaw_density'],
      affectedZones: ['left-jaw'],
      toolConstraints: ['Use only tools already present in Beard Studio.'],
      proposedGuardStrategy: null,
      status: 'undecided',
      provenance: 'ai',
    },
  ],
  limitations: ['Photo analysis cannot measure physical length.'],
  unknowns: ['Exact beard length is unknown.'],
  safetyFlags: [],
  correlationId: 'correlation-1',
})

describe('beard photo analysis contract', () => {
  it('accepts a complete provider result', () => {
    expect(validateBeardPhotoAnalysisResult(validResult())).toBe(true)
  })

  it('rejects unknown fields and invalid confidence', () => {
    expect(validateBeardPhotoAnalysisResult({ ...validResult(), unexpected: true })).toBe(false)
    const result = validResult()
    result.observations[0].confidence = 1.1
    expect(validateBeardPhotoAnalysisResult(result)).toBe(false)
  })

  it('rejects exact measurements and unsupported recommendation references', () => {
    const measurement = validResult()
    measurement.observations[0].statement = 'The beard is 9 mm long.'
    expect(validateBeardPhotoAnalysisResult(measurement)).toBe(false)

    const missingEvidence = validResult()
    missingEvidence.recommendations[0].supportingObservationKeys = ['missing_key']
    expect(validateBeardPhotoAnalysisResult(missingEvidence)).toBe(false)
  })

  it('rejects forbidden sensitive or medical inference language', () => {
    const result = validResult()
    result.observations[0].statement = 'This indicates a medical condition.'
    expect(validateBeardPhotoAnalysisResult(result)).toBe(false)
  })

  it('requires AI provenance and scans supporting text for exact measurements', () => {
    const provenance = validResult()
    provenance.provenance = 'computed' as 'ai'
    expect(validateBeardPhotoAnalysisResult(provenance)).toBe(false)

    const supportingText = validResult()
    supportingText.recommendations[0].expectedBenefit = 'Preserve 12 mm at the chin.'
    expect(validateBeardPhotoAnalysisResult(supportingText)).toBe(false)
  })
})

describe('beard photo input validation', () => {
  it('accepts supported non-empty images within the limit', () => {
    expect(validateBeardPhotoFile({ type: 'image/jpeg', size: 1024 })).toBeNull()
  })

  it('rejects empty, unsupported, and oversized files', () => {
    expect(validateBeardPhotoFile({ type: 'image/jpeg', size: 0 })).toMatch(/empty or corrupt/i)
    expect(validateBeardPhotoFile({ type: 'image/gif', size: 1024 })).toMatch(/JPEG, PNG, or WebP/)
    expect(validateBeardPhotoFile({ type: 'image/png', size: BEARD_PHOTO_MAX_BYTES + 1 })).toMatch(/8 MB/)
  })
})
