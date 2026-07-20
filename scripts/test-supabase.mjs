import { execFileSync } from 'node:child_process'

const status=execFileSync('npx',['supabase','status','-o','env'],{encoding:'utf8'})
const values=Object.fromEntries(status.split('\n').map(line=>line.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map(match=>[match[1],match[2]]))
const url=values.API_URL??'http://127.0.0.1:54321',anon=values.ANON_KEY??values.PUBLISHABLE_KEY,service=values.SERVICE_ROLE_KEY??values.SECRET_KEY
if(!anon||!service)throw new Error('Local Supabase keys were not reported. Run `npx supabase start` first.')
execFileSync('npx',['vitest','run','src/platform/repository/relationalMigration.integration.test.ts','src/platform/security/securityStorage.integration.test.ts','src/features/procurement/data/procurementRepository.integration.test.ts','src/features/beard-studio/data/beardStudioRepository.integration.test.ts'],{stdio:'inherit',env:{...process.env,VITE_SUPABASE_URL:url,VITE_SUPABASE_PUBLISHABLE_KEY:anon,VITE_SUPABASE_TEST_URL:url,VITE_SUPABASE_TEST_ANON_KEY:anon,VITE_SUPABASE_TEST_SERVICE_ROLE_KEY:service}})
