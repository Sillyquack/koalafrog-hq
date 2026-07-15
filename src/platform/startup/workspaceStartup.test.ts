import { describe, expect, it, vi } from "vitest";
import { formulaSeed } from "../../data/formulaSeed";
import {
  resolveWorkspaceStartup,
  selectWorkspaceStartup,
} from "./workspaceStartup";

describe("workspace startup authority", () => {
  it("loads an active remote workspace even when local v9 also exists", () => {
    expect(
      selectWorkspaceStartup({
        authenticated: true,
        loading: false,
        remoteState: "active",
        hasValidLocalV9: true,
      }),
    ).toBe("workspace_ready");
  });

  it("offers explicit migration only for an empty remote workspace", () => {
    expect(
      selectWorkspaceStartup({
        authenticated: true,
        loading: false,
        remoteState: "empty",
        hasValidLocalV9: true,
      }),
    ).toBe("migration_available");
    expect(
      selectWorkspaceStartup({
        authenticated: true,
        loading: false,
        remoteState: "empty",
        hasValidLocalV9: false,
      }),
    ).toBe("empty_remote");
  });

  it("never treats local v9 as a fallback after a remote failure", () => {
    expect(
      selectWorkspaceStartup({
        authenticated: true,
        loading: false,
        remoteState: "active",
        hasValidLocalV9: true,
        remoteError: true,
      }),
    ).toBe("platform_error");
  });

  it("does not expose an unreconciled import as ready", () => {
    expect(
      selectWorkspaceStartup({
        authenticated: true,
        loading: false,
        remoteState: "reconciliation_required",
        hasValidLocalV9: true,
      }),
    ).toBe("migration_in_progress");
  });
});

describe("Supabase workspace startup policy", () => {
  it("offers migration when an authenticated owner has zero remote rows and valid local v9", async () => {
    const loadRemote = vi.fn();
    await expect(
      resolveWorkspaceStartup({
        lookup: { data: null, error: null },
        localV9: formulaSeed,
        loadRemote,
      }),
    ).resolves.toMatchObject({ mode: "migration-available", state: formulaSeed });
    expect(loadRemote).not.toHaveBeenCalled();
  });

  it("offers clean onboarding when zero remote rows and no local v9 exist", async () => {
    await expect(
      resolveWorkspaceStartup({
        lookup: { data: null, error: null },
        localV9Present: false,
        loadRemote: vi.fn(),
      }),
    ).resolves.toEqual({ mode: "clean-onboarding" });
  });

  it("loads the one active remote workspace as authoritative", async () => {
    const remote = structuredClone(formulaSeed),
      loadRemote = vi.fn().mockResolvedValue(remote);
    await expect(
      resolveWorkspaceStartup({
        lookup: { data: { lifecycle_state: "active" }, error: null },
        localV9: formulaSeed,
        loadRemote,
      }),
    ).resolves.toEqual({ mode: "remote-authoritative", state: remote });
    expect(loadRemote).toHaveBeenCalledOnce();
  });

  it("keeps a genuine remote query failure unavailable", async () => {
    const failure = new Error("Hosted query failed");
    await expect(
      resolveWorkspaceStartup({
        lookup: { data: null, error: failure },
        localV9: formulaSeed,
        loadRemote: vi.fn(),
      }),
    ).rejects.toBe(failure);
  });
});
