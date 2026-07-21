import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const edge = readFileSync('supabase/functions/analyze-beard-photos/index.ts', 'utf8')
const client = readFileSync('src/intelligence/Vision/beardPhotoClient.ts', 'utf8')
const prompt = readFileSync('supabase/functions/_shared/beardPhotoPrompt.ts', 'utf8')
const migration = readFileSync('supabase/migrations/20260721140000_beard_photo_analysis.sql', 'utf8')
const provenanceMigration = readFileSync('supabase/migrations/20260721210000_beard_photo_attempt_provenance.sql', 'utf8')
const runtime = readFileSync('supabase/functions/_shared/beardPhotoRuntime.ts', 'utf8')

describe('beard photo intelligence boundaries', () => {
  it('authenticates, scopes workspace access, and verifies storage ownership', () => {
    expect(edge).toContain('auth.getUser')
    expect(edge).toMatch(/\.eq\("owner_id", userId\)/)
    expect(edge).toMatch(/const prefix =/)
    expect(edge).toMatch(/\.eq\("lifecycle_state", "active"\)/)
  })

  it('keeps provider credentials server-side and bounds provider execution', () => {
    expect(edge).toContain('Deno.env.get("OPENAI_API_KEY")')
    expect(edge).not.toMatch(/VITE_.*OPENAI/)
    expect(runtime).toContain('BEARD_PROVIDER_TIMEOUT_DEFAULT_MS = 110_000')
    expect(runtime).toContain('BEARD_PROVIDER_TIMEOUT_MIN_MS = 60_000')
    expect(runtime).toContain('BEARD_PROVIDER_TIMEOUT_MAX_MS = 120_000')
    expect(runtime).toContain('controller.abort()')
    expect(edge).toContain('OPENAI_BEARD_VISION_TIMEOUT_MS')
    expect(edge).toMatch(/store: false/)
    expect(edge).toContain('Deno.env.get("OPENAI_BEARD_VISION_MODEL")')
    expect(edge).not.toContain('gpt-5.6-terra')
    expect(edge).toContain('ALLOWED_MODELS.has(model)')
  })

  it('has rate limiting, idempotency, strict validation, and no mock fallback', () => {
    expect(edge).toContain('idempotencyKey')
    expect(edge).toContain('RATE_LIMITED')
    expect(edge).toContain('validateBeardPhotoAnalysisResult')
    expect(client).not.toMatch(/mock|demo/i)
    expect(edge).not.toMatch(/createSignedUrl|signedUrl/)
    expect(migration).toContain('unique (workspace_id, owner_user_id, idempotency_key)')
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain('intelligence_analyses_one_active_per_owner')
    expect(provenanceMigration).toContain('provider_attempt_count=provider_attempt_count+1')
    expect(provenanceMigration).toContain("and status='staging'")
    expect(edge.indexOf('begin_beard_provider_attempt')).toBeLessThan(edge.indexOf('.download('))
    expect(edge).toContain('status: "staging"')
  })

  it('restricts browser origins to production and localhost development', () => {
    expect(edge).toContain('https://koalafrog-hq.pages.dev')
    expect(edge).toContain('allowedOrigin(origin)')
    expect(edge).toContain('"Vary": "Origin"')
  })

  it('instructs the provider not to infer identity, health, or exact measurements', () => {
    expect(prompt).toMatch(/Never identify the person/i)
    expect(prompt).toMatch(/health.*medical conditions/i)
    expect(prompt).toMatch(/Never claim exact millimeter length/i)
  })

  it('logs only the safe stage envelope and never sensitive request material', () => {
    expect(edge).toContain('console.info(beardStageLog')
    expect(runtime).not.toMatch(/filename|objectPath|prompt|responseBody|authorization|email|apiKey|imageData/i)
    expect(edge).not.toMatch(/console\.(?:log|debug|warn|error)/)
    expect(edge).not.toMatch(/console\.info\((?!beardStageLog)/)
  })

  it('keeps the browser on the normal invocation lifecycle without a shorter client timeout or retry', () => {
    expect(client).toContain("supabase.functions.invoke('analyze-beard-photos'")
    expect(client).not.toMatch(/setTimeout|timeoutMs|retry/i)
    expect(edge).not.toMatch(/retry\s*[:=]|for\s*\([^)]*retry/i)
  })

  it('returns the timeout support ID and always reaches cleanup after provider execution', () => {
    expect(edge).toContain('error instanceof ProviderError')
    expect(edge).toMatch(/safeError\([\s\S]*correlationId/)
    expect(edge.indexOf('provider.analyzeBeardPhotos')).toBeLessThan(edge.indexOf('const removed = await client.storage'))
    expect(edge.indexOf('status: "failed"')).toBeLessThan(edge.indexOf('const removed = await client.storage'))
    expect(edge).not.toContain('req.signal')
  })
})
