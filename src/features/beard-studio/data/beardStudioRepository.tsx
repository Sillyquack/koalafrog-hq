/* eslint-disable react-refresh/only-export-components, react-hooks/set-state-in-effect -- repository hydration synchronizes external records */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { configuredWorkspaceRuntime, type WorkspaceRuntimeMode } from '../../../platform/startup/runtimeMode'
import { useActiveWorkspace } from '../../../platform/startup/ActiveWorkspaceContext'
import { supabase } from '../../../platform/supabase/client'
import type { Database, Json } from '../../../platform/supabase/generated/database.types'
import { emptyBeardStudioState, groomingProductRoles, type BeardLengthMap, type BeardLogSnapshot, type BeardProfile, type BeardStudioState, type BeardTrimSession, type GroomingProductReference, type GroomingTool, type TrimRecipe } from '../domain/beardStudio'

export const STORAGE_KEY = 'koalafrog-hq:beard-studio:v1'
export interface BeardStudioRepository {
  readonly kind: WorkspaceRuntimeMode
  load(): BeardStudioState | Promise<BeardStudioState>
  save(state: BeardStudioState): void | Promise<void>
}

export class LocalBeardStudioRepository implements BeardStudioRepository {
  readonly kind = 'local' as const
  load() {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return emptyBeardStudioState()
    try { return JSON.parse(stored) as BeardStudioState } catch { return emptyBeardStudioState() }
  }
  save(state: BeardStudioState) { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }
}

type Tables = Database['public']['Tables']
type Row<Name extends keyof Tables> = Tables[Name]['Row']
export type StudioRows = {
  profiles: Row<'beard_profiles'>[]
  tools: Row<'grooming_tools'>[]
  attachments: Row<'grooming_tool_attachments'>[]
  maps: Row<'beard_length_maps'>[]
  zones: Row<'beard_length_map_zones'>[]
  recipes: Row<'trim_recipes'>[]
  steps: Row<'trim_recipe_steps'>[]
  sessions: Row<'beard_trim_sessions'>[]
  logs: Row<'beard_log_entries'>[]
  recipeProducts: Row<'trim_recipe_product_links'>[]
  logProducts: Row<'beard_log_product_links'>[]
}

const jsonObject = (value: Json): Record<string, Json | undefined> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, Json | undefined> : {}
const productReference = (row: Row<'trim_recipe_product_links'> | Row<'beard_log_product_links'>): GroomingProductReference => {
  const role=groomingProductRoles.find(candidate=>candidate===row.usage_role)
  if(!role)throw new Error(`Unsupported grooming Product role: ${row.usage_role}`)
  return { productId:row.product_id,nameSnapshot:row.product_name_snapshot,categorySnapshot:row.product_category_snapshot,role }
}
const parseLogSnapshot = (value: Json): BeardLogSnapshot => {
  const record=jsonObject(value)
  if(record.schemaVersion!==1||!record.profile||!record.recipe||!Array.isArray(record.tools)||!Array.isArray(record.products))throw new Error('Beard Log snapshot schema is invalid.')
  // The complete object was written by the typed payload builder; these required
  // structural guards prevent an arbitrary JSON value crossing the domain boundary.
  return value as unknown as BeardLogSnapshot
}

export function mapBeardStudioRows(rows: StudioRows): BeardStudioState {
  const profiles: BeardProfile[] = rows.profiles.map(row => {
    const details = jsonObject(row.profile_details)
    return {
      id: row.id, name: row.name, status: row.status as BeardProfile['status'], styleName: row.style_name, description: row.description,
      targetLook: row.target_look, maintenanceFrequencyDays: row.maintenance_frequency_days, preferredOverallLengthMm: Number(row.preferred_overall_length_mm),
      density: row.density as BeardProfile['density'], texture: row.texture as BeardProfile['texture'], growthNotes: String(details.growth_notes ?? ''),
      asymmetryNotes: String(details.asymmetry_notes ?? ''), weakAreaNotes: String(details.weak_area_notes ?? ''), moustachePreference: String(details.moustache_preference ?? ''),
      cheekLinePreference: String(details.cheek_line_preference ?? 'natural') as BeardProfile['cheekLinePreference'], necklinePreference: String(details.neckline_preference ?? 'natural') as BeardProfile['necklinePreference'],
      createdAt: row.created_at, updatedAt: row.updated_at,
    }
  })
  const tools: GroomingTool[] = rows.tools.map(row => ({
    id: row.id, name: row.name, brand: row.brand, model: row.model, type: row.tool_type as GroomingTool['type'],
    minimumLengthMm: row.minimum_length_mm === null ? null : Number(row.minimum_length_mm), maximumLengthMm: row.maximum_length_mm === null ? null : Number(row.maximum_length_mm),
    adjustmentIncrementMm: row.adjustment_increment_mm === null ? null : Number(row.adjustment_increment_mm),
    attachments: rows.attachments.filter(child => child.tool_id === row.id).sort((a,b) => a.display_order-b.display_order).map(child => ({ id: child.id, name: child.name })),
    washable: row.washable, notes: row.notes, primary: row.is_primary, status: row.status as GroomingTool['status'], createdAt: row.created_at, updatedAt: row.updated_at,
  }))
  const lengthMaps: BeardLengthMap[] = rows.maps.map(row => ({
    id: row.id, profileId: row.profile_id, createdAt: row.created_at, updatedAt: row.updated_at,
    zones: rows.zones.filter(child => child.length_map_id === row.id).sort((a,b)=>a.display_order-b.display_order).map(child => ({
      id: child.id, name: child.zone_name as BeardLengthMap['zones'][number]['name'], targetLengthMm: Number(child.target_length_mm),
      minimumLengthMm: child.minimum_length_mm === null ? null : Number(child.minimum_length_mm), maximumLengthMm: child.maximum_length_mm === null ? null : Number(child.maximum_length_mm),
      trimDirection: child.trim_direction as BeardLengthMap['zones'][number]['trimDirection'], toolId: child.tool_id, attachmentId: child.attachment_id,
      notes: child.notes, order: child.display_order, enabled: child.enabled,
    })),
  }))
  const recipes: TrimRecipe[] = rows.recipes.map(row => ({
    id: row.id, profileId: row.profile_id, name: row.name, status: row.status as TrimRecipe['status'], version: row.version,
    estimatedDurationMinutes: row.estimated_duration_minutes, startingCondition: row.starting_condition, preparationInstructions: row.preparation_instructions,
    finishingInstructions: row.finishing_instructions, preferredProducts: rows.recipeProducts.filter(link => link.recipe_id === row.id).sort((a,b)=>a.display_order-b.display_order).map(productReference),
    notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at,
    steps: rows.steps.filter(child => child.recipe_id === row.id).sort((a,b)=>a.display_order-b.display_order).map(child => ({
      id: child.id, order: child.display_order, title: child.title, zones: child.zones as TrimRecipe['steps'][number]['zones'],
      targetLengthMm: child.target_length_mm === null ? null : Number(child.target_length_mm), toolId: child.tool_id, attachmentId: child.attachment_id,
      trimDirection: child.trim_direction as TrimRecipe['steps'][number]['trimDirection'], technique: child.technique as TrimRecipe['steps'][number]['technique'],
      instruction: child.instruction, caution: child.caution, completionRequired: child.completion_required,
    })),
  }))
  const sessions: BeardTrimSession[] = rows.sessions.map(row => ({
    id: row.id, recipeId: row.recipe_id, recipeVersion: row.recipe_version, status: row.status as BeardTrimSession['status'],
    currentStepIndex: row.current_step_index, completedStepIds: row.completed_step_ids, skippedStepIds: row.skipped_step_ids,
    startedAt: row.started_at, updatedAt: row.updated_at, completedAt: row.completed_at,
  }))
  return {
    profiles, tools, lengthMaps, recipes, sessions,
    logs: [...rows.logs].sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at)).map(row => {
      const snapshot = parseLogSnapshot(row.immutable_snapshot)
      const products = rows.logProducts.filter(link => link.beard_log_entry_id === row.id).sort((a,b)=>a.display_order-b.display_order).map(productReference)
      return {
        id: row.id, sessionId: row.session_id, occurredAt: row.occurred_at, profileId: row.profile_id, recipeId: row.recipe_id, recipeVersion: row.recipe_version,
        startingCondition: row.starting_condition, daysSincePreviousTrim: row.days_since_previous_trim, durationMinutes: row.duration_minutes,
        overallRating: row.overall_rating, fadeRating: row.fade_rating, lineSharpnessRating: row.line_sharpness_rating, symmetryRating: row.symmetry_rating,
        comfortRating: row.comfort_rating, notes: row.notes, whatWorked: row.what_worked, changeNextTime: row.change_next_time,
        snapshot: { ...snapshot, products: products.length ? products : snapshot.products }, createdAt: row.created_at, updatedAt: row.updated_at,
      }
    }),
  }
}

export function beardStudioPayload(workspaceId: string, state: BeardStudioState): Json {
  const toJson = (value: unknown): Json => {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
    if (Array.isArray(value)) return value.map(toJson)
    if (typeof value === 'object') {
      const record: { [key: string]: Json | undefined } = {}
      for (const [key, child] of Object.entries(value)) record[key] = child === undefined ? undefined : toJson(child)
      return record
    }
    return null
  }
  const products = (items: GroomingProductReference[]) => items.map(item => ({ product_id: item.productId, name_snapshot: item.nameSnapshot, category_snapshot: item.categorySnapshot, role: item.role }))
  return toJson({
    workspace_id: workspaceId,
    profiles: state.profiles.map(item => ({ id:item.id,name:item.name,status:item.status,style_name:item.styleName,description:item.description,target_look:item.targetLook,maintenance_frequency_days:item.maintenanceFrequencyDays,preferred_overall_length_mm:item.preferredOverallLengthMm,density:item.density,texture:item.texture,profile_details:{growth_notes:item.growthNotes,asymmetry_notes:item.asymmetryNotes,weak_area_notes:item.weakAreaNotes,moustache_preference:item.moustachePreference,cheek_line_preference:item.cheekLinePreference,neckline_preference:item.necklinePreference},created_at:item.createdAt,updated_at:item.updatedAt })),
    tools: state.tools.map(item => ({ id:item.id,name:item.name,brand:item.brand,model:item.model,tool_type:item.type,minimum_length_mm:item.minimumLengthMm,maximum_length_mm:item.maximumLengthMm,adjustment_increment_mm:item.adjustmentIncrementMm,attachments:item.attachments.map(attachment=>({id:attachment.id,name:attachment.name})),washable:item.washable,notes:item.notes,is_primary:item.primary,status:item.status,created_at:item.createdAt,updated_at:item.updatedAt })),
    length_maps: state.lengthMaps.map(item => ({ id:item.id,profile_id:item.profileId,zones:item.zones.map(zone=>({id:zone.id,zone_name:zone.name,target_length_mm:zone.targetLengthMm,minimum_length_mm:zone.minimumLengthMm,maximum_length_mm:zone.maximumLengthMm,trim_direction:zone.trimDirection,tool_id:zone.toolId,attachment_id:zone.attachmentId,notes:zone.notes,display_order:zone.order,enabled:zone.enabled})),created_at:item.createdAt,updated_at:item.updatedAt })),
    recipes: state.recipes.map(item => ({ id:item.id,profile_id:item.profileId,name:item.name,status:item.status,version:item.version,estimated_duration_minutes:item.estimatedDurationMinutes,starting_condition:item.startingCondition,preparation_instructions:item.preparationInstructions,steps:item.steps.map(step=>({id:step.id,display_order:step.order,title:step.title,zones:step.zones,target_length_mm:step.targetLengthMm,tool_id:step.toolId,attachment_id:step.attachmentId,trim_direction:step.trimDirection,technique:step.technique,instruction:step.instruction,caution:step.caution,completion_required:step.completionRequired})),finishing_instructions:item.finishingInstructions,product_links:products(item.preferredProducts),notes:item.notes,created_at:item.createdAt,updated_at:item.updatedAt })),
    sessions: state.sessions.map(item => ({ id:item.id,recipe_id:item.recipeId,recipe_version:item.recipeVersion,status:item.status,current_step_index:item.currentStepIndex,completed_step_ids:item.completedStepIds,skipped_step_ids:item.skippedStepIds,started_at:item.startedAt,updated_at:item.updatedAt,completed_at:item.completedAt })),
    logs: state.logs.map(item => ({ id:item.id,session_id:item.sessionId,profile_id:item.profileId,recipe_id:item.recipeId,recipe_version:item.recipeVersion,occurred_at:item.occurredAt,starting_condition:item.startingCondition,days_since_previous_trim:item.daysSincePreviousTrim,duration_minutes:item.durationMinutes,overall_rating:item.overallRating,fade_rating:item.fadeRating,line_sharpness_rating:item.lineSharpnessRating,symmetry_rating:item.symmetryRating,comfort_rating:item.comfortRating,notes:item.notes,what_worked:item.whatWorked,change_next_time:item.changeNextTime,snapshot_schema_version:item.snapshot.schemaVersion,immutable_snapshot:item.snapshot,image_references:[],products:products(item.snapshot.products),created_at:item.createdAt,updated_at:item.updatedAt })),
  })
}

export class SupabaseBeardStudioRepository implements BeardStudioRepository {
  readonly kind = 'supabase' as const
  constructor(private readonly workspaceId: string, private readonly client: SupabaseClient<Database>) {}
  async load() {
    const responses = await Promise.all([
      this.client.from('beard_profiles').select('*').eq('workspace_id',this.workspaceId),
      this.client.from('grooming_tools').select('*').eq('workspace_id',this.workspaceId),
      this.client.from('grooming_tool_attachments').select('*').eq('workspace_id',this.workspaceId),
      this.client.from('beard_length_maps').select('*').eq('workspace_id',this.workspaceId),
      this.client.from('beard_length_map_zones').select('*').eq('workspace_id',this.workspaceId),
      this.client.from('trim_recipes').select('*').eq('workspace_id',this.workspaceId),
      this.client.from('trim_recipe_steps').select('*').eq('workspace_id',this.workspaceId),
      this.client.from('beard_trim_sessions').select('*').eq('workspace_id',this.workspaceId),
      this.client.from('beard_log_entries').select('*').eq('workspace_id',this.workspaceId),
      this.client.from('trim_recipe_product_links').select('*').eq('workspace_id',this.workspaceId),
      this.client.from('beard_log_product_links').select('*').eq('workspace_id',this.workspaceId),
    ])
    const failed=responses.find(response=>response.error)
    if(failed?.error)throw new Error(`Beard Studio could not be loaded: ${failed.error.message}`)
    const [profileResponse,toolResponse,attachmentResponse,mapResponse,zoneResponse,recipeResponse,stepResponse,sessionResponse,logResponse,recipeProductResponse,logProductResponse]=responses
    return mapBeardStudioRows({
      profiles:profileResponse.data??[],tools:toolResponse.data??[],attachments:attachmentResponse.data??[],maps:mapResponse.data??[],
      zones:zoneResponse.data??[],recipes:recipeResponse.data??[],steps:stepResponse.data??[],sessions:sessionResponse.data??[],
      logs:logResponse.data??[],recipeProducts:recipeProductResponse.data??[],logProducts:logProductResponse.data??[],
    })
  }
  async save(state: BeardStudioState) {
    const result = await this.client.rpc('save_beard_studio_workspace', { payload: beardStudioPayload(this.workspaceId, state) })
    if (result.error) {
      const message = result.error.code === '23505' ? 'Another Active Beard Studio record conflicts with this change. Refresh and retry.' : result.error.message
      throw new Error(`Beard Studio could not be saved: ${message}`)
    }
  }
}

export function selectBeardStudioRepository(runtime: WorkspaceRuntimeMode, workspaceId?: string, client = supabase): BeardStudioRepository {
  if (runtime === 'local') return new LocalBeardStudioRepository()
  if (!workspaceId || !client) throw new Error('Hosted Beard Studio requires an active authenticated workspace.')
  return new SupabaseBeardStudioRepository(workspaceId, client)
}

interface BeardStudioContextValue { state: BeardStudioState; pending: boolean; error: string; retry(): void; update(mutation: (current: BeardStudioState) => BeardStudioState): Promise<void> }
const BeardStudioContext = createContext<BeardStudioContextValue | null>(null)
export function BeardStudioProvider({ children, repository }: { children: ReactNode; repository?: BeardStudioRepository }) {
  const activeWorkspace = useActiveWorkspace()
  const selected = useMemo(() => repository ?? selectBeardStudioRepository(configuredWorkspaceRuntime, activeWorkspace?.workspaceId), [repository, activeWorkspace?.workspaceId])
  const [state, setState] = useState<BeardStudioState>(), [pending,setPending]=useState(true), [error,setError]=useState(''), [attempt,setAttempt]=useState(0)
  const load = useCallback(async () => { setPending(true);setError('');try{setState(await selected.load())}catch(cause){setError(cause instanceof Error?cause.message:'Beard Studio could not be loaded.')}finally{setPending(false)} },[selected])
  useEffect(()=>{void load()},[load,attempt])
  const update = async (mutation: (current: BeardStudioState) => BeardStudioState) => {
    if (!state || pending) return
    setPending(true);setError('')
    try { const next = mutation(state);await selected.save(next);setState(next) } catch(cause) { setError(cause instanceof Error?cause.message:'Beard Studio could not be saved.') } finally { setPending(false) }
  }
  if (!state && pending) return <section className="panel" aria-busy="true"><h2>Loading Beard Studio…</h2><p>Reading the selected {selected.kind} workspace.</p></section>
  if (!state) return <section className="panel" role="alert"><h2>Beard Studio unavailable</h2><p>{error}</p><p>{selected.kind === 'supabase' ? 'Hosted mode will not fall back to browser storage.' : 'Local data has not been changed.'}</p><button className="button primary" onClick={()=>setAttempt(value=>value+1)}>Retry</button></section>
  return <BeardStudioContext.Provider value={{ state, pending, error, retry:()=>setAttempt(value=>value+1), update }}>{error&&<div className="form-error beard-runtime-error" role="alert"><strong>Save failed</strong><span>{error}</span><button className="button small" onClick={()=>setError('')}>Dismiss</button></div>}{children}</BeardStudioContext.Provider>
}
export function useBeardStudio() {
  const value = useContext(BeardStudioContext)
  if (!value) throw new Error('useBeardStudio must be used inside BeardStudioProvider.')
  return value
}
