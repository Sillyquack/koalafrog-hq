import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BEARD_PROVIDER_TIMEOUT_DEFAULT_MS,
  ProviderInvocationError,
  beardStageLog,
  invokeProviderJson,
  parseBeardProviderTimeout,
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

  it.each([
    ['network failure before headers', () => Promise.reject(new TypeError('network')), 'PROVIDER_TRANSPORT_NETWORK'],
    ['HTTP 429', () => Promise.resolve(new Response('', { status: 429 })), 'PROVIDER_HTTP_ERROR'],
    ['HTTP 500', () => Promise.resolve(new Response('', { status: 500 })), 'PROVIDER_HTTP_ERROR'],
    ['malformed JSON', () => Promise.resolve(new Response('{', { status: 200 })), 'PROVIDER_RESPONSE_PARSE_FAILED'],
  ])('classifies %s without exposing raw errors', async (_label, request, classification) => {
    let calls = 0
    const rejected = await invokeProviderJson({
      request: signal => {
        expect(signal.aborted).toBe(false)
        calls += 1
        return request()
      },
      timeoutMs: 60_000,
    }).catch(error => error)
    expect(rejected).toBeInstanceOf(ProviderInvocationError)
    expect(rejected.classification).toBe(classification)
    expect(rejected.trace.requestDispatched).toBe(true)
    expect(calls).toBe(1)
    expect(JSON.stringify(rejected.trace)).not.toMatch(/authorization|header value|response body|stack|secret|token/i)
  })

  it('distinguishes a headers timeout from a stalled response body', async () => {
    vi.useFakeTimers()
    let headerSignal: AbortSignal | undefined
    const headers = invokeProviderJson({
      request: signal => {
        headerSignal = signal
        return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }))
      },
      timeoutMs: 60_000,
    })
    const headersRejected = expect(headers).rejects.toMatchObject({
      classification: 'PROVIDER_TIMEOUT_RESPONSE_HEADERS',
      trace: { elapsedMs: 60_000, responseHeadersReceived: false, responseBodyCompleted: false, timeoutSource: 'application_deadline' },
    })
    await vi.advanceTimersByTimeAsync(60_000)
    await headersRejected
    expect(headerSignal?.aborted).toBe(true)

    let bodySignal: AbortSignal | undefined
    const body = invokeProviderJson({
      request: signal => {
        bodySignal = signal
        const response = new Response('{}')
        Object.defineProperty(response, 'text', { value: () => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })) })
        return Promise.resolve(response)
      },
      timeoutMs: 60_000,
    })
    const bodyRejected = expect(body).rejects.toMatchObject({
      classification: 'PROVIDER_TIMEOUT_RESPONSE_BODY',
      trace: { elapsedMs: 60_000, responseHeadersReceived: true, responseBodyCompleted: false, timeoutSource: 'application_deadline' },
    })
    await vi.advanceTimersByTimeAsync(60_000)
    await bodyRejected
    expect(bodySignal?.aborted).toBe(true)
  })

  it('accepts a valid response just before the deadline and cancels no second attempt', async () => {
    vi.useFakeTimers()
    let calls = 0
    const request = invokeProviderJson({
      request: async () => {
        calls += 1
        await new Promise(resolve => setTimeout(resolve, 59_999))
        return new Response('{"ok":true}', { headers: { 'x-request-id': 'redacted-by-presence-flag' } })
      },
      timeoutMs: 60_000,
    })
    await vi.advanceTimersByTimeAsync(59_999)
    await expect(request).resolves.toMatchObject({
      json: { ok: true },
      trace: {
        stage: 'provider_completed',
        requestDispatched: true,
        responseHeadersReceived: true,
        responseBodyCompleted: true,
        providerRequestIdPresent: true,
        elapsedMs: 59_999,
      },
    })
    expect(calls).toBe(1)
  })

  it('classifies caller cancellation separately from the application deadline', async () => {
    const caller = new AbortController()
    const request = invokeProviderJson({
      callerSignal: caller.signal,
      request: signal => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true })),
      timeoutMs: 60_000,
    })
    caller.abort()
    await expect(request).rejects.toMatchObject({
      classification: 'PROVIDER_CALLER_ABORTED',
      trace: { timeoutSource: 'caller', abortReasonCode: 'caller' },
    })
  })

  it('formats only allowlisted safe lifecycle metadata', () => {
    const entry = beardStageLog({ correlationId: 'support-id', analysisId: 'analysis-id', stage: 'provider_request_started', elapsedMs: 12.4, provider: 'openai', model: 'gpt-5' })
    expect(JSON.parse(entry)).toEqual({ event: 'beard_photo_analysis_stage', correlationId: 'support-id', analysisId: 'analysis-id', stage: 'provider_request_started', elapsedMs: 12, provider: 'openai', model: 'gpt-5' })
    expect(entry).not.toMatch(/image|filename|objectPath|prompt|responseBody|authorization|email|token|secret/i)
  })
})
