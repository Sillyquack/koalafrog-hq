import{renderToStaticMarkup}from'react-dom/server'
import{describe,expect,it}from'vitest'
import type{ProcurementProviderDiagnostic}from'../domain/assistedResearch'
import{ResearchDiagnosticPanel}from'./ResearchDiagnosticPanel'

const diagnostic:ProcurementProviderDiagnostic={
 job_id:'job-1',
 provider_called:true,
 provider_stage:'provider_timeout_triggered',
 provider_started_at:'2026-07-23T12:00:00Z',
 provider_headers_at:null,
 provider_body_completed_at:null,
 provider_parse_completed_at:null,
 provider_validation_completed_at:null,
 provider_elapsed_ms:75000,
 function_elapsed_ms:75483,
 timeout_limit_ms:75000,
 timeout_stage:'response_headers',
 abort_source:'application_deadline',
 provider_http_status:null,
 usage_present:false,
 validated_candidate_count:null,
 terminal_error_code:'PROVIDER_TIMEOUT',
 diagnostic_version:1,
 created_at:'2026-07-23T12:00:00Z',
 updated_at:'2026-07-23T12:01:15Z',
}

describe('Research provider diagnostic panel',()=>{
 it('renders nothing for legacy jobs without diagnostics',()=>{
  expect(renderToStaticMarkup(<ResearchDiagnosticPanel diagnostic={undefined}/>)).toBe('')
 })

 it('is collapsed by default and renders allowlisted owner-safe labels',()=>{
  const html=renderToStaticMarkup(<ResearchDiagnosticPanel diagnostic={diagnostic}/>)
  expect(html).toContain('<details class="research-diagnostic">')
  expect(html).not.toContain('<details open')
  expect(html).toContain('response headers')
  expect(html).toContain('75000 ms')
  expect(html).toContain('Headers received')
  expect(html).not.toContain('secret-provider-payload-canary')
  expect(Object.keys(diagnostic)).not.toEqual(expect.arrayContaining([
   'prompt','raw_response','authorization','provider_request_id',
  ]))
 })
})
