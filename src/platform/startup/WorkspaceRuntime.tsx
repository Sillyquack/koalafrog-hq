import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormulaState } from "../../types/domain";
import { FormulaDataProvider } from "../../features/formulas/state/FormulaDataContext";
import { LocalWorkspaceRepository } from "../repository/localWorkspaceRepository";
import { SupabaseWorkspaceRepository } from "../repository/supabaseWorkspaceRepository";
import { supabase } from "../supabase/client";

const configuredRuntime =
  (
    import.meta.env.VITE_WORKSPACE_REPOSITORY as string | undefined
  )?.toLowerCase() === "supabase"
    ? "supabase"
    : "local";

export function WorkspaceRuntime({ children }: { children: React.ReactNode }) {
  const local = useMemo(() => new LocalWorkspaceRepository(), []),
    remote = useMemo(() => new SupabaseWorkspaceRepository(), []);
  const [state, setState] = useState<FormulaState>(),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setError("");
    setState(undefined);
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
          .single();
        if (workspace.error) throw workspace.error;
        if (workspace.data.lifecycle_state !== "active")
          throw new Error(
            `Remote workspace is ${workspace.data.lifecycle_state}; successful reconciliation and activation are required.`,
          );
        return remote.load(data.user.id);
      })
      .then((workspace) => {
        if (active) setState(workspace);
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
  if (!state)
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
  return (
    <FormulaDataProvider repository={remote} initialState={state}>
      {children}
    </FormulaDataProvider>
  );
}
