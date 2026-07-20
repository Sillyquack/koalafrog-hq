export const APPLICATION_VERSION = __APP_VERSION__
export const BACKUP_FORMAT = 'koalafrog-backup-v1'
export const WORKSPACE_SCHEMA = 'koalafrog-hq:workspace:v10'

export const platformVersionInfo = [
  { label: 'Application', value: `v${APPLICATION_VERSION}` },
  { label: 'Workspace schema', value: WORKSPACE_SCHEMA.split(':').at(-1) ?? WORKSPACE_SCHEMA },
  { label: 'Backup format', value: `v${BACKUP_FORMAT.split('-v').at(-1) ?? BACKUP_FORMAT}` },
]
