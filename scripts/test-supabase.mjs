import { execFileSync } from 'node:child_process'

const status=execFileSync('npx',['supabase','status','-o','env'],{encoding:'utf8'})
const values=Object.fromEntries(status.split('\n').map(line=>line.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map(match=>[match[1],match[2]]))
const url=values.API_URL??'http://127.0.0.1:54321',anon=values.ANON_KEY??values.PUBLISHABLE_KEY,service=values.SERVICE_ROLE_KEY??values.SECRET_KEY
if(!anon||!service)throw new Error('Local Supabase keys were not reported. Run `npx supabase start` first.')
const defaultTests=[
  'src/platform/repository/relationalMigration.integration.test.ts',
  'src/platform/security/securityStorage.integration.test.ts',
  'src/platform/security/beardPhotoStorage.integration.test.ts',
  'src/features/procurement/data/procurementRepository.integration.test.ts',
  'src/features/procurement/data/followUpResearch.integration.test.ts',
  'src/features/procurement/data/commercialProvenanceRepository.integration.test.ts',
  'src/features/procurement/draft-plans/data/draftPurchasePlanRepository.integration.test.ts',
  'src/features/procurement/production-readiness/data/productionReadinessRepository.integration.test.ts',
  'src/features/product-studio/domain/footCareProcurement.integration.test.ts',
  'src/features/beard-studio/data/beardStudioRepository.integration.test.ts',
  'src/features/production/data/productionInventoryControl.integration.test.ts',
  'src/features/production/data/productionOutput.integration.test.ts',
  'src/features/packaging-run/data/packagingRun.integration.test.ts',
  'src/features/finished-goods-control/data/finishedGoodsLot.integration.test.ts',
  'src/features/recall-readiness/data/recallReadiness.integration.test.ts',
]
const selectedTests=process.argv.slice(2)
execFileSync('npx',['vitest','run','--maxWorkers=1',...(selectedTests.length?selectedTests:defaultTests)],{stdio:'inherit',env:{...process.env,VITE_SUPABASE_URL:url,VITE_SUPABASE_PUBLISHABLE_KEY:anon,VITE_SUPABASE_TEST_URL:url,VITE_SUPABASE_TEST_ANON_KEY:anon,VITE_SUPABASE_TEST_SERVICE_ROLE_KEY:service}})
