import { describe, expect, it } from "vitest";
import { RecallReadinessRepository, recallReadinessError } from "./recallReadinessRepository";

describe("RecallReadinessRepository", () => {
  it("uses RPC-only reads and maps case-list results", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client = { rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args }); return { data: [{ id: "case-1", caseCode: "RR-2026-0001" }], error: null };
    } };
    const result = await new RecallReadinessRepository(client as never).list({ state: "draft" });
    expect(result[0]).toMatchObject({ caseCode: "RR-2026-0001" });
    expect(calls).toEqual([{ name: "list_recall_readiness_cases_v1", args: { candidate_filters: { state: "draft" }, candidate_limit: 50, candidate_offset: 0 } }]);
  });
  it("normalizes controlled server failures without broad any", async () => {
    const client = { rpc: async () => ({ data: null, error: { message: "READINESS_BLOCKED: evidence_missing" } }) };
    await expect(new RecallReadinessRepository(client as never).get("case")).rejects.toThrow("READINESS_BLOCKED");
    expect(recallReadinessError("unexpected database failure").message).toContain("RECALL_READINESS_SERVER_ERROR");
  });
  it("keeps frozen and live comparison operations separate", async () => {
    const calls: string[] = [], client = { rpc: async (name: string) => { calls.push(name); return { data: {}, error: null }; } };
    const repository = new RecallReadinessRepository(client as never);
    await repository.compareLive("revision-1"); await repository.compareRevisions("revision-1","revision-2");
    expect(calls).toEqual(["compare_recall_scope_to_live_inventory_v1","compare_recall_readiness_revisions_v1"]);
  });
});
