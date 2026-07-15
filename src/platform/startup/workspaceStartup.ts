import type { FormulaState } from "../../types/domain";
import { validateV9Workspace } from "../migration/v9Migration";

export type RemoteWorkspaceState =
  | "missing"
  | "empty"
  | "importing"
  | "reconciliation_required"
  | "active"
  | "failed";
export type WorkspaceStartupState =
  | "signed_out"
  | "loading_remote"
  | "migration_available"
  | "empty_remote"
  | "workspace_ready"
  | "migration_in_progress"
  | "platform_error";
export interface WorkspaceStartupInput {
  authenticated: boolean;
  loading: boolean;
  remoteState?: RemoteWorkspaceState;
  hasValidLocalV9: boolean;
  remoteError?: boolean;
}

export function selectWorkspaceStartup(
  input: WorkspaceStartupInput,
): WorkspaceStartupState {
  if (!input.authenticated) return "signed_out";
  if (input.loading) return "loading_remote";
  if (input.remoteError || input.remoteState === "failed")
    return "platform_error";
  if (input.remoteState === "active") return "workspace_ready";
  if (
    input.remoteState === "importing" ||
    input.remoteState === "reconciliation_required"
  )
    return "migration_in_progress";
  if (
    (input.remoteState === "missing" || input.remoteState === "empty") &&
    input.hasValidLocalV9
  )
    return "migration_available";
  return "empty_remote";
}

export type WorkspaceLookup = {
  data: { lifecycle_state: string } | null;
  error: Error | null;
};

export type WorkspaceStartupResult =
  | { mode: "migration-available"; state: FormulaState }
  | { mode: "remote-authoritative"; state: FormulaState };

export async function resolveWorkspaceStartup({
  lookup,
  localV9,
  loadRemote,
}: {
  lookup: WorkspaceLookup;
  localV9?: FormulaState;
  loadRemote: () => Promise<FormulaState>;
}): Promise<WorkspaceStartupResult> {
  if (lookup.error) throw lookup.error;
  if (!lookup.data) {
    if (!localV9 || validateV9Workspace(localV9).blockingErrors)
      throw new Error(
        "No remote workspace exists and no valid local v9 migration source is available.",
      );
    return { mode: "migration-available", state: localV9 };
  }
  if (lookup.data.lifecycle_state !== "active")
    throw new Error(
      `Remote workspace is ${lookup.data.lifecycle_state}; successful reconciliation and activation are required.`,
    );
  return { mode: "remote-authoritative", state: await loadRemote() };
}
