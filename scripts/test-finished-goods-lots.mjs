import { execFileSync } from "node:child_process";
const status=execFileSync("npx",["supabase","status","-o","env"],{encoding:"utf8"});
const values=Object.fromEntries(status.split("\n").map(line=>line.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map(match=>[match[1],match[2]]));
const localUrl=values.API_URL??"http://127.0.0.1:54321",anon=values.ANON_KEY??values.PUBLISHABLE_KEY,service=values.SERVICE_ROLE_KEY??values.SECRET_KEY;
if(!anon||!service)throw new Error("Local Supabase keys were not reported.");
execFileSync("npx",["supabase","test","db","supabase/tests/finished_goods_lot_creation_quarantine.sql"],{stdio:"inherit"});
execFileSync("npx",["supabase","test","db","supabase/tests/finished_product_quality_release.sql"],{stdio:"inherit"});
execFileSync("npx",["vitest","run","--maxWorkers=1","src/features/finished-goods-control/data/finishedGoodsLot.integration.test.ts"],{stdio:"inherit",env:{...process.env,VITE_SUPABASE_URL:localUrl,VITE_SUPABASE_PUBLISHABLE_KEY:anon,VITE_SUPABASE_TEST_URL:localUrl,VITE_SUPABASE_TEST_ANON_KEY:anon,VITE_SUPABASE_TEST_SERVICE_ROLE_KEY:service}});
