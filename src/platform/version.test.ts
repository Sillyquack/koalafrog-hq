import { describe, expect, it } from 'vitest'
import packageMetadata from '../../package.json'
import { STORAGE_KEY } from '../features/formulas/data/formulaRepository'
import { APPLICATION_VERSION, BACKUP_FORMAT, platformVersionInfo, WORKSPACE_SCHEMA } from './version'

describe('platform version metadata',()=>{
  it('uses the package version and presents distinct application, schema, and backup versions',()=>{
    expect(APPLICATION_VERSION).toBe(packageMetadata.version)
    expect(WORKSPACE_SCHEMA).toBe('koalafrog-hq:workspace:v9')
    expect(STORAGE_KEY).toBe(WORKSPACE_SCHEMA)
    expect(BACKUP_FORMAT).toBe('koalafrog-backup-v1')
    expect(platformVersionInfo).toEqual([
      {label:'Application',value:`v${packageMetadata.version}`},
      {label:'Workspace schema',value:'v9'},
      {label:'Backup format',value:'v1'},
    ])
  })
})
