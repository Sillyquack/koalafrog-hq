import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BEARD_PROVIDER_TIMEOUT_DEFAULT_MS,
  ProviderDeadlineError,
  beardStageLog,
  parseBeardProviderTimeout,
  withProviderDeadline,
} from './beardPhotoRuntime'

describe('beard provider runtime policy', () => {
  afterEach(() => vi.useRealTimers())

  it('uses a 110 second default and rejects invalid or unbounded overrides', () => {
    expect(parseBeardProviderTimeout(undefined)).toBe(BEARD_PROVIDER_TIMEOUT_DEFAULT_MS)
    expect(parseBeardProviderTimeout('60000')).toBe(60_000)
    expect(parseBeardProviderTimeout('120000')).toBe(120_000)
    for (const value of ['nope', '59999', '120001', '1.5']) {
      expect(() => parseBeardProviderTimeout(value)).toThrow('INVALID_PROVIDER_TIMEOUT')
    }
  })

  it('allows a deterministic 46 second provider response without retrying', async () => {
    vi.useFakeTimers()
    let calls = 0
    const request = withProviderDeadline(async () => {
      calls += 1
      await new Promise(resolve => setTimeout(resolve, 46_000))
      return 'validated response'
    }, BEARD_PROVIDER_TIMEOUT_DEFAULT_MS)
    await vi.advanceTimersByTimeAsync(46_000)
    await expect(request).resolves.toBe('validated response')
    expect(calls).toBe(1)
  })

  it('aborts once at the configured deadline and never retries', async () => {
    vi.useFakeTimers()
    let calls = 0
    const request = withProviderDeadline(signal => new Promise((_resolve, reject) => {
      calls += 1
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
    }), 60_000)
    const rejected = expect(request).rejects.toBeInstanceOf(ProviderDeadlineError)
    await vi.advanceTimersByTimeAsync(60_000)
    await rejected
    expect(calls).toBe(1)
  })

  it('formats only allowlisted safe lifecycle metadata', () => {
    const entry = beardStageLog({ correlationId: 'support-id', analysisId: 'analysis-id', stage: 'provider_request_started', elapsedMs: 12.4, provider: 'openai', model: 'gpt-5' })
    expect(JSON.parse(entry)).toEqual({ event: 'beard_photo_analysis_stage', correlationId: 'support-id', analysisId: 'analysis-id', stage: 'provider_request_started', elapsedMs: 12, provider: 'openai', model: 'gpt-5' })
    expect(entry).not.toMatch(/image|filename|objectPath|prompt|responseBody|authorization|email|token|secret/i)
  })
})
