import { LocalFormulaRepository, type FormulaRepository } from '../../features/formulas/data/formulaRepository'
import type { WorkspaceRepository } from './workspaceRepository'
import type { WorkspaceCommit } from '../actions/workspaceActions'

export class LocalWorkspaceRepository implements WorkspaceRepository {
  readonly kind = 'local' as const
  constructor(private readonly storage: FormulaRepository = new LocalFormulaRepository()) {}
  load() { return this.storage.load() }
  commit(change: WorkspaceCommit) { this.storage.save(change.next) }
}
