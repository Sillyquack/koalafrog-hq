import { describe, expect, it } from 'vitest'
import { activateProfile, activateRecipe, createLogFromSession, createStarterWorkspace, deriveRecipeDraft, progressTrimSession, startTrim, validateProfile, validateRating, validateToolLength } from './beardStudio'

describe('Beard Studio domain', () => {
  it('creates a complete editable starter workspace without fake history', () => {
    const state = createStarterWorkspace()
    expect(state.profiles[0]).toMatchObject({ name: 'Bobby Beard Profile', status: 'Active' })
    expect(validateProfile(state.profiles[0])).toEqual([])
    expect(state.tools[0]).toMatchObject({ brand: 'Philips', model: 'BT7665/15', primary: true })
    expect(state.lengthMaps[0].zones).toHaveLength(11)
    expect(state.recipes[0].steps.map(step => step.order)).toEqual([1,2,3,4,5,6,7,8,9,10])
    expect(state.logs).toEqual([])
  })

  it('validates profile creation fields', () => {
    const profile = createStarterWorkspace().profiles[0]
    expect(validateProfile({ ...profile, name: '', maintenanceFrequencyDays: 0 })).toEqual(expect.arrayContaining(['Profile name is required.', 'Maintenance frequency must be at least 1 day.']))
  })

  it('keeps exactly one Active profile and activates the requested profile', () => {
    const state = createStarterWorkspace(), second = { ...state.profiles[0], id: crypto.randomUUID(), name: 'Second', status: 'Draft' as const }
    const next = activateProfile({ ...state, profiles: [...state.profiles, second] }, second.id)
    expect(next.profiles.filter(profile => profile.status === 'Active').map(profile => profile.id)).toEqual([second.id])
  })

  it('validates lengths against only recorded tool capabilities', () => {
    const tool = createStarterWorkspace().tools[0]
    expect(validateToolLength(tool, 0.2)).toContain('below')
    expect(validateToolLength(tool, 21)).toContain('above')
    expect(validateToolLength(tool, 12)).toBeNull()
    expect(validateToolLength(undefined, 100)).toBeNull()
  })

  it('edits a Length Map independently by zone', () => {
    const state = createStarterWorkspace(), map = structuredClone(state.lengthMaps[0])
    map.zones[0].targetLengthMm = 4
    expect(map.zones[0].targetLengthMm).toBe(4)
    expect(map.zones[1].targetLengthMm).toBe(5)
  })

  it('derives an incremented Draft and preserves the source recipe version', () => {
    const source = createStarterWorkspace().recipes[0], draft = deriveRecipeDraft(source)
    draft.steps[0].instruction = 'Changed'
    expect(draft).toMatchObject({ version: 2, status: 'Draft' })
    expect(draft.id).not.toBe(source.id)
    expect(source.version).toBe(1)
    expect(source.steps[0].instruction).not.toBe('Changed')
  })

  it('keeps one Active recipe per profile', () => {
    const state = createStarterWorkspace(), draft = deriveRecipeDraft(state.recipes[0])
    const next = activateRecipe({ ...state, recipes: [...state.recipes, draft] }, draft.id)
    expect(next.recipes.filter(recipe => recipe.status === 'Active')).toEqual([expect.objectContaining({ id: draft.id })])
  })

  it('supports every Trim Mode transition and persists the cursor shape', () => {
    const state = createStarterWorkspace(), recipe = state.recipes[0]
    const started = startTrim(state, recipe.id).sessions[0]
    const next = progressTrimSession(started, recipe, 'next')
    expect(next).toMatchObject({ currentStepIndex: 1, completedStepIds: [recipe.steps[0].id] })
    expect(progressTrimSession(next, recipe, 'previous').currentStepIndex).toBe(0)
    const skipped = progressTrimSession(next, recipe, 'skip')
    expect(skipped.skippedStepIds).toContain(recipe.steps[1].id)
    expect(progressTrimSession(skipped, recipe, 'pause').status).toBe('paused')
    expect(progressTrimSession(progressTrimSession(skipped, recipe, 'pause'), recipe, 'resume').status).toBe('in_progress')
    expect(progressTrimSession(skipped, recipe, 'exit').status).toBe('abandoned')
    let finishing = started
    for (let index = 0; index < recipe.steps.length; index++) finishing = progressTrimSession(finishing, recipe, 'next')
    expect(finishing).toMatchObject({ status: 'completed', currentStepIndex: recipe.steps.length - 1 })
  })

  it('requires an Active recipe to start Trim Mode', () => {
    const state = createStarterWorkspace(), recipe = state.recipes[0]
    expect(() => startTrim({ ...state, recipes: [{ ...recipe, status: 'Draft' }] }, recipe.id)).toThrow('Active recipe')
  })

  it('creates an immutable deep snapshot from a completed trim', () => {
    let state = createStarterWorkspace()
    const recipe = state.recipes[0]
    state = startTrim(state, recipe.id)
    let session = state.sessions[0]
    for (let index = 0; index < recipe.steps.length; index++) session = progressTrimSession(session, recipe, 'next')
    state = { ...state, sessions: [session] }
    const logged = createLogFromSession(state, session.id, { overallRating: 5, fadeRating: 4, lineSharpnessRating: 5, symmetryRating: 4, comfortRating: 5 }, 'Controlled result')
    const snapshot = logged.logs[0].snapshot
    state.recipes[0].steps[0].instruction = 'Later recipe edit'
    state.lengthMaps[0].zones[0].targetLengthMm = 19
    state.tools[0].attachments[0].name = 'Later attachment name'
    expect(snapshot.recipe.steps[0].instruction).not.toBe('Later recipe edit')
    expect(snapshot.lengthMap?.zones[0].targetLengthMm).toBe(3)
    expect(snapshot.tools[0].attachments[0].name).toBe('Integrated adjustable comb')
  })

  it('validates result ratings from 1 to 5', () => {
    expect(validateRating(1, true)).toBeNull()
    expect(validateRating(5)).toBeNull()
    expect(validateRating(0)).toContain('1 to 5')
    expect(validateRating(4.5)).toContain('whole')
    expect(validateRating(null, true)).toContain('required')
  })
})
