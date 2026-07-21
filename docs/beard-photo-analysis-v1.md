# Beard Photo Analysis v1

## Status and scope

Phase A implements the local application, database migration, Edge Function, provider adapter, validation, and review UI. It has not been deployed and the migration has not been applied to hosted Supabase. No provider secret belongs in the browser.

The workflow is advisory. It may observe visible beard characteristics and propose grooming plans, but it never writes to Beard Profile, Length Map, Trim Recipes, logs, inventory, or any other authoritative domain record. Accepting a recommendation records only its intelligence review state.

## Data flow

1. An authenticated owner selects front, left-profile, and right-profile images. Under-chin is optional.
2. The browser validates type, size, and decodability, then uploads each image to the private `beard-analysis-images` bucket under `<workspace>/<user>/<analysis>/<view>.<ext>`.
3. The authenticated browser invokes `analyze-beard-photos` with object paths and identifiers, never with a provider credential.
4. The Edge Function revalidates authentication, active-workspace ownership, image paths, concurrency, rate limits, and the minimal Beard Studio context selection.
5. The configured vision provider receives labeled images and the minimal context needed for the analysis.
6. A strict runtime contract rejects malformed, unsupported, sensitive, medical, identity, or exact-measurement output.
7. Validated observations, recommendations, provenance, confidence, limitations, and the result envelope are stored in intelligence-owned tables.
8. Temporary image objects are deleted after every terminal attempt. A cleanup failure is retained and shown as `completed_cleanup_required` or `cleanup_required` for operator recovery.

No photo bytes, signed URLs, prompts, tokens, secrets, or personal details are written to application logs. Provider requests use `store: false`.

## Storage, retention, and RLS

`beard-analysis-images` is private, accepts JPEG, PNG, and WebP, and limits objects to 8 MB. Storage policies bind the first path segment to an active workspace owned by the authenticated user and the second segment to `auth.uid()`. Anonymous and cross-owner access are denied.

The four intelligence tables use owner/workspace RLS and composite foreign keys. Analysis inputs retain only temporary object metadata and cleanup state. Results remain separate from Beard Studio source-of-truth tables. The migration is additive and does not change the existing Scent intelligence thread or run contracts.

## Provider configuration

The provider adapter is implemented only inside the Edge Function. Configure hosted secrets only during an approved Phase B:

- `OPENAI_API_KEY`: required server-side provider credential.
- `OPENAI_BEARD_VISION_MODEL`: required explicit model identifier. There is no fallback. The server currently allows only the documented image-capable Responses models `gpt-5` and `gpt-5-2025-08-07`; account access must still be verified before a paid test.

When the credential is missing, the function returns `PROVIDER_NOT_CONFIGURED`; the UI shows a controlled error and never substitutes mock output.

## Local development and tests

Start local Supabase, reset only the local database, and serve the function with local server-side secrets. Then run:

```sh
npm run lint
npm run build
npm test
npm run test:supabase
npm run test:secrets
npm run test:cloudflare
git diff --check
```

The Supabase test suite verifies bucket ownership, anonymous and cross-owner denial, and explicit cleanup. Contract tests cover malformed output, confidence bounds, unsupported references, sensitive inference, exact measurements, and file validation.

## Failure recovery

- Authentication/workspace failure: sign in again or restore the active workspace; no provider call occurs.
- Invalid photo: replace it before consent; no provider call occurs.
- Provider unavailable, timeout, refusal, or rate limit: the run fails safely, images are still submitted for deletion, and no domain record changes.
- Invalid structured output: the entire result is rejected; partial recommendations are not persisted.
- Cleanup failure: use the analysis/input correlation metadata to delete the listed private objects, then set input cleanup state to `deleted`. Do not delete the analysis audit record.

## Cost and limitations

Each confirmed submission can incur provider image and output-token cost. The function allows one active analysis per owner/workspace and at most five starts per hour. Images cannot establish exact millimeter length, growth rate, objective facial geometry, identity, health, or medical conditions. Lighting, perspective, occlusion, filters, and inconsistent distance reduce confidence.

## Phase B deployment and rollback

Phase B requires separate approval to apply the migration, configure the server-side secret, deploy the Edge Function, deploy the app, and run read-only production verification. Cloudflare deployment must continue through the existing Git integration.

Preferred emergency rollback preserves audit history:

1. Disable the Analyze Beard Photos UI action or remove `OPENAI_BEARD_VISION_MODEL` so the function fails closed with `PROVIDER_NOT_CONFIGURED`.
2. Undeploy or otherwise disable only `analyze-beard-photos`; leave the existing Scent intelligence function unchanged.
3. Preserve intelligence analysis records for diagnosis and confirm the temporary image prefix is empty.
4. Revert the frontend commit normally and let the existing Cloudflare Git integration deploy the revert.
5. Remove the additive tables, functions, policies, and private bucket only after explicit review and only after proving the bucket and dependent tables are empty. Do not automate this destructive step.

Removing `OPENAI_BEARD_VISION_MODEL` disables this workflow without removing the shared provider key used by existing Scent intelligence. The UI must continue to show the controlled provider-not-configured state. A schema rollback is intentionally not automated because dropping audit/history tables would be destructive.
