import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStarterWorkspace } from '../domain/beardStudio'
import{LocalWorkspaceRepository}from'../../../platform/repository/localWorkspaceRepository'
import{formulaSeed}from'../../../data/formulaSeed'

describe('canonical local Beard Studio workspace', () => {
  const values = new Map<string, string>()
  beforeEach(() => {
    values.clear()
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } })
  })
  it('starts empty and round-trips Beard Studio state', () => {
    const repository=new LocalWorkspaceRepository(),before=structuredClone(formulaSeed),beardStudio=createStarterWorkspace()
    repository.commit({action:'saveBeardStudio',previous:before,next:{...before,beardStudio}})
    expect(repository.load().beardStudio).toEqual(beardStudio)
    expect([...values.keys()]).toEqual(['koalafrog-hq:workspace:v10'])
  })
  it('recovers safely from malformed local data', () => {
    values.set('koalafrog-hq:workspace:v10','{bad')
    expect(new LocalWorkspaceRepository().load().beardStudio.profiles).toEqual([])
  })
})
