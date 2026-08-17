import { beforeEach, describe, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => ({
  auth: { getUser: vi.fn() },
  storage: { from: vi.fn() },
  functions: { invoke: vi.fn() },
  rpc: vi.fn(),
}))

vi.mock('../../platform/supabase/client', () => ({ supabase: client }))

import { runBeardPhotoAnalysis } from './beardPhotoClient'
import type { BeardPhotoView, SelectedBeardPhoto } from './beardPhotoAnalysis'

const analysisId = '34505953-72a3-4d24-8a80-5b477a1950b2'
const workspaceId = '1f6298dd-f661-4c05-86f9-112e6b989535'
const ownerId = 'aa566306-bbdd-4deb-adf0-bdb5c160a113'
const supportId = '844ba77b-fe3d-42c9-8830-f4f4afa40920'
const requiredViews: BeardPhotoView[] = ['front', 'left_profile', 'right_profile']
const photos = requiredViews.map((view): SelectedBeardPhoto => ({
  view,
  file: new File(['photo'], `${view}.jpg`, { type: 'image/jpeg' }),
  previewUrl: `blob:${view}`,
}))

describe('Beard Photo Analysis invocation boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    client.auth.getUser.mockResolvedValue({ data: { user: { id: ownerId } }, error: null })
    client.storage.from.mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
      remove: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
  })

  it('reconciles an ambiguous invoke failure to the durable typed failure and support ID', async () => {
    client.functions.invoke.mockResolvedValue({
      data: null,
      error: { name: 'FunctionsFetchError', context: new TypeError('connection closed') },
    })
    client.rpc.mockResolvedValue({
      data: {
        analysisId,
        supportId,
        status: 'failed',
        errorCode: 'PROVIDER_TIMEOUT',
        createdAt: '2026-08-17T07:57:14.595Z',
      },
      error: null,
    })

    const rejected = runBeardPhotoAnalysis({
      workspaceId,
      profileId: '789648e3-d5d6-4c1d-813f-6df949a96092',
      photos,
      analysisId,
      idempotencyKey: '499295a7-8e52-4053-a5e2-006b0471944f',
    }).catch(error => error)

    await expect(rejected).resolves.toMatchObject({
      code: 'PROVIDER_TIMEOUT',
      correlationId: supportId,
      message: 'The analysis took too long, so no result was stored. You may start a new analysis.',
    })
    expect(client.functions.invoke).toHaveBeenCalledOnce()
    expect(client.rpc).toHaveBeenCalledWith('reopen_beard_analysis', {
      candidate_workspace_id: workspaceId,
      candidate_analysis_id: analysisId,
    })
  })

  it('keeps a genuinely unreconciled fetch failure classified as unreachable', async () => {
    client.functions.invoke.mockResolvedValue({
      data: null,
      error: { name: 'FunctionsFetchError', context: new TypeError('offline') },
    })
    client.rpc.mockResolvedValue({ data: null, error: null })

    const rejected = runBeardPhotoAnalysis({
      workspaceId,
      profileId: '789648e3-d5d6-4c1d-813f-6df949a96092',
      photos,
      analysisId,
      idempotencyKey: '499295a7-8e52-4053-a5e2-006b0471944f',
    }).catch(error => error)

    await expect(rejected).resolves.toMatchObject({
      code: 'NETWORK_FAILURE',
      message: 'The analysis service could not be reached.',
      correlationId: undefined,
    })
  })

  it('distinguishes a durable provider connection failure from client reachability', async () => {
    client.functions.invoke.mockResolvedValue({
      data: null,
      error: { name: 'FunctionsFetchError', context: new TypeError('connection closed') },
    })
    client.rpc.mockResolvedValue({
      data: { analysisId, supportId, status: 'failed', errorCode: 'NETWORK_FAILURE' },
      error: null,
    })

    const rejected = runBeardPhotoAnalysis({
      workspaceId,
      profileId: '789648e3-d5d6-4c1d-813f-6df949a96092',
      photos,
      analysisId,
      idempotencyKey: '499295a7-8e52-4053-a5e2-006b0471944f',
    }).catch(error => error)

    await expect(rejected).resolves.toMatchObject({
      code: 'NETWORK_FAILURE',
      correlationId: supportId,
      message: 'The analysis provider connection ended before completion.',
    })
  })
})
