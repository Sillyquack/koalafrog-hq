import migrationManifest from "../../../docs/generated/hosted-migration-rehearsal-manifest.json";
import { supabase } from "../supabase/client";

export interface PlatformMigrationStatus {
  migrationCount: number;
  currentMigrationVersion: string | null;
  evaluatedAt: string;
}

export interface MigrationCompatibility {
  actual: PlatformMigrationStatus | null;
  expected: {
    migrationCount: number;
    currentMigrationVersion: string;
  };
  state: "match" | "mismatch" | "unknown";
}

interface MigrationStatusRpcClient {
  rpc(
    name: "get_platform_migration_status_v1",
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

const expected = {
  migrationCount: migrationManifest.count,
  currentMigrationVersion: migrationManifest.localMigrationHead,
};

export function comparePlatformMigrationStatus(
  actual: PlatformMigrationStatus | null,
): MigrationCompatibility {
  return {
    actual,
    expected,
    state: !actual
      ? "unknown"
      : actual.migrationCount === expected.migrationCount &&
          actual.currentMigrationVersion === expected.currentMigrationVersion
        ? "match"
        : "mismatch",
  };
}

export async function loadPlatformMigrationStatus(): Promise<PlatformMigrationStatus> {
  if (!supabase)
    throw new Error("Configure Supabase before checking migration status.");
  const { data, error } = await (
    supabase as unknown as MigrationStatusRpcClient
  ).rpc("get_platform_migration_status_v1");
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object")
    throw new Error("Migration status response was malformed.");
  const result = data as Record<string, unknown>;
  if (
    typeof result.migration_count !== "number" ||
    (typeof result.current_migration_version !== "string" &&
      result.current_migration_version !== null) ||
    typeof result.evaluated_at !== "string"
  )
    throw new Error("Migration status response was malformed.");
  return {
    migrationCount: result.migration_count,
    currentMigrationVersion: result.current_migration_version,
    evaluatedAt: result.evaluated_at,
  };
}
