import { describe, expect, it } from 'vitest'
import { validateBeardPhotoSupportDiagnostic } from './beardPhotoSupportDiagnostics'

const safeDiagnostic = () => ({
  supportId: '844ba77b-fe3d-42c9-8830-f4f4afa40920',
  analysisId: '1b182d4e-568a-4d2e-a3ce-5c6103b3430e',
  status: 'failed', errorCode: 'CONTRACT_VALIDATION_FAILED',
  failureStage: 'ContractValidation', ruleCode: 'VAL-0014',
  jsonPath: '$.recommendations[2].supportingObservationKeys[3]',
  validator: 'beard-contract', expectedCategory: 'known reference',
  receivedCategory: 'unknown reference', failureSchemaVersion: 2,
  traceVersion: 'intelligence-failure-trace-v1',
  persistence: {step:null,table:null,operation:null,sqlstate:null,constraint:null,entityType:null,entityIndex:null,diagnosticVersion:null},
  provenance: {provider:'openai',model:'gpt-5',promptVersion:'beard-photo-analysis-v4',contractVersion:'beard-photo-result-contract-v2',schemaVersion:2,semanticVersion:'beard-semantic-safety-v3'},
  attemptCount: 1, providerAttemptedAt: '2026-07-22T18:16:20Z',
  terminalAt: '2026-07-22T18:17:22Z', cleanupState: 'deleted',
  cleanupCompletedAt: '2026-07-22T18:17:23Z', resultPresent: false,
  providerUsagePresent: false,
})

describe('owner-safe beard support diagnostic contract', () => {
  it('accepts the explicit metadata-only response and historical nulls', () => {
    expect(validateBeardPhotoSupportDiagnostic(safeDiagnostic())).toBe(true)
    const historical = {...safeDiagnostic(),failureStage:null,ruleCode:null,jsonPath:null,validator:null,expectedCategory:null,receivedCategory:null,failureSchemaVersion:null,traceVersion:null,provenance:{...safeDiagnostic().provenance,contractVersion:null,semanticVersion:null}}
    expect(validateBeardPhotoSupportDiagnostic(historical)).toBe(true)
  })

  it.each(['providerOutput','prompt','exceptionMessage','detail','hint','imageUrl','signedUrl','rejectedValue','jwt','secret'])(
    'rejects an unexpected %s field', field => {
      expect(validateBeardPhotoSupportDiagnostic({...safeDiagnostic(),[field]:'private content'})).toBe(false)
    },
  )

  it('rejects nested provider content and invalid structural paths', () => {
    expect(validateBeardPhotoSupportDiagnostic({...safeDiagnostic(),provenance:{...safeDiagnostic().provenance,prompt:'private prompt'}})).toBe(false)
    expect(validateBeardPhotoSupportDiagnostic({...safeDiagnostic(),jsonPath:'$.observations[left_cheek_private]'})).toBe(false)
  })
})
