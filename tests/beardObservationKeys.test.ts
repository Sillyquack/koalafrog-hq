import { describe, expect, it } from 'vitest'
import {
  BEARD_OBSERVATION_KEY_NORMALIZER_VERSION,
  normalizeBeardObservationKeys,
} from '../supabase/functions/_shared/beardObservationKeys'
import {
  validateBeardPhotoContract,
  type BeardPhotoAnalysisResult,
  type BeardPhotoItem,
} from '../supabase/functions/_shared/beardPhotoAnalysisContract'
import { toDurableBeardFailureDiagnostic } from '../supabase/functions/_shared/beardPhotoFailureDiagnostics'

const item = (
  observationKey: string,
  category: string,
  zone: string,
  statement = `${category} is visibly supported.`,
): BeardPhotoItem => ({
  observationKey,
  category,
  statement,
  confidence: 0.8,
  supportingViews: ['front'],
  evidenceDescription: 'Visible in the supplied view.',
  limitations: [],
  relatedBeardZones: zone ? [zone] : [],
  provenance: 'ai',
})

const fixture = (): BeardPhotoAnalysisResult => ({
  analysisId: '4d9e50b3-dda2-4c91-8c9f-d71c3f42a245',
  schemaVersion: 2,
  contractVersion: 'beard-photo-result-contract-v2',
  promptVersion: 'beard-photo-analysis-v6',
  provider: 'openai',
  model: 'gpt-5',
  createdAt: '2026-07-27T06:00:00.000Z',
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
  observations: [item('shared_key', 'density', 'left cheek')],
  symmetry: [item('shared_key', 'balance', 'left cheek')],
  densityDistribution: [],
  lineAssessment: [],
  recommendations: [{
    id: '80d1e8a8-854d-4e9f-8c56-8c62abf098fa',
    title: 'Keep changes conservative',
    reason: 'The visible evidence supports a cautious plan.',
    confidence: 0.7,
    priority: 'low',
    expectedBenefit: 'Preserve visible balance.',
    supportingObservationKeys: ['shared_key'],
    affectedZones: ['left cheek'],
    toolConstraints: [],
    proposedGuardStrategy: null,
    status: 'undecided',
    provenance: 'ai',
  }],
  limitations: [],
  unknowns: [],
  safetyFlags: [],
  correlationId: '719465a3-9ba6-4bbc-90d2-36e2406b70bc',
})

describe('server-owned beard observation keys', () => {
  it('replaces duplicate provider keys across sections and expands ambiguous references', () => {
    const normalized = normalizeBeardObservationKeys(fixture())
    expect(normalized.success).toBe(true)
    if (!normalized.success) return

    expect(normalized.provenance).toEqual({
      observationKeySource: 'server_generated',
      observationKeyNormalizerVersion: BEARD_OBSERVATION_KEY_NORMALIZER_VERSION,
      providerCollisionDetected: true,
    })
    expect(normalized.result.observations[0].observationKey).toBe(
      'observation_density_left_cheek_0',
    )
    expect(normalized.result.symmetry[0].observationKey).toBe(
      'symmetry_balance_left_cheek_0',
    )
    expect(normalized.result.recommendations[0].supportingObservationKeys).toEqual([
      'observation_density_left_cheek_0',
      'symmetry_balance_left_cheek_0',
    ])
    expect(validateBeardPhotoContract(normalized.result).success).toBe(true)
  })

  it.each([undefined, ''])('assigns a key when the provider key is %s', providerKey => {
    const value = fixture()
    value.symmetry = []
    ;(value.observations[0] as { observationKey?: string }).observationKey = providerKey
    value.recommendations = []
    const normalized = normalizeBeardObservationKeys(value)
    expect(normalized.success && normalized.result.observations[0].observationKey)
      .toBe('observation_density_left_cheek_0')
  })

  it('keeps same-category observations distinct with region and ordinal identity', () => {
    const value = fixture()
    value.symmetry = []
    value.recommendations = []
    value.observations = [
      item('same_label', 'density', 'left cheek', 'First distinct observation.'),
      item('same_label', 'density', 'right cheek', 'Second distinct observation.'),
      item('third_label', 'density', 'left cheek', 'Third distinct observation.'),
    ]
    const normalized = normalizeBeardObservationKeys(value)
    expect(normalized.success).toBe(true)
    if (!normalized.success) return
    expect(normalized.result.observations.map(entry => entry.observationKey)).toEqual([
      'observation_density_left_cheek_0',
      'observation_density_right_cheek_0',
      'observation_density_left_cheek_1',
    ])
    expect(normalized.result.observations.map(entry => entry.statement)).toEqual(
      value.observations.map(entry => entry.statement),
    )
  })

  it('assigns equivalent keys when distinguishable observations arrive in another order', () => {
    const first = fixture()
    first.symmetry = []
    first.recommendations = []
    first.observations = [
      item('a', 'density', 'left cheek'),
      item('b', 'density', 'right cheek'),
    ]
    const second = { ...first, observations: [...first.observations].reverse() }
    const a = normalizeBeardObservationKeys(first)
    const b = normalizeBeardObservationKeys(second)
    expect(a.success && Object.fromEntries(a.result.observations.map(entry => [
      entry.relatedBeardZones[0], entry.observationKey,
    ]))).toEqual(
      b.success && Object.fromEntries(b.result.observations.map(entry => [
        entry.relatedBeardZones[0], entry.observationKey,
      ])),
    )
  })

  it('classifies an impossible server generator collision without observation text', () => {
    const result = normalizeBeardObservationKeys(fixture(), () => 'forced_collision')
    expect(result).toEqual({
      success: false,
      collision: {
        code: 'OBSERVATION_KEY_NORMALIZATION_COLLISION',
        keyCategory: 'symmetry_balance_left_cheek',
        first: { section: 'observations', index: 0 },
        second: { section: 'symmetry', index: 0 },
        keySource: 'server_generated',
        providerCollisionDetected: true,
        normalizerVersion: BEARD_OBSERVATION_KEY_NORMALIZER_VERSION,
      },
    })
  })

  it('allowlists the owner-safe normalizer diagnostic for terminal persistence', () => {
    expect(toDurableBeardFailureDiagnostic({
      success: false,
      ruleCode: 'VAL-0013',
      jsonPath: '$.symmetry[0].observationKey',
      expected: 'unique observation key',
      received: 'duplicate',
      validator: BEARD_OBSERVATION_KEY_NORMALIZER_VERSION,
      stage: 'ContractValidation',
    })).toMatchObject({
      failure_rule_code: 'VAL-0013',
      failure_json_path: '$.symmetry[0].observationKey',
      failure_validator: BEARD_OBSERVATION_KEY_NORMALIZER_VERSION,
    })
  })
})
