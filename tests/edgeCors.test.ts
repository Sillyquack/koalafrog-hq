import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'
import {corsHeaders} from '@supabase/supabase-js/cors'
const source=readFileSync(new URL('../supabase/functions/koalafrog-intelligence/index.ts',import.meta.url),'utf8')
describe('koalafrog-intelligence browser CORS',()=>{
  it('allows the Supabase browser client preflight headers',()=>{expect(corsHeaders['Access-Control-Allow-Origin']).toBe('*');for(const header of ['authorization','x-client-info','apikey','content-type'])expect(corsHeaders['Access-Control-Allow-Headers']).toContain(header)})
  it('handles OPTIONS before authentication',()=>expect(source.indexOf('req.method === "OPTIONS"')).toBeLessThan(source.indexOf('req.headers.get("Authorization")')))
  it('applies the same CORS headers to JSON error responses',()=>{expect(source).toContain('headers: { ...corsHeaders, "Content-Type": "application/json" }');expect(source).toContain('code: "NETWORK_FAILURE"')})
})
