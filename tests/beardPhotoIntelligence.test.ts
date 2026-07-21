import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const edge = readFileSync('supabase/functions/analyze-beard-photos/index.ts', 'utf8')
const client = readFileSync('src/intelligence/Vision/beardPhotoClient.ts', 'utf8')
const prompt = readFileSync('supabase/functions/_shared/beardPhotoPrompt.ts', 'utf8')
const migration = readFileSync('supabase/migrations/20260721140000_beard_photo_analysis.sql', 'utf8')

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
    expect(edge).toMatch(/TIMEOUT_MS = 45_000/)
    expect(edge).toContain('controller.abort()')
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

  it('does not log prompts, image contents, tokens, or personal data', () => {
    expect(edge).not.toMatch(/console\.(?:log|info|debug|warn|error)/)
    expect(edge).not.toMatch(/Authorization.*console|console.*Authorization/)
    expect(edge).not.toMatch(/dataUrl.*console|console.*dataUrl/)
  })
})
