import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BEARD_FUNCTION_NON_PROVIDER_RESERVE_MS,
  BEARD_FUNCTION_WALL_CLOCK_LIMIT_MS,
  BEARD_PROVIDER_TIMEOUT_DEFAULT_MS,
  BEARD_PROVIDER_TIMEOUT_MAX_MS,
  ProviderInvocationError,
  beardStageLog,
  classifyOpenAIRateLimit,
  invokeProviderJson,
  parseBeardProviderTimeout,
} from './beardPhotoRuntime'

describe('beard provider runtime policy', () => {
  afterEach(() => vi.useRealTimers())

  it('uses a bounded default and reserves time for persistence and cleanup', () => {
    expect(parseBeardProviderTimeout(undefined)).toBe(BEARD_PROVIDER_TIMEOUT_DEFAULT_MS)
    expect(parseBeardProviderTimeout('60000')).toBe(60_000)
    expect(parseBeardProviderTimeout('300000')).toBe(300_000)
    expect(BEARD_PROVIDER_TIMEOUT_DEFAULT_MS).toBe(180_000)
    expect(BEARD_PROVIDER_TIMEOUT_MAX_MS + BEARD_FUNCTION_NON_PROVIDER_RESERVE_MS).toBe(BEARD_FUNCTION_WALL_CLOCK_LIMIT_MS)
    for (const value of ['nope', '59999', '300001', '1.5']) {
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

  it.each([
    [
      'ordinary request rate limit',
      { type: 'requests', code: 'rate_limit_exceeded', message: 'Rate limit reached for requests per min.' },
      'PROVIDER_RATE_LIMIT_REQUESTS',
    ],
    [
      'ordinary token rate limit',
      { type: 'tokens', code: 'rate_limit_exceeded', message: 'Rate limit reached for tokens per min.' },
      'PROVIDER_RATE_LIMIT_TOKENS',
    ],
    [
      'exhausted quota',
      { type: 'insufficient_quota', code: 'insufficient_quota', message: 'You exceeded your current quota.' },
      'PROVIDER_QUOTA_EXHAUSTED',
    ],
    [
      'billing hard limit',
      { type: 'invalid_request_error', code: 'billing_hard_limit_reached', message: 'Billing hard limit reached.' },
      'PROVIDER_BILLING_LIMIT',
    ],
    [
      'model-specific limit',
      { type: 'rate_limit_error', code: 'model_rate_limit_exceeded', param: 'model', message: 'Model rate limit reached.' },
      'PROVIDER_MODEL_LIMIT',
    ],
    [
      'missing provider error body',
      {},
      'PROVIDER_RATE_LIMIT_UNKNOWN',
    ],
  ])('safely classifies %s', (_label, error, expected) => {
    expect(classifyOpenAIRateLimit({ status: 429, ...error }).category).toBe(expected)
  })

  it('captures allowlisted retry metadata and redacts account identifiers', () => {
    const diagnostic = classifyOpenAIRateLimit({
      status: 429,
      code: 'rate_limit_exceeded',
      headers: new Headers({
        'retry-after': '12',
        'x-ratelimit-limit-requests': '500',
        'x-ratelimit-remaining-requests': '0',
        'x-ratelimit-reset-requests': '12s',
        'x-ratelimit-limit-tokens': '30000',
        'x-ratelimit-remaining-tokens': '120',
        'x-ratelimit-reset-tokens': '250ms',
        'x-request-id': 'req_1234567890',
        'openai-project': 'proj_abcdefghijk',
        'openai-organization': 'org_abcdefghijk',
      }),
    })
    expect(diagnostic).toMatchObject({
      retryAfter: '12',
      requestLimit: '500',
      requestRemaining: '0',
      requestReset: '12s',
      tokenLimit: '30000',
      tokenRemaining: '120',
      tokenReset: '250ms',
      requestId: 'req_1234567890',
      projectIdRedacted: 'proj…hijk',
      organizationIdRedacted: 'org_…hijk',
    })
    expect(JSON.stringify(diagnostic)).not.toContain('proj_abcdefghijk')
    expect(JSON.stringify(diagnostic)).not.toContain('org_abcdefghijk')
  })

  it('reads and classifies one HTTP error response without retrying', async () => {
    let calls = 0
    const rejected = await invokeProviderJson({
      request: () => {
        calls += 1
        return Promise.resolve(new Response(JSON.stringify({
          error: {
            type: 'insufficient_quota',
            code: 'insufficient_quota',
            message: 'You exceeded your current quota.',
          },
        }), {
          status: 429,
          headers: { 'retry-after': '60', 'x-request-id': 'req_safe' },
        }))
      },
      timeoutMs: 60_000,
    }).catch(error => error)
    expect(calls).toBe(1)
    expect(rejected).toMatchObject({
      classification: 'PROVIDER_HTTP_ERROR',
      httpError: {
        httpStatus: 429,
        type: 'insufficient_quota',
        code: 'insufficient_quota',
        category: 'PROVIDER_QUOTA_EXHAUSTED',
        retryAfter: '60',
        requestId: 'req_safe',
      },
      trace: { responseBodyCompleted: true },
    })
    expect(JSON.stringify(rejected.httpError)).not.toContain('You exceeded')
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

  it('consumes a successful provider body exactly once', async () => {
    let textCalls = 0
    const response = new Response(JSON.stringify({ output: [] }))
    Object.defineProperty(response, 'text', {
      value: async () => {
        textCalls += 1
        return JSON.stringify({ output: [] })
      },
    })
    await expect(invokeProviderJson({
      request: () => Promise.resolve(response),
      timeoutMs: 60_000,
    })).resolves.toMatchObject({ json: { output: [] } })
    expect(textCalls).toBe(1)
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

  it('does not dispatch when the incoming caller signal is already aborted', async () => {
    const caller = new AbortController()
    caller.abort()
    let calls = 0
    await expect(invokeProviderJson({
      callerSignal: caller.signal,
      request: () => {
        calls += 1
        return Promise.resolve(new Response('{}'))
      },
      timeoutMs: 60_000,
    })).rejects.toMatchObject({
      classification: 'PROVIDER_CALLER_ABORTED',
      trace: { requestDispatched: false, timeoutSource: 'caller' },
    })
    expect(calls).toBe(0)
  })

  it('keeps an application deadline authoritative when caller cancellation follows before rejection', async () => {
    vi.useFakeTimers()
    const caller = new AbortController()
    let abortEvents = 0
    const request = invokeProviderJson({
      callerSignal: caller.signal,
      request: signal => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          abortEvents += 1
          setTimeout(() => reject(new DOMException('aborted', 'AbortError')), 1)
        }, { once: true })
      }),
      timeoutMs: 60_000,
    })
    const rejected = expect(request).rejects.toMatchObject({
      classification: 'PROVIDER_TIMEOUT_RESPONSE_HEADERS',
      trace: { timeoutSource: 'application_deadline', abortReasonCode: 'application_deadline' },
    })
    await vi.advanceTimersByTimeAsync(60_000)
    caller.abort()
    await vi.advanceTimersByTimeAsync(1)
    await rejected
    expect(abortEvents).toBe(1)
  })

  it('keeps caller cancellation authoritative when the application deadline follows', async () => {
    vi.useFakeTimers()
    const caller = new AbortController()
    let abortEvents = 0
    const request = invokeProviderJson({
      callerSignal: caller.signal,
      request: signal => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          abortEvents += 1
          setTimeout(() => reject(new DOMException('aborted', 'AbortError')), 60_001)
        }, { once: true })
      }),
      timeoutMs: 60_000,
    })
    const rejected = expect(request).rejects.toMatchObject({
      classification: 'PROVIDER_CALLER_ABORTED',
      trace: { timeoutSource: 'caller', abortReasonCode: 'caller' },
    })
    caller.abort()
    await vi.advanceTimersByTimeAsync(60_001)
    await rejected
    expect(abortEvents).toBe(1)
  })

  it('rejects late headers even when the request ignores abort', async () => {
    vi.useFakeTimers()
    let calls = 0
    const request = invokeProviderJson({
      request: async () => {
        calls += 1
        await new Promise(resolve => setTimeout(resolve, 60_001))
        return new Response('{"ok":true}')
      },
      timeoutMs: 60_000,
    })
    const rejected = expect(request).rejects.toMatchObject({
      classification: 'PROVIDER_TIMEOUT_RESPONSE_HEADERS',
      trace: { timeoutSource: 'application_deadline', responseHeadersReceived: false },
    })
    await vi.advanceTimersByTimeAsync(60_001)
    await rejected
    expect(calls).toBe(1)
  })

  it('rejects a late body even when the response ignores abort', async () => {
    vi.useFakeTimers()
    let calls = 0
    const request = invokeProviderJson({
      request: async () => {
        calls += 1
        const response = new Response('{}')
        Object.defineProperty(response, 'text', {
          value: async () => {
            await new Promise(resolve => setTimeout(resolve, 60_001))
            return '{"ok":true}'
          },
        })
        return response
      },
      timeoutMs: 60_000,
    })
    const rejected = expect(request).rejects.toMatchObject({
      classification: 'PROVIDER_TIMEOUT_RESPONSE_BODY',
      trace: { timeoutSource: 'application_deadline', responseHeadersReceived: true, responseBodyCompleted: false },
    })
    await vi.advanceTimersByTimeAsync(60_001)
    await rejected
    expect(calls).toBe(1)
  })

  it.each([
    [{ usage: { input_tokens: 1 } }, true],
    [{ output: [] }, false],
    [{ usage: 'unsafe raw usage' }, false],
    [{ usage: ['unsafe raw usage'] }, false],
  ])('records only safe usage metadata presence for %j', async (json, expected) => {
    const result = await invokeProviderJson({
      request: () => Promise.resolve(new Response(JSON.stringify(json))),
      timeoutMs: 60_000,
    })
    expect(result.trace.usagePresent).toBe(expected)
    expect(result.trace).not.toHaveProperty('usage')
  })

  it('formats only allowlisted safe lifecycle metadata', () => {
    const entry = beardStageLog({ correlationId: 'support-id', analysisId: 'analysis-id', stage: 'provider_request_started', elapsedMs: 12.4, provider: 'openai', model: 'gpt-5' })
    expect(JSON.parse(entry)).toEqual({ event: 'beard_photo_analysis_stage', correlationId: 'support-id', analysisId: 'analysis-id', stage: 'provider_request_started', elapsedMs: 12, provider: 'openai', model: 'gpt-5' })
    expect(entry).not.toMatch(/image|filename|objectPath|prompt|responseBody|authorization|email|token|secret/i)
  })
})
