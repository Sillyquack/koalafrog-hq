# Auth deployment readiness

No hosted Auth setting is verified or changed by local preparation.

| Check | Preview | Production | Pass condition |
|---|---|---|---|
| Project URL/publishable key | isolated values | production values | HTTPS, expected project, browser-safe key only |
| Service role | server-only | server-only | absent from Vite/build/logs |
| Redirect/callback URLs | preview origin and deep links | canonical origin and deep links | exact allowlist; no wildcard surprise |
| Login/logout/reset/confirmation | exercised | exercised after approval | controlled errors, session cleared, valid callbacks |
| Session persistence/refresh/multi-tab | exercised | smoke | no bypass or stale-owner crossover |
| Owner A/B and workspace switching | isolated fixtures | authorized proof | strict row/RPC isolation |
| Expired/disabled user | exercised | authorized proof | denied and recoverable |
| Direct protected route/deep-link | exercised | smoke | Auth gate then correct return path |

Future executable plan: create or identify authorized test owners out-of-band, record IDs without credentials, run the existing authenticated harness adapted to an approved target, verify sessions and routes, capture redacted results, then disable/remove fixtures according to the approval. Do not use production owners for destructive tests.

Hosted checks must also confirm token expiry policy, email-provider configuration, leaked-password protection/advisor findings, and current Supabase Auth URL behavior. Any cross-owner access, service-role exposure, broken callback, or uncontrolled signup is a blocker.
