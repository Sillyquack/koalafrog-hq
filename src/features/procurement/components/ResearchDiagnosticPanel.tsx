import type{ProcurementProviderDiagnostic}from'../domain/assistedResearch'

const shown=(value:string|number|null)=>value==null?'Unknown':String(value).replaceAll('_',' ')
const yesNo=(value:boolean|null)=>value==null?'Unknown':value?'Yes':'No'

export function ResearchDiagnosticPanel({diagnostic}:{diagnostic:ProcurementProviderDiagnostic|undefined}){
 if(!diagnostic)return null
 return<details className="research-diagnostic">
  <summary>Provider diagnostics</summary>
  <p>Safe runtime metadata only. No prompt, provider response, credentials, or supplier content is stored.</p>
  <dl>
   <div><dt>Provider stage</dt><dd>{shown(diagnostic.provider_stage)}</dd></div>
   <div><dt>Timeout stage</dt><dd>{shown(diagnostic.timeout_stage)}</dd></div>
   <div><dt>Provider elapsed</dt><dd>{diagnostic.provider_elapsed_ms==null?'Unknown':`${diagnostic.provider_elapsed_ms} ms`}</dd></div>
   <div><dt>Function elapsed</dt><dd>{diagnostic.function_elapsed_ms==null?'Unknown':`${diagnostic.function_elapsed_ms} ms`}</dd></div>
   <div><dt>Timeout limit</dt><dd>{diagnostic.timeout_limit_ms==null?'Unknown':`${diagnostic.timeout_limit_ms} ms`}</dd></div>
   <div><dt>Abort source</dt><dd>{shown(diagnostic.abort_source)}</dd></div>
   <div><dt>Provider called</dt><dd>{yesNo(diagnostic.provider_called)}</dd></div>
   <div><dt>Headers received</dt><dd>{yesNo(diagnostic.provider_headers_at!=null)}</dd></div>
   <div><dt>Body completed</dt><dd>{yesNo(diagnostic.provider_body_completed_at!=null)}</dd></div>
   <div><dt>Parse completed</dt><dd>{yesNo(diagnostic.provider_parse_completed_at!=null)}</dd></div>
   <div><dt>Validation completed</dt><dd>{yesNo(diagnostic.provider_validation_completed_at!=null)}</dd></div>
   <div><dt>HTTP status</dt><dd>{shown(diagnostic.provider_http_status)}</dd></div>
   <div><dt>Usage reported</dt><dd>{yesNo(diagnostic.usage_present)}</dd></div>
   <div><dt>Validated candidates</dt><dd>{shown(diagnostic.validated_candidate_count)}</dd></div>
  </dl>
 </details>
}
