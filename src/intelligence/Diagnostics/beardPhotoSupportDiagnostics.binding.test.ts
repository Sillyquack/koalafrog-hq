import { beforeEach, describe, expect, it, vi } from 'vitest'

const bindingSensitiveClient = vi.hoisted(() => {
  const transport = vi.fn()
  return {
    transport,
    client: {
      rest: { rpc: transport },
      rpc(name: string, args: Record<string, string>) {
        return this.rest.rpc(name, args)
      },
    },
  }
})

vi.mock('../../platform/supabase/client', () => ({
  supabase: bindingSensitiveClient.client,
}))

import {
  BeardPhotoSupportRpcFailure,
  lookupBeardPhotoSupportDiagnostic,
} from './beardPhotoSupportDiagnostics'

const workspaceId = '1f6298dd-f661-4c05-86f9-112e6b989535'
const supportId = '844ba77b-fe3d-42c9-8830-f4f4afa40920'
const rpcArgs = {
  candidate_workspace_id: workspaceId,
  candidate_support_id: supportId,
}
const safeDiagnostic = {
  supportId,
  analysisId: '1b182d4e-568a-4d2e-a3ce-5c6103b3430e',
  status: 'failed',
  errorCode: 'CONTRACT_VALIDATION_FAILED',
  failureStage: 'ContractValidation',
  ruleCode: 'VAL-0014',
  jsonPath: '$.recommendations[2].supportingObservationKeys[3]',
  validator: 'beard-contract',
  expectedCategory: 'known reference',
  receivedCategory: 'unknown reference',
  failureSchemaVersion: 2,
  traceVersion: 'intelligence-failure-trace-v1',
  persistence: {
    step: null, table: null, operation: null, sqlstate: null,
    constraint: null, entityType: null, entityIndex: null, diagnosticVersion: null,
  },
  provenance: {
    provider: 'openai', model: 'gpt-5', promptVersion: 'beard-photo-analysis-v4',
    contractVersion: 'beard-photo-result-contract-v2', schemaVersion: 2,
    semanticVersion: 'beard-semantic-safety-v3',
  },
  attemptCount: 1,
  providerAttemptedAt: '2026-07-22T18:16:20Z',
  terminalAt: '2026-07-22T18:17:22Z',
  cleanupState: 'deleted',
  cleanupCompletedAt: '2026-07-22T18:17:23Z',
  resultPresent: false,
  providerUsagePresent: false,
}

describe('Beard Studio support lookup Supabase client binding', () => {
  beforeEach(() => bindingSensitiveClient.transport.mockReset())

  it('reaches the binding-sensitive RPC transport exactly once with the exact contract', async () => {
    bindingSensitiveClient.transport.mockResolvedValue({ data: safeDiagnostic, error: null, status: 200 })

    await expect(lookupBeardPhotoSupportDiagnostic(workspaceId, supportId)).resolves.toEqual(safeDiagnostic)
    expect(bindingSensitiveClient.transport).toHaveBeenCalledTimes(1)
    expect(bindingSensitiveClient.transport).toHaveBeenCalledWith(
      'lookup_beard_analysis_support_diagnostic',
      rpcArgs,
    )
  })

  it('classifies SQL null as normal unavailable metadata', async () => {
    bindingSensitiveClient.transport.mockResolvedValue({ data: null, error: null, status: 200 })

    await expect(lookupBeardPhotoSupportDiagnostic(workspaceId, supportId)).resolves.toBeUndefined()
    expect(bindingSensitiveClient.transport).toHaveBeenCalledTimes(1)
  })

  it('rejects malformed support IDs before the RPC transport', async () => {
    await expect(lookupBeardPhotoSupportDiagnostic(workspaceId, 'not-a-support-id')).resolves.toBeUndefined()
    expect(bindingSensitiveClient.transport).not.toHaveBeenCalled()
  })

  it('classifies transport errors without exposing raw database metadata', async () => {
    bindingSensitiveClient.transport.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'private message', details: 'private detail', hint: 'private hint' },
      status: 404,
    })

    let failure: unknown
    try {
      await lookupBeardPhotoSupportDiagnostic(workspaceId, supportId)
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(BeardPhotoSupportRpcFailure)
    expect(failure).toMatchObject({
      code: 'SUPPORT_RPC_UNAVAILABLE',
      message: 'Support diagnostics are unavailable.',
      metadata: { classification: 'SUPPORT_RPC_UNAVAILABLE', httpStatus: 404, postgrestCode: 'PGRST202' },
    })
    expect(JSON.stringify(failure)).not.toMatch(/private message|private detail|private hint|details|hint/)
    expect(bindingSensitiveClient.transport).toHaveBeenCalledTimes(1)
  })

  it('classifies an unsafe response separately and performs no fallback call', async () => {
    bindingSensitiveClient.transport.mockResolvedValue({
      data: { ...safeDiagnostic, providerOutput: 'private output' },
      error: null,
      status: 200,
    })

    await expect(lookupBeardPhotoSupportDiagnostic(workspaceId, supportId)).rejects.toMatchObject({
      code: 'SUPPORT_RPC_RESPONSE_INVALID',
      message: 'Support diagnostics are unavailable.',
      metadata: { classification: 'SUPPORT_RPC_RESPONSE_INVALID', httpStatus: 200 },
    })
    expect(bindingSensitiveClient.transport).toHaveBeenCalledTimes(1)
  })
})
