import { LocalFormulaRepository, type FormulaRepository } from '../../features/formulas/data/formulaRepository'
import type { WorkspaceRepository } from './workspaceRepository'
import type { WorkspaceCommit } from '../actions/workspaceActions'

export class LocalWorkspaceRepository implements WorkspaceRepository {
  readonly kind = 'local' as const
  constructor(private readonly storage: FormulaRepository = new LocalFormulaRepository()) {}
  load() { return this.storage.load() }
  commit(change: WorkspaceCommit) {
    this.storage.save(change.next)
    if(change.action==='updatePackagingComponent'){
      const changed=change.next.packagingComponents.find(item=>change.previous.packagingComponents.find(previous=>previous.id===item.id)!==item)
      const persisted=changed?this.storage.load().packagingComponents.find(item=>item.id===changed.id):undefined
      if(!persisted)throw new Error('Packaging Component persistence returned no local readback.')
      return{confirmedPackagingComponent:persisted}
    }
  }
  readPackagingComponent(_workspaceId:string,id:string){return this.storage.load().packagingComponents.find(item=>item.id===id)}
}
