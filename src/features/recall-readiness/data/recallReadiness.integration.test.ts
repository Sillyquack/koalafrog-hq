import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../../platform/supabase/generated/database.types";
import { RecallReadinessRepository } from "./recallReadinessRepository";

const url=import.meta.env.VITE_SUPABASE_TEST_URL as string|undefined,serviceKey=import.meta.env.VITE_SUPABASE_TEST_SERVICE_ROLE_KEY as string|undefined,anonKey=import.meta.env.VITE_SUPABASE_TEST_ANON_KEY as string|undefined;
const run=url&&serviceKey&&anonKey?describe:describe.skip;
type Client=SupabaseClient<Database>;

run("Recall Readiness against local Supabase",()=>{
  let admin:Client; const users:string[]=[];
  beforeAll(()=>{admin=createClient<Database>(url!,serviceKey!,{auth:{persistSession:false}});});
  afterAll(async()=>{for(const id of users)await admin.auth.admin.deleteUser(id);});
  const owner=async(label:string)=>{
    const email=`recall-${label}-${crypto.randomUUID()}@example.test`,password=`Local-${crypto.randomUUID()}-9a!`;
    const created=await admin.auth.admin.createUser({email,password,email_confirm:true}); if(created.error)throw created.error;
    users.push(created.data.user.id); const client=createClient<Database>(url!,anonKey!,{auth:{persistSession:false}});
    const signed=await client.auth.signInWithPassword({email,password}); if(signed.error)throw signed.error;
    const workspace=await client.rpc("create_clean_workspace"); if(workspace.error)throw workspace.error;
    return{client,ownerId:created.data.user.id,workspaceId:String(workspace.data)};
  };
  const productionBatch=async(label:string)=>{
    const a=await owner(label),o={workspace_id:a.workspaceId,owner_id:a.ownerId},now="2026-07-29T10:00:00Z";
    const productId=`rr-product-${label}`,formulaId=`rr-formula-${label}`,versionId=`rr-version-${label}`,runId=`rr-run-${label}`;
    for(const request of[
      admin.from("products").insert({...o,id:productId,name:"Recall fixture",category:"beard_oil",status:"Active",development_stage:"Production",description:"",scent_profile:"",created_at:now,updated_at:now}),
      admin.from("formulas").insert({...o,id:formulaId,product_id:productId,name:"Recall formula",description:"",created_at:now,updated_at:now}),
      admin.from("formula_versions").insert({...o,id:versionId,formula_id:formulaId,version:"1.0",status:"Approved",description:"",target_characteristics:"",phase_definitions:[],manufacturing_process:[],created_at:now,updated_at:now}),
      admin.from("production_runs").insert({...o,id:runId,production_run_number:`RR-BATCH-${label}`,product_id:productId,formula_id:formulaId,formula_version_id:versionId,status:"Completed",planned_batch_size:100,planned_batch_unit:"g",actual_yield:100,actual_yield_unit:"g",created_at:now,updated_at:now,purpose:"Recall fixture",notes:"",summary:""}),
    ]) expect((await request).error).toBeNull();
    return{...a,runId};
  };
  it("creates an isolated immutable assessment and freezes a deterministic empty impact",async()=>{
    const a=await productionBatch("flow"),repository=new RecallReadinessRepository(a.client);
    const created=await repository.createCase({title:"Controlled batch concern",issueSummary:"Investigate a documented production concern.",concernCategory:"manufacturing_deviation",discoveryAt:"2026-07-29T11:00:00Z",sourceType:"production_batch",sourceId:a.runId,evidencePending:false});
    expect(created.case.case_code).toMatch(/^RR-\d{4}-\d{4}$/);
    const caseId=created.case.id;
    await repository.addEvidence({caseId,type:"internal_note",title:"Deviation record",description:"Controlled evidence metadata",reference:"deviation:rr-flow"});
    const revised=await repository.createRevision({caseId,caseRevision:created.case.revision,severity:"moderate",urgency:"prompt",exposure:"unknown",exposureUnknownAcknowledged:true,healthHazard:"No conclusion; assessment required.",compliance:"Internal review required.",recommendation:"Continue controlled investigation.",action:"continue_investigation",distributionAcknowledged:true,evidencePendingAcknowledged:false});
    const scoped=await repository.generateScope(caseId,revised.revision.id,revised.case.revision) as { scope: { fingerprint:string; scope_confidence:string }; retry:boolean };
    expect(scoped).toMatchObject({retry:false,scope:{scope_confidence:"blocked"}});
    expect(scoped.scope.fingerprint).toMatch(/^[a-f0-9]{32}$/);
    const workspace=await repository.get(caseId);
    expect(workspace).toMatchObject({case:{id:caseId,lifecycle_state:"awaiting_review"}});
    expect(workspace.scopes).toHaveLength(1); expect(workspace.evidence).toHaveLength(1);
    expect(workspace.affectedGoods).toHaveLength(0);
    const readiness=await repository.readiness(caseId,revised.revision.id);
    expect(readiness.readyForApproval).toBe(false);
    expect(readiness.blockers).toEqual(expect.arrayContaining(["traceability_blocked","affected_goods_unresolved","required_review_missing"]));
    expect((await a.client.from("recall_readiness_cases").select("*")).error).not.toBeNull();
    const other=await owner("other"),otherRepository=new RecallReadinessRepository(other.client);
    await expect(otherRepository.get(caseId)).rejects.toThrow("CASE_NOT_FOUND");
  });
  it("rejects cross-workspace identities and conflicting idempotency reuse",async()=>{
    const a=await productionBatch("source"),other=await owner("denied");
    const denied=new RecallReadinessRepository(other.client);
    await expect(denied.createCase({title:"Cross owner",issueSummary:"Must not resolve another owner identity.",concernCategory:"traceability_gap",discoveryAt:new Date().toISOString(),sourceType:"production_batch",sourceId:a.runId,evidencePending:true})).rejects.toThrow("SOURCE_NOT_FOUND");
    const key=crypto.randomUUID(),args={candidate_title:"Idempotent case",candidate_issue_summary:"Stable request",candidate_concern_category:"manufacturing_deviation",candidate_discovery_at:"2026-07-29T12:00:00Z",candidate_source_type:"production_batch",candidate_source_id:a.runId,candidate_evidence_pending:false,candidate_idempotency_key:key};
    const first=await a.client.rpc("create_recall_readiness_case_v1",args); expect(first.error).toBeNull();
    const retry=await a.client.rpc("create_recall_readiness_case_v1",args); expect(retry.data).toMatchObject({retry:true});
    const conflict=await a.client.rpc("create_recall_readiness_case_v1",{...args,candidate_title:"Changed payload"});
    expect(conflict.error?.message).toContain("IDEMPOTENCY_CONFLICT");
  });
});
