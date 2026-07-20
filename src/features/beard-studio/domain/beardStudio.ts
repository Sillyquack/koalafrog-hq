export type BeardProfileStatus = 'Draft' | 'Active' | 'Archived'
export type TrimDirection = 'with growth' | 'against growth' | 'across growth' | 'detail only'
export type RecipeStatus = BeardProfileStatus
export type TrimSessionStatus = 'in_progress' | 'paused' | 'completed' | 'abandoned'

export interface BeardProfile {
  id: string
  name: string
  status: BeardProfileStatus
  styleName: string
  description: string
  targetLook: string
  maintenanceFrequencyDays: number
  preferredOverallLengthMm: number
  density: 'light' | 'medium' | 'dense' | 'mixed'
  texture: 'straight' | 'wavy' | 'curly' | 'coarse' | 'mixed'
  growthNotes: string
  asymmetryNotes: string
  weakAreaNotes: string
  moustachePreference: string
  cheekLinePreference: 'natural' | 'lightly defined' | 'sharply defined'
  necklinePreference: 'natural' | 'defined'
  createdAt: string
  updatedAt: string
}

export interface GroomingToolAttachment { id: string; name: string }
export interface GroomingTool {
  id: string
  name: string
  brand: string
  model: string
  type: 'beard trimmer' | 'detail trimmer' | 'foil shaver' | 'razor' | 'scissors' | 'comb' | 'brush' | 'other'
  minimumLengthMm: number | null
  maximumLengthMm: number | null
  adjustmentIncrementMm: number | null
  attachments: GroomingToolAttachment[]
  washable: boolean
  notes: string
  primary: boolean
  status: 'active' | 'retired'
  createdAt: string
  updatedAt: string
}

export const beardZoneNames = ['upper sideburn', 'lower sideburn', 'upper cheek', 'lower cheek', 'jaw left', 'jaw right', 'chin', 'under-chin', 'moustache', 'soul patch', 'neckline transition'] as const
export type BeardZoneName = typeof beardZoneNames[number]
export interface BeardLengthZone {
  id: string
  name: BeardZoneName
  targetLengthMm: number
  minimumLengthMm: number | null
  maximumLengthMm: number | null
  trimDirection: TrimDirection
  toolId: string | null
  attachmentId: string | null
  notes: string
  order: number
  enabled: boolean
}
export interface BeardLengthMap { id: string; profileId: string; zones: BeardLengthZone[]; createdAt: string; updatedAt: string }

export type TrimTechnique = 'full pass' | 'light pass' | 'flick-out' | 'blend' | 'define line' | 'detail' | 'freehand' | 'scissors'
export interface TrimRecipeStep {
  id: string
  order: number
  title: string
  zones: BeardZoneName[]
  targetLengthMm: number | null
  toolId: string | null
  attachmentId: string | null
  trimDirection: TrimDirection | null
  technique: TrimTechnique
  instruction: string
  caution: string
  completionRequired: boolean
}
export const groomingProductRoles = ['pre-trim', 'beard wash', 'conditioner', 'beard oil', 'beard butter', 'beard balm', 'styling product', 'post-trim soothing', 'fragrance'] as const
export type GroomingProductRole = typeof groomingProductRoles[number]
export interface GroomingProductReference { productId: string | null; nameSnapshot: string; categorySnapshot: string; role: GroomingProductRole }
export interface TrimRecipe {
  id: string
  profileId: string
  name: string
  status: RecipeStatus
  version: number
  estimatedDurationMinutes: number
  startingCondition: string
  preparationInstructions: string
  steps: TrimRecipeStep[]
  finishingInstructions: string
  preferredProducts: GroomingProductReference[]
  notes: string
  createdAt: string
  updatedAt: string
}

export interface BeardTrimSession {
  id: string
  recipeId: string
  recipeVersion: number
  status: TrimSessionStatus
  currentStepIndex: number
  completedStepIds: string[]
  skippedStepIds: string[]
  startedAt: string
  updatedAt: string
  completedAt: string | null
}

export interface BeardLogSnapshot {
  schemaVersion: 1
  profile: BeardProfile
  recipe: TrimRecipe
  lengthMap: BeardLengthMap | null
  tools: GroomingTool[]
  products: GroomingProductReference[]
}
export interface BeardLogEntry {
  id: string
  sessionId: string | null
  occurredAt: string
  profileId: string
  recipeId: string | null
  recipeVersion: number | null
  startingCondition: string
  daysSincePreviousTrim: number | null
  durationMinutes: number | null
  overallRating: number
  fadeRating: number | null
  lineSharpnessRating: number | null
  symmetryRating: number | null
  comfortRating: number | null
  notes: string
  whatWorked: string
  changeNextTime: string
  snapshot: BeardLogSnapshot
  createdAt: string
  updatedAt: string
}

export interface BeardStudioState {
  profiles: BeardProfile[]
  lengthMaps: BeardLengthMap[]
  tools: GroomingTool[]
  recipes: TrimRecipe[]
  sessions: BeardTrimSession[]
  logs: BeardLogEntry[]
}

export const emptyBeardStudioState = (): BeardStudioState => ({ profiles: [], lengthMaps: [], tools: [], recipes: [], sessions: [], logs: [] })
const id = () => crypto.randomUUID()
const now = () => new Date().toISOString()
export const starterZoneLengths: Record<BeardZoneName, number> = {
  'upper sideburn': 3, 'lower sideburn': 5, 'upper cheek': 7, 'lower cheek': 7, 'jaw left': 9, 'jaw right': 9,
  chin: 12, 'under-chin': 10, moustache: 8, 'soul patch': 9, 'neckline transition': 5,
}

export function validateProfile(profile: BeardProfile) {
  const errors: string[] = []
  if (!profile.name.trim()) errors.push('Profile name is required.')
  if (!profile.styleName.trim()) errors.push('Style name is required.')
  if (!Number.isFinite(profile.maintenanceFrequencyDays) || profile.maintenanceFrequencyDays < 1) errors.push('Maintenance frequency must be at least 1 day.')
  if (!Number.isFinite(profile.preferredOverallLengthMm) || profile.preferredOverallLengthMm < 0) errors.push('Preferred length must be zero or greater.')
  return errors
}

export function activateProfile(state: BeardStudioState, profileId: string): BeardStudioState {
  if (!state.profiles.some(profile => profile.id === profileId && profile.status !== 'Archived')) throw new Error('Only a non-archived profile can be activated.')
  const updatedAt = now()
  return { ...state, profiles: state.profiles.map(profile => ({ ...profile, status: profile.id === profileId ? 'Active' : profile.status === 'Active' ? 'Draft' : profile.status, updatedAt })) }
}

export function validateToolLength(tool: GroomingTool | undefined, lengthMm: number) {
  if (!tool) return null
  if (tool.minimumLengthMm !== null && lengthMm < tool.minimumLengthMm) return `${lengthMm} mm is below ${tool.name}'s configured minimum of ${tool.minimumLengthMm} mm.`
  if (tool.maximumLengthMm !== null && lengthMm > tool.maximumLengthMm) return `${lengthMm} mm is above ${tool.name}'s configured maximum of ${tool.maximumLengthMm} mm.`
  return null
}

export function activateRecipe(state: BeardStudioState, recipeId: string): BeardStudioState {
  const target = state.recipes.find(recipe => recipe.id === recipeId)
  if (!target || target.status === 'Archived') throw new Error('Only a non-archived recipe can be activated.')
  const updatedAt = now()
  return { ...state, recipes: state.recipes.map(recipe => ({ ...recipe, status: recipe.id === recipeId ? 'Active' : recipe.profileId === target.profileId && recipe.status === 'Active' ? 'Draft' : recipe.status, updatedAt })) }
}

export function deriveRecipeDraft(recipe: TrimRecipe): TrimRecipe {
  const timestamp = now()
  return { ...structuredClone(recipe), id: id(), status: 'Draft', version: recipe.version + 1, steps: recipe.steps.map(step => ({ ...step, id: id() })), createdAt: timestamp, updatedAt: timestamp }
}

export function startTrim(state: BeardStudioState, recipeId: string): BeardStudioState {
  const recipe = state.recipes.find(item => item.id === recipeId && item.status === 'Active')
  if (!recipe) throw new Error('Trim Mode requires an Active recipe.')
  const timestamp = now()
  return { ...state, sessions: [...state.sessions, { id: id(), recipeId, recipeVersion: recipe.version, status: 'in_progress', currentStepIndex: 0, completedStepIds: [], skippedStepIds: [], startedAt: timestamp, updatedAt: timestamp, completedAt: null }] }
}

export function progressTrimSession(session: BeardTrimSession, recipe: TrimRecipe, action: 'next' | 'previous' | 'skip' | 'pause' | 'resume' | 'exit'): BeardTrimSession {
  const timestamp = now()
  if (action === 'pause') return { ...session, status: 'paused', updatedAt: timestamp }
  if (action === 'resume') return { ...session, status: 'in_progress', updatedAt: timestamp }
  if (action === 'exit') return { ...session, status: 'abandoned', updatedAt: timestamp }
  if (action === 'previous') return { ...session, currentStepIndex: Math.max(0, session.currentStepIndex - 1), updatedAt: timestamp }
  const step = recipe.steps[session.currentStepIndex]
  const completedStepIds = action === 'next' && step ? [...new Set([...session.completedStepIds, step.id])] : session.completedStepIds
  const skippedStepIds = action === 'skip' && step ? [...new Set([...session.skippedStepIds, step.id])] : session.skippedStepIds
  const atEnd = session.currentStepIndex >= recipe.steps.length - 1
  return { ...session, currentStepIndex: atEnd ? session.currentStepIndex : session.currentStepIndex + 1, completedStepIds, skippedStepIds, status: atEnd ? 'completed' : 'in_progress', completedAt: atEnd ? timestamp : null, updatedAt: timestamp }
}

export function validateRating(value: number | null, required = false) {
  if (value === null) return required ? 'A rating is required.' : null
  return Number.isInteger(value) && value >= 1 && value <= 5 ? null : 'Ratings must be whole numbers from 1 to 5.'
}

export function createLogFromSession(state: BeardStudioState, sessionId: string, ratings: Pick<BeardLogEntry, 'overallRating' | 'fadeRating' | 'lineSharpnessRating' | 'symmetryRating' | 'comfortRating'>, notes = '', productsUsed?: GroomingProductReference[]): BeardStudioState {
  const session = state.sessions.find(item => item.id === sessionId)
  const recipe = session && state.recipes.find(item => item.id === session.recipeId)
  const profile = recipe && state.profiles.find(item => item.id === recipe.profileId)
  if (!session || session.status !== 'completed' || !recipe || !profile) throw new Error('A completed Trim Mode session is required.')
  const ratingError = validateRating(ratings.overallRating, true) || [ratings.fadeRating, ratings.lineSharpnessRating, ratings.symmetryRating, ratings.comfortRating].map(value => validateRating(value)).find(Boolean)
  if (ratingError) throw new Error(ratingError)
  const timestamp = now()
  const previous = [...state.logs].filter(log => log.profileId === profile.id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0]
  const daysSincePreviousTrim = previous ? Math.max(0, Math.floor((new Date(timestamp).getTime() - new Date(previous.occurredAt).getTime()) / 86_400_000)) : null
  const usedToolIds = new Set(recipe.steps.map(step => step.toolId).filter(Boolean))
  const snapshot: BeardLogSnapshot = { schemaVersion: 1, profile: structuredClone(profile), recipe: structuredClone(recipe), lengthMap: structuredClone(state.lengthMaps.find(map => map.profileId === profile.id) ?? null), tools: structuredClone(state.tools.filter(tool => usedToolIds.has(tool.id))), products: structuredClone(productsUsed ?? recipe.preferredProducts) }
  const entry: BeardLogEntry = { id: id(), sessionId, occurredAt: timestamp, profileId: profile.id, recipeId: recipe.id, recipeVersion: recipe.version, startingCondition: recipe.startingCondition, daysSincePreviousTrim, durationMinutes: Math.max(1, Math.round((new Date(timestamp).getTime() - new Date(session.startedAt).getTime()) / 60_000)), ...ratings, notes, whatWorked: '', changeNextTime: '', snapshot, createdAt: timestamp, updatedAt: timestamp }
  return { ...state, logs: [entry, ...state.logs] }
}

export function createStarterWorkspace(): BeardStudioState {
  const timestamp = now(), profileId = id(), toolId = id()
  const attachments = ['Integrated adjustable comb', 'Long-length comb', 'Fade comb', 'Detail trimmer'].map(name => ({ id: id(), name }))
  const profile: BeardProfile = { id: profileId, name: 'Bobby Beard Profile', status: 'Active', styleName: 'Structured full beard with soft side fade', description: '', targetLook: 'Fuller chin, controlled sides, sharp cheek line and natural defined neckline', maintenanceFrequencyDays: 7, preferredOverallLengthMm: 9, density: 'mixed', texture: 'mixed', growthNotes: '', asymmetryNotes: '', weakAreaNotes: '', moustachePreference: 'Balanced and controlled', cheekLinePreference: 'sharply defined', necklinePreference: 'defined', createdAt: timestamp, updatedAt: timestamp }
  const tool: GroomingTool = { id: toolId, name: 'Philips Beard Trimmer 7000', brand: 'Philips', model: 'BT7665/15', type: 'beard trimmer', minimumLengthMm: 0.4, maximumLengthMm: 20, adjustmentIncrementMm: 0.2, attachments, washable: false, notes: 'Capabilities are limited to values recorded in this profile.', primary: true, status: 'active', createdAt: timestamp, updatedAt: timestamp }
  const zones = beardZoneNames.map((name, order): BeardLengthZone => ({ id: id(), name, targetLengthMm: starterZoneLengths[name], minimumLengthMm: null, maximumLengthMm: null, trimDirection: name.includes('line') ? 'detail only' : 'with growth', toolId, attachmentId: attachments[0].id, notes: '', order: order + 1, enabled: true }))
  const titles = ['Prepare and dry the beard', 'Establish the longest area at the chin', 'Trim jaw areas slightly shorter', 'Trim cheeks shorter than jaw', 'Build a gradual sideburn fade', 'Balance moustache length', 'Define cheek line', 'Define neckline', 'Inspect symmetry', 'Apply finishing product']
  const stepZones: BeardZoneName[][] = [[], ['chin'], ['jaw left', 'jaw right'], ['upper cheek', 'lower cheek'], ['upper sideburn', 'lower sideburn'], ['moustache'], ['upper cheek'], ['neckline transition'], ['jaw left', 'jaw right'], []]
  const steps = titles.map((title, index): TrimRecipeStep => ({ id: id(), order: index + 1, title, zones: stepZones[index], targetLengthMm: stepZones[index][0] ? starterZoneLengths[stepZones[index][0]] : null, toolId: index === 0 || index === 9 ? null : toolId, attachmentId: index === 0 || index === 9 ? null : attachments[index === 4 ? 2 : 0].id, trimDirection: index === 0 || index === 9 ? null : index === 6 || index === 7 ? 'detail only' : 'with growth', technique: index === 4 ? 'blend' : index === 6 || index === 7 ? 'define line' : index === 8 ? 'detail' : 'full pass', instruction: `${title}. Work deliberately and stop to inspect the result before continuing.`, caution: index === 7 ? 'Set the line conservatively; removed hair cannot be restored during this trim.' : '', completionRequired: true }))
  const recipe: TrimRecipe = { id: id(), profileId, name: 'Structured full beard starter', status: 'Active', version: 1, estimatedDurationMinutes: 25, startingCondition: 'Clean, dry and fully detangled', preparationInstructions: 'This is an editable starting template, not authoritative professional advice.', steps, finishingInstructions: 'Inspect in even light and record the outcome.', preferredProducts: [], notes: 'Editable starting template.', createdAt: timestamp, updatedAt: timestamp }
  return { profiles: [profile], tools: [tool], lengthMaps: [{ id: id(), profileId, zones, createdAt: timestamp, updatedAt: timestamp }], recipes: [recipe], sessions: [], logs: [] }
}
