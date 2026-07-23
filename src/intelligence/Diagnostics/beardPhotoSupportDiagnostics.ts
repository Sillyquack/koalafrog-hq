import { supabase } from '../../platform/supabase/client'

type NullableString = string | null

export interface BeardPhotoSupportDiagnostic {
  supportId: string
  analysisId: string
  status: 'failed' | 'completed' | 'completed_cleanup_required'
  errorCode: NullableString
  failureStage: NullableString
  ruleCode: NullableString
  jsonPath: NullableString
  validator: NullableString
  expectedCategory: NullableString
  receivedCategory: NullableString
  failureSchemaVersion: number | null
  traceVersion: NullableString
  persistence: {
    step: NullableString
    table: NullableString
    operation: NullableString
    sqlstate: NullableString
    constraint: NullableString
    entityType: NullableString
    entityIndex: number | null
    diagnosticVersion: NullableString
  }
  provenance: {
    provider: NullableString
    model: NullableString
    promptVersion: NullableString
    contractVersion: NullableString
    schemaVersion: number
    semanticVersion: NullableString
  }
  providerTrace: {
    stage: NullableString
    failureClassification: NullableString
    timeoutSource: NullableString
    timeoutBudgetMs: number | null
    providerElapsedMs: number | null
    edgeFunctionElapsedMs: number | null
    requestDispatched: boolean | null
    responseHeadersReceived: boolean | null
    responseBodyCompleted: boolean | null
    httpStatusClass: NullableString
    abortSignalAborted: boolean | null
    abortReasonCode: NullableString
    transportErrorCategory: NullableString
    providerRequestIdPresent: boolean | null
    responsePresent: boolean | null
    usagePresent: boolean | null
  }
  attemptCount: number
  providerAttemptedAt: NullableString
  terminalAt: NullableString
  cleanupState: 'pending' | 'deleted' | 'cleanup_required' | null
  cleanupCompletedAt: NullableString
  resultPresent: boolean
  providerUsagePresent: boolean
}

export type BeardPhotoSupportRpcCode =
  | 'SUPPORT_RPC_NOT_FOUND'
  | 'SUPPORT_RPC_UNAVAILABLE'
  | 'SUPPORT_RPC_RESPONSE_INVALID'

interface BeardPhotoSupportRpcError {
  code?: unknown
  [key: string]: unknown
}

export interface BeardPhotoSupportRpcResponse {
  data: unknown
  error: BeardPhotoSupportRpcError | null
  status?: number
}

interface BeardPhotoSupportRpcClient {
  rpc(name: string, args: Record<string, string>): Promise<BeardPhotoSupportRpcResponse>
}

export class BeardPhotoSupportRpcFailure extends Error {
  readonly code: Exclude<BeardPhotoSupportRpcCode, 'SUPPORT_RPC_NOT_FOUND'>
  readonly metadata: Readonly<{
    classification: Exclude<BeardPhotoSupportRpcCode, 'SUPPORT_RPC_NOT_FOUND'>
    httpStatus?: number
    postgrestCode?: string
  }>

  constructor(
    code: Exclude<BeardPhotoSupportRpcCode, 'SUPPORT_RPC_NOT_FOUND'>,
    response: Pick<BeardPhotoSupportRpcResponse, 'error' | 'status'>,
  ) {
    super('Support diagnostics are unavailable.')
    this.name = 'BeardPhotoSupportRpcFailure'
    this.code = code
    const postgrestCode = typeof response.error?.code === 'string' ? response.error.code : undefined
    this.metadata = {
      classification: code,
      ...(Number.isInteger(response.status) ? { httpStatus: response.status } : {}),
      ...(postgrestCode ? { postgrestCode } : {}),
    }
  }
}

const supportIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const isValidBeardPhotoSupportId = (value: string) => supportIdPattern.test(value)
const safePathPattern = /^\$(?:\.[A-Za-z][A-Za-z0-9]*|\[[0-9]+\])*$/
const safeExpected = new Set(['object','array','string','number','integer','boolean','null','required','allowed enum','constant','unique id','known reference','valid observation key','unique observation key','safe text','non-calibrated grooming language','non-medical observation','non-sensitive observation','grooming-only recommendation','unambiguous safe language','completed response'])
const safeReceived = new Set(['object','array','string','number','integer','boolean','null','missing','unexpected','duplicate','unknown reference','unsafe text','invalid observation key','incomplete','unknown','unsupported measurement claim','medical assertion','infection assertion','biological cause assertion','sensitive trait inference','personal inference','unsafe recommendation','ambiguous sensitive reference'])
const providerStages = new Set(['provider_prepare_started','provider_dispatch_started','provider_dispatched','provider_response_headers_received','provider_response_body_started','provider_response_body_completed','provider_response_parsed','provider_timeout_triggered','provider_transport_failed','provider_http_error_received','provider_completed'])
const providerClassifications = new Set(['PROVIDER_TIMEOUT_RESPONSE_HEADERS','PROVIDER_TIMEOUT_RESPONSE_BODY','PROVIDER_TRANSPORT_NETWORK','PROVIDER_HTTP_ERROR','PROVIDER_RESPONSE_PARSE_FAILED','PROVIDER_CALLER_ABORTED'])
const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const nullableString = (value: unknown): value is NullableString => value === null || typeof value === 'string'
const nullableNumber = (value: unknown): value is number | null => value === null || typeof value === 'number'

export function validateBeardPhotoSupportDiagnostic(value: unknown): value is BeardPhotoSupportDiagnostic {
  if (!record(value) || !exactKeys(value, [
    'supportId','analysisId','status','errorCode','failureStage','ruleCode','jsonPath','validator',
    'expectedCategory','receivedCategory','failureSchemaVersion','traceVersion','persistence','provenance','providerTrace',
    'attemptCount','providerAttemptedAt','terminalAt','cleanupState','cleanupCompletedAt',
    'resultPresent','providerUsagePresent',
  ])) return false
  if (!supportIdPattern.test(String(value.supportId)) || !supportIdPattern.test(String(value.analysisId)) || !['failed','completed','completed_cleanup_required'].includes(String(value.status))) return false
  if (![value.errorCode,value.failureStage,value.ruleCode,value.jsonPath,value.validator,value.expectedCategory,value.receivedCategory,value.traceVersion,value.providerAttemptedAt,value.terminalAt,value.cleanupCompletedAt].every(nullableString)) return false
  const jsonPath = value.jsonPath as NullableString
  const expectedCategory = value.expectedCategory as NullableString
  const receivedCategory = value.receivedCategory as NullableString
  if (jsonPath !== null && (jsonPath.length > 160 || !safePathPattern.test(jsonPath))) return false
  if (expectedCategory !== null && !safeExpected.has(expectedCategory)) return false
  if (receivedCategory !== null && !safeReceived.has(receivedCategory)) return false
  if (!nullableNumber(value.failureSchemaVersion) || !Number.isInteger(value.attemptCount) || Number(value.attemptCount) < 0) return false
  if (![null,'pending','deleted','cleanup_required'].includes(value.cleanupState as never) || typeof value.resultPresent !== 'boolean' || typeof value.providerUsagePresent !== 'boolean') return false
  if (!record(value.persistence) || !exactKeys(value.persistence, ['step','table','operation','sqlstate','constraint','entityType','entityIndex','diagnosticVersion'])) return false
  if (![value.persistence.step,value.persistence.table,value.persistence.operation,value.persistence.sqlstate,value.persistence.constraint,value.persistence.entityType,value.persistence.diagnosticVersion].every(nullableString) || !nullableNumber(value.persistence.entityIndex)) return false
  if (!record(value.provenance) || !exactKeys(value.provenance, ['provider','model','promptVersion','contractVersion','schemaVersion','semanticVersion'])) return false
  if (![value.provenance.provider,value.provenance.model,value.provenance.promptVersion,value.provenance.contractVersion,value.provenance.semanticVersion].every(nullableString) || ![1,2].includes(value.provenance.schemaVersion as number)) return false
  if (!record(value.providerTrace) || !exactKeys(value.providerTrace, [
    'stage','failureClassification','timeoutSource','timeoutBudgetMs','providerElapsedMs',
    'edgeFunctionElapsedMs','requestDispatched','responseHeadersReceived','responseBodyCompleted',
    'httpStatusClass','abortSignalAborted','abortReasonCode','transportErrorCategory',
    'providerRequestIdPresent','responsePresent','usagePresent',
  ])) return false
  const trace = value.providerTrace
  if (![trace.stage,trace.failureClassification,trace.timeoutSource,trace.httpStatusClass,trace.abortReasonCode,trace.transportErrorCategory].every(nullableString)) return false
  if (![trace.timeoutBudgetMs,trace.providerElapsedMs,trace.edgeFunctionElapsedMs].every(nullableNumber)) return false
  if (trace.stage !== null && !providerStages.has(trace.stage as string)) return false
  if (trace.failureClassification !== null && !providerClassifications.has(trace.failureClassification as string)) return false
  if (trace.timeoutSource !== null && !['application_deadline','caller'].includes(trace.timeoutSource as string)) return false
  if (trace.httpStatusClass !== null && !['2xx','4xx','5xx','other'].includes(trace.httpStatusClass as string)) return false
  if (trace.abortReasonCode !== null && !['application_deadline','caller'].includes(trace.abortReasonCode as string)) return false
  if (trace.transportErrorCategory !== null && trace.transportErrorCategory !== 'network') return false
  if ([trace.timeoutBudgetMs,trace.providerElapsedMs,trace.edgeFunctionElapsedMs].some(item => item !== null && (!Number.isInteger(item) || Number(item) < 0))) return false
  return [trace.requestDispatched,trace.responseHeadersReceived,trace.responseBodyCompleted,trace.abortSignalAborted,trace.providerRequestIdPresent,trace.responsePresent,trace.usagePresent].every(item => item === null || typeof item === 'boolean')
}

export function interpretBeardPhotoSupportRpcResponse(response: BeardPhotoSupportRpcResponse) {
  if (response.error) throw new BeardPhotoSupportRpcFailure('SUPPORT_RPC_UNAVAILABLE', response)
  if (response.data === null) {
    return { code: 'SUPPORT_RPC_NOT_FOUND' as const, diagnostic: undefined }
  }
  if (!validateBeardPhotoSupportDiagnostic(response.data)) {
    throw new BeardPhotoSupportRpcFailure('SUPPORT_RPC_RESPONSE_INVALID', response)
  }
  return { code: undefined, diagnostic: response.data }
}

export async function lookupBeardPhotoSupportDiagnostic(workspaceId: string, supportId: string) {
  if (!supabase || !isValidBeardPhotoSupportId(supportId)) return undefined
  const response = await (supabase as unknown as BeardPhotoSupportRpcClient).rpc(
    'lookup_beard_analysis_support_diagnostic',
    {
      candidate_workspace_id: workspaceId,
      candidate_support_id: supportId,
    },
  )
  return interpretBeardPhotoSupportRpcResponse(response).diagnostic
}
