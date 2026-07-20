import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStarterWorkspace } from '../domain/beardStudio'
import { LocalBeardStudioRepository, STORAGE_KEY } from './beardStudioRepository'

describe('LocalBeardStudioRepository', () => {
  const values = new Map<string, string>()
  beforeEach(() => {
    values.clear()
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } })
  })
  it('starts empty and round-trips Beard Studio state', () => {
    const repository = new LocalBeardStudioRepository()
    expect(repository.load().profiles).toEqual([])
    const state = createStarterWorkspace()
    repository.save(state)
    expect(repository.load()).toEqual(state)
    expect(values.has(STORAGE_KEY)).toBe(true)
  })
  it('recovers safely from malformed local data', () => {
    values.set(STORAGE_KEY, '{bad')
    expect(new LocalBeardStudioRepository().load().profiles).toEqual([])
  })
})
