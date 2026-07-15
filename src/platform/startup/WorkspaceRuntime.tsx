import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormulaState } from "../../types/domain";
import { FormulaDataProvider } from "../../features/formulas/state/FormulaDataContext";
import { LocalWorkspaceRepository } from "../repository/localWorkspaceRepository";
import { SupabaseWorkspaceRepository } from "../repository/supabaseWorkspaceRepository";
import type { WorkspaceRepository } from "../repository/workspaceRepository";
import { supabase } from "../supabase/client";
import { PlatformPage } from "../PlatformPage";
import { STORAGE_KEY } from "../../features/formulas/data/formulaRepository";
import {
  resolveWorkspaceStartup,
  type WorkspaceStartupResult,
} from "./workspaceStartup";

const configuredRuntime =
  (
    import.meta.env.VITE_WORKSPACE_REPOSITORY as string | undefined
  )?.toLowerCase() === "supabase"
    ? "supabase"
    : "local";

class ReadOnlyMigrationRepository implements WorkspaceRepository {
  readonly kind = "local" as const;
  constructor(private readonly source: LocalWorkspaceRepository) {}
  load() {
    return this.source.load();
  }
  commit() {
    throw new Error(
      "The preserved local v9 source is read-only during hosted migration onboarding.",
    );
  }
}

export function WorkspaceRuntime({ children }: { children: React.ReactNode }) {
  const local = useMemo(() => new LocalWorkspaceRepository(), []);
  const remote = useMemo(() => new SupabaseWorkspaceRepository(), []);
  const migrationSource = useMemo<WorkspaceRepository>(
    () => new ReadOnlyMigrationRepository(local),
    [local],
  );
  const [startup, setStartup] = useState<WorkspaceStartupResult>(),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setError("");
    setStartup(undefined);
    setAttempt((value) => value + 1);
  }, []);
  useEffect(() => {
    if (configuredRuntime !== "supabase") return;
    let active = true;
    supabase!.auth
      .getUser()
      .then(async ({ data, error: authError }) => {
        if (authError || !data.user)
          throw authError ?? new Error("Authenticated owner required.");
        const workspace = await supabase!
          .from("workspaces")
          .select("lifecycle_state")
          .eq("owner_id", data.user.id)
          .maybeSingle();
        let localV9: FormulaState | undefined;
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          try {
            localV9 = JSON.parse(stored) as FormulaState;
          } catch {
            localV9 = undefined;
          }
        }
        return resolveWorkspaceStartup({
          lookup: {
            data: workspace.data,
            error: workspace.error
              ? new Error(workspace.error.message)
              : null,
          },
          localV9,
          loadRemote: () => remote.load(data.user.id),
        });
      })
      .then((result) => {
        if (active) setStartup(result);
      })
      .catch((failure) => {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "Remote workspace could not be loaded.",
          );
      });
    return () => {
      active = false;
    };
  }, [remote, attempt]);
  if (configuredRuntime === "local")
    return (
      <FormulaDataProvider repository={local}>{children}</FormulaDataProvider>
    );
  if (error)
    return (
      <main className="auth-screen">
        <div role="alert">
          <span className="eyebrow">Platform / Workspace error</span>
          <h1>Remote workspace unavailable</h1>
          <p>{error}</p>
          <p>Koalafrog will not fall back to editable local data.</p>
          <button className="button primary" onClick={retry}>
            Retry Supabase
          </button>
        </div>
      </main>
    );
  if (!startup)
    return (
      <main className="auth-screen">
        <div>
          <span className="eyebrow">Authoritative Supabase workspace</span>
          <h1>Loading private workspace…</h1>
          <p>
            Relational records are being hydrated. Local v9 is not used in this
            session.
          </p>
        </div>
      </main>
    );
  if (startup.mode === "migration-available")
    return (
      <FormulaDataProvider
        repository={migrationSource}
        initialState={startup.state}
      >
        <main>
          <div className="compliance-notice">
            <div>
              <strong>Migration available</strong>
              <p>
                The hosted owner has no remote workspace. Local v9 is mounted
                only for explicit backup, validation, and migration onboarding;
                the normal editable application remains unavailable.
              </p>
            </div>
          </div>
          <PlatformPage />
        </main>
      </FormulaDataProvider>
    );
  return (
    <FormulaDataProvider repository={remote} initialState={startup.state}>
      {children}
    </FormulaDataProvider>
  );
}
