import type { FormulaState } from "../../types/domain";
import { APPLICATION_VERSION, BACKUP_FORMAT, WORKSPACE_SCHEMA } from "../version";
export { BACKUP_FORMAT } from "../version";
type StorageRecord = {
  documentId: string;
  bucket: string;
  objectPath: string;
  fileName: string;
  size: number;
  mimeType?: string;
  fileVersion?: number;
  state?: "Current" | "Superseded" | "Removed";
  checksum?: string;
  uploadedAt?: string;
};
export interface IntelligenceBackup {
  threads: unknown[];
  runs: unknown[];
  knowledgeReferences: unknown[];
  scentMemorySessions: unknown[];
  scentMemoryCheckpoints: unknown[];
  developmentExperiments?: unknown[];
  developmentExperimentVariants?: unknown[];
  developmentExperimentChanges?: unknown[];
  developmentObservationPrompts?: unknown[];
  developmentStatusEvents?: unknown[];
  developmentHandoffs?: unknown[];
  procurement?: Record<string, unknown[]>;
}
export interface KoalafrogBackup {
  format: string;
  exportedAt: string;
  applicationVersion: string;
  workspace: { sourceSchema: string; ownerId?: string };
  entityCounts: Record<string, number>;
  records: FormulaState;
  intelligenceHistory: IntelligenceBackup;
  storageManifest: StorageRecord[];
}
export function createBackup(
  state: FormulaState,
  storageManifest: StorageRecord[] = [],
  ownerId?: string,
  intelligenceHistory: IntelligenceBackup = {
    threads: [],
    runs: [],
    knowledgeReferences: [],
    scentMemorySessions: [],
    scentMemoryCheckpoints: [],
    developmentExperiments: [],
    developmentExperimentVariants: [],
    developmentExperimentChanges: [],
    developmentObservationPrompts: [],
    developmentStatusEvents: [],
    developmentHandoffs: [],
  },
): KoalafrogBackup {
  const entityCounts = Object.fromEntries(
    Object.entries(state).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.length : 0,
    ]),
  );
  entityCounts.intelligenceThreads = intelligenceHistory.threads.length;
  entityCounts.intelligenceRuns = intelligenceHistory.runs.length;
  entityCounts.knowledgeReferences = intelligenceHistory.knowledgeReferences.length;
  entityCounts.scentMemorySessions = intelligenceHistory.scentMemorySessions.length;
  entityCounts.scentMemoryCheckpoints = intelligenceHistory.scentMemoryCheckpoints.length;
  entityCounts.developmentExperiments = intelligenceHistory.developmentExperiments?.length ?? 0;
  entityCounts.developmentExperimentVariants = intelligenceHistory.developmentExperimentVariants?.length ?? 0;
  entityCounts.developmentExperimentChanges = intelligenceHistory.developmentExperimentChanges?.length ?? 0;
  entityCounts.developmentObservationPrompts = intelligenceHistory.developmentObservationPrompts?.length ?? 0;
  entityCounts.developmentStatusEvents = intelligenceHistory.developmentStatusEvents?.length ?? 0;
  entityCounts.developmentHandoffs = intelligenceHistory.developmentHandoffs?.length ?? 0;
  for (const [collection, records] of Object.entries(intelligenceHistory.procurement ?? {}))
    entityCounts[collection] = records.length;
  return {
    format: BACKUP_FORMAT,
    exportedAt: new Date().toISOString(),
    applicationVersion: APPLICATION_VERSION,
    workspace: { sourceSchema: WORKSPACE_SCHEMA, ownerId },
    entityCounts,
    records: structuredClone(state),
    intelligenceHistory: structuredClone(intelligenceHistory),
    storageManifest,
  };
}
export function validateBackup(value: unknown) {
  const errors: string[] = [];
  if (!value || typeof value !== "object")
    return { valid: false, errors: ["Backup must be an object."] };
  const backup = value as Partial<KoalafrogBackup>;
  if (backup.format !== BACKUP_FORMAT)
    errors.push("Unsupported backup format.");
  if (!backup.records || typeof backup.records !== "object")
    errors.push("Backup records are missing.");
  if (!backup.entityCounts || typeof backup.entityCounts !== "object")
    errors.push("Entity counts are missing.");
  if (!Array.isArray(backup.storageManifest))
    errors.push("Storage manifest is missing.");
  if (
    !backup.intelligenceHistory ||
    !Array.isArray(backup.intelligenceHistory.threads) ||
    !Array.isArray(backup.intelligenceHistory.runs) ||
    !Array.isArray(backup.intelligenceHistory.developmentExperiments)
  )
    errors.push("Intelligence history is missing.");
  if (backup.records && backup.entityCounts) {
    for (const [collection, records] of Object.entries(backup.records)) {
      if (
        Array.isArray(records) &&
        backup.entityCounts[collection] !== records.length
      )
        errors.push(`Entity count mismatch for ${collection}.`);
    }
  }
  return {
    valid: errors.length === 0,
    errors,
    metadata: {
      format: backup.format,
      exportedAt: backup.exportedAt,
      entityCounts: backup.entityCounts,
      storageObjectCount: backup.storageManifest?.length ?? 0,
    },
  };
}
export function downloadBackup(backup: KoalafrogBackup) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `koalafrog-backup-${backup.exportedAt.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
