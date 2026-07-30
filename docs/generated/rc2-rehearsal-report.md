# RC2 Auth-Preserving Production Rehearsal V1

Disposition: **PASS**

Execution date: 2026-07-30

Repository HEAD: `76f288d18894a4071316394ec1115a0e08b7b1da`

Production project: `fetmeynkvylznapdikht`

RC2 rehearsal project: `sudsujokeccipbigfcgq`

Physical backup: `2026-07-30T04:17:57.342Z`

Migration advancement: 62 → 87 in 5.995 seconds

## Gates

- Repository: clean `main` at merged `origin/main`; 87 canonical migrations.
- Backup: latest completed physical backup was eligible for restore-to-new-project with database/Auth preservation.
- Restore: one Auth user, one identity, one workspace, and the exact 62-version production prefix were preserved.
- Migration: dry-run selected only the strict 25-version suffix; push completed without history repair or metadata edits.
- Parity: tables, columns, constraints, functions, policies, triggers, indexes, grants, RLS, and tracked comments matched the proven release schema exactly.
- Auth/RLS: preserved Owner A and temporary Owner B authenticated; bidirectional workspace isolation, RPC isolation, controlled write/read, and forbidden access checks passed.
- Cloudflare Preview: Preview variables alone were rebound to RC2. Deployment `bca2db5e-fe5b-4d76-8bb4-eb634b35de2e` succeeded in 55 seconds. Its compiled bundle contained the RC2 project ref and contained neither the production ref nor the prior rehearsal ref.
- Cleanup: the Preview supplier fixture, Owner B workspace, and Owner B Auth user were removed. RC2 returned to one Auth user, one identity, one workspace, and zero named fixture rows.
- Production: remained at 62 migrations, one Auth user, one identity, and one workspace. Production Cloudflare, Auth, Storage, database, and migrations were not modified.

Security and performance advisors were executed. Findings were limited to known informational/intentional patterns and clone-setting differences: deny-all internal tables, authenticated security-definer RPC review items, Auth setting warnings not copied by physical restore, and new-clone statistics/index suggestions. No release-schema drift was found.

Supporting machine-readable evidence is stored beside this report.
