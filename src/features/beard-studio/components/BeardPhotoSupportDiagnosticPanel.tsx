import { useEffect, useState } from 'react'
import { lookupBeardPhotoSupportDiagnostic, type BeardPhotoSupportDiagnostic } from '../../../intelligence/Diagnostics/beardPhotoSupportDiagnostics'

const shown = (value: string | number | null) => value ?? 'Unavailable'
const shownFlag = (value: boolean | null) => value === null ? 'Unavailable' : value ? 'Yes' : 'No'

export function BeardPhotoSupportDiagnosticPanel({workspaceId,supportId}:{workspaceId:string;supportId:string}) {
  const [diagnostic,setDiagnostic]=useState<BeardPhotoSupportDiagnostic>()
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  useEffect(()=>{let active=true;void lookupBeardPhotoSupportDiagnostic(workspaceId,supportId).then(value=>{if(active)setDiagnostic(value)}).catch(()=>{if(active)setError('Support diagnostics are unavailable.')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[workspaceId,supportId])

  if(loading)return <section className="beard-support-diagnostic" aria-live="polite"><h4>Analysis metadata</h4><p>Loading safe diagnostic metadata…</p></section>
  if(error)return <section className="beard-support-diagnostic"><h4>Analysis metadata</h4><p>{error}</p></section>
  if(!diagnostic)return <section className="beard-support-diagnostic"><h4>Analysis metadata</h4><p>No owner-visible diagnostic metadata is available for this support ID.</p></section>

  return <section className="beard-support-diagnostic" aria-label="Safe support diagnostics">
    <h4>Analysis metadata</h4>
    <dl>
      <div><dt>Status</dt><dd>{diagnostic.status}</dd></div>
      <div><dt>Failure code</dt><dd>{shown(diagnostic.errorCode)}</dd></div>
      <div><dt>Stage</dt><dd>{shown(diagnostic.failureStage)}</dd></div>
      <div><dt>Rule</dt><dd>{shown(diagnostic.ruleCode)}</dd></div>
      <div><dt>Safe path</dt><dd>{shown(diagnostic.jsonPath)}</dd></div>
      <div><dt>Support ID</dt><dd>{diagnostic.supportId}</dd></div>
      <div><dt>Provider</dt><dd>{shown(diagnostic.provenance.provider)}</dd></div>
      <div><dt>Model</dt><dd>{shown(diagnostic.provenance.model)}</dd></div>
      <div><dt>Versions</dt><dd>Schema {diagnostic.provenance.schemaVersion} · {shown(diagnostic.provenance.contractVersion)} · {shown(diagnostic.provenance.promptVersion)} · {shown(diagnostic.provenance.semanticVersion)}</dd></div>
      <div><dt>Provider attempts</dt><dd>{diagnostic.attemptCount}</dd></div>
      <div><dt>Provider attempted</dt><dd>{shown(diagnostic.providerAttemptedAt)}</dd></div>
      <div><dt>Provider stage</dt><dd>{shown(diagnostic.providerTrace.stage)}</dd></div>
      <div><dt>Provider classification</dt><dd>{shown(diagnostic.providerTrace.failureClassification)}</dd></div>
      <div><dt>Timeout source / budget</dt><dd>{shown(diagnostic.providerTrace.timeoutSource)} · {shown(diagnostic.providerTrace.timeoutBudgetMs)}{diagnostic.providerTrace.timeoutBudgetMs === null ? '' : ' ms'}</dd></div>
      <div><dt>Provider elapsed</dt><dd>{shown(diagnostic.providerTrace.providerElapsedMs)}{diagnostic.providerTrace.providerElapsedMs === null ? '' : ' ms'}</dd></div>
      <div><dt>Function elapsed</dt><dd>{shown(diagnostic.providerTrace.edgeFunctionElapsedMs)}{diagnostic.providerTrace.edgeFunctionElapsedMs === null ? '' : ' ms'}</dd></div>
      <div><dt>Terminal time</dt><dd>{shown(diagnostic.terminalAt)}</dd></div>
      <div><dt>Image cleanup</dt><dd>{shown(diagnostic.cleanupState)}{diagnostic.cleanupCompletedAt?` · ${diagnostic.cleanupCompletedAt}`:''}</dd></div>
    </dl>
    <details><summary>Safe developer details</summary><dl>
      <div><dt>Expected category</dt><dd>{shown(diagnostic.expectedCategory)}</dd></div>
      <div><dt>Received category</dt><dd>{shown(diagnostic.receivedCategory)}</dd></div>
      <div><dt>Validator</dt><dd>{shown(diagnostic.validator)}</dd></div>
      <div><dt>Trace version</dt><dd>{shown(diagnostic.traceVersion)}</dd></div>
      <div><dt>Persistence step</dt><dd>{shown(diagnostic.persistence.step)}</dd></div>
      <div><dt>Persistence target</dt><dd>{shown(diagnostic.persistence.table)} · {shown(diagnostic.persistence.operation)}</dd></div>
      <div><dt>SQLSTATE / constraint</dt><dd>{shown(diagnostic.persistence.sqlstate)} · {shown(diagnostic.persistence.constraint)}</dd></div>
      <div><dt>Logical entity</dt><dd>{shown(diagnostic.persistence.entityType)} · {shown(diagnostic.persistence.entityIndex)}</dd></div>
      <div><dt>Persistence diagnostic</dt><dd>{shown(diagnostic.persistence.diagnosticVersion)}</dd></div>
      <div><dt>Result stored</dt><dd>{diagnostic.resultPresent?'Yes':'No'}</dd></div>
      <div><dt>Provider usage stored</dt><dd>{diagnostic.providerUsagePresent?'Yes':'No'}</dd></div>
      <div><dt>Request dispatched</dt><dd>{shownFlag(diagnostic.providerTrace.requestDispatched)}</dd></div>
      <div><dt>Headers received</dt><dd>{shownFlag(diagnostic.providerTrace.responseHeadersReceived)}</dd></div>
      <div><dt>Body completed</dt><dd>{shownFlag(diagnostic.providerTrace.responseBodyCompleted)}</dd></div>
      <div><dt>HTTP status class</dt><dd>{shown(diagnostic.providerTrace.httpStatusClass)}</dd></div>
      <div><dt>Abort reason</dt><dd>{shown(diagnostic.providerTrace.abortReasonCode)}</dd></div>
      <div><dt>Transport category</dt><dd>{shown(diagnostic.providerTrace.transportErrorCategory)}</dd></div>
      <div><dt>Provider request ID present</dt><dd>{shownFlag(diagnostic.providerTrace.providerRequestIdPresent)}</dd></div>
    </dl></details>
  </section>
}
