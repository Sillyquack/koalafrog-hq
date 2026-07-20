/* eslint-disable react-refresh/only-export-components -- feature repository, provider and hook form one boundary */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { emptyBeardStudioState, type BeardStudioState } from '../domain/beardStudio'

const STORAGE_KEY = 'koalafrog-hq:beard-studio:v1'
export interface BeardStudioRepository { load(): BeardStudioState; save(state: BeardStudioState): void }
export class LocalBeardStudioRepository implements BeardStudioRepository {
  load() {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return emptyBeardStudioState()
    try { return JSON.parse(stored) as BeardStudioState } catch { return emptyBeardStudioState() }
  }
  save(state: BeardStudioState) { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }
}

interface BeardStudioContextValue { state: BeardStudioState; update(mutation: (current: BeardStudioState) => BeardStudioState): void }
const BeardStudioContext = createContext<BeardStudioContextValue | null>(null)
export function BeardStudioProvider({ children, repository }: { children: ReactNode; repository?: BeardStudioRepository }) {
  const selected = useMemo(() => repository ?? new LocalBeardStudioRepository(), [repository])
  const [state, setState] = useState(() => selected.load())
  const update = (mutation: (current: BeardStudioState) => BeardStudioState) => setState(current => { const next = mutation(current); selected.save(next); return next })
  return <BeardStudioContext.Provider value={{ state, update }}>{children}</BeardStudioContext.Provider>
}
export function useBeardStudio() {
  const value = useContext(BeardStudioContext)
  if (!value) throw new Error('useBeardStudio must be used inside BeardStudioProvider.')
  return value
}
export { STORAGE_KEY }
