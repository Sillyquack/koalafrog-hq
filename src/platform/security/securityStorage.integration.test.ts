import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formulaSeed } from "../../data/formulaSeed";
import { relationalMigrationPayload } from "../repository/supabaseWorkspaceRepository";
import {
  compareReconciliation,
  reconciliationSnapshot,
} from "../migration/v9Migration";

const url = import.meta.env.VITE_SUPABASE_TEST_URL as string | undefined;
const serviceKey = import.meta.env.VITE_SUPABASE_TEST_SERVICE_ROLE_KEY as
  string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_TEST_ANON_KEY as
  string | undefined;
const run = url && serviceKey && anonKey ? describe : describe.skip;

run("local Supabase Auth, RLS, RPC, Storage, and cutover security", () => {
  let admin: SupabaseClient,
    userA: SupabaseClient,
    userB: SupabaseClient,
    anonymous: SupabaseClient;
  let userAId = "",
    userBId = "",
    workspaceA = "",
    workspaceB = "";
  const users: string[] = [];
  const createOwner = async (label: string) => {
    const email = `security-${label}-${crypto.randomUUID()}@example.test`,
      password = `Local-${crypto.randomUUID()}-9a!`;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    users.push(created.data.user.id);
    const client = createClient(url!, anonKey!, {
      auth: { persistSession: false },
    });
    const signed = await client.auth.signInWithPassword({ email, password });
    if (signed.error) throw signed.error;
    const imported = await client.rpc("import_v9_relational", {
      payload: relationalMigrationPayload(formulaSeed),
    });
    if (imported.error) throw imported.error;
    const report = compareReconciliation(
      reconciliationSnapshot(formulaSeed),
      reconciliationSnapshot(formulaSeed),
    );
    const completed = await client.rpc("complete_v9_reconciliation", {
      run_id: (imported.data as { migrationRunId: string }).migrationRunId,
      report,
    });
    if (completed.error) throw completed.error;
    return {
      client,
      id: created.data.user.id,
      email,
      password,
      workspace: (imported.data as { workspaceId: string }).workspaceId,
    };
  };
  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false },
    });
    anonymous = createClient(url!, anonKey!, {
      auth: { persistSession: false },
    });
    const a = await createOwner("a"),
      b = await createOwner("b");
    userA = a.client;
    userAId = a.id;
    workspaceA = a.workspace;
    userB = b.client;
    userBId = b.id;
    workspaceB = b.workspace;
  }, 30_000);
  afterAll(async () => {
    for (const id of users) await admin.auth.admin.deleteUser(id);
  });

  it("persists an authenticated session and clears it on logout without public registration", async () => {
    const values = new Map<string, string>(),
      storage = {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
          values.set(key, value);
        },
        removeItem: (key: string) => {
          values.delete(key);
        },
      };
    const email = `session-${crypto.randomUUID()}@example.test`,
      password = `Local-${crypto.randomUUID()}-9a!`;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    users.push(created.data.user.id);
    const first = createClient(url!, anonKey!, {
      auth: { persistSession: true, storage },
    });
    expect(
      (await first.auth.signInWithPassword({ email, password })).data.session
        ?.user.id,
    ).toBe(created.data.user.id);
    const refreshed = createClient(url!, anonKey!, {
      auth: { persistSession: true, storage },
    });
    expect((await refreshed.auth.getSession()).data.session?.user.id).toBe(
      created.data.user.id,
    );
    await refreshed.auth.signOut();
    expect((await refreshed.auth.getSession()).data.session).toBeNull();
  });

  it("isolates anonymous and second-user reads across representative root and child tables", async () => {
    const tables = [
      "products",
      "formulas",
      "formula_versions",
      "formula_lines",
      "ingredients",
      "inventory_lots",
      "inventory_movements",
      "lab_batches",
      "lab_batch_lines",
      "test_sessions",
      "test_responses",
      "test_response_answers",
      "production_runs",
      "production_run_lines",
      "production_lot_allocations",
      "cost_lines",
      "packaging_components",
      "packaging_inventory_lots",
      "packaging_inventory_movements",
      "packaging_specification_versions",
      "packaging_specification_lines",
      "finished_goods_batches",
      "finished_goods_movements",
      "compliance_dossiers",
      "compliance_documents",
      "regulatory_reviews",
      "regulatory_review_sources",
      "pif_evidence_sections",
      "pif_section_documents",
      "claims",
      "cpnp_records",
      "readiness_issues",
      "launch_plans",
      "launch_decisions",
      "suppliers",
      "supplier_contacts",
      "supplier_research_candidates",
      "supplier_documents",
      "supplier_quotes",
      "supplier_quote_lines",
      "currency_comparison_rates",
      "stock_policies",
      "purchase_plans",
      "purchase_plan_lines",
      "equipment_items",
      "equipment_capabilities",
      "equipment_policies",
      "equipment_service_events",
      "process_equipment_requirements",
      "procurement_requests",
      "procurement_requested_items",
      "procurement_supplier_offers",
      "procurement_recommendations",
      "procurement_research_jobs",
      "procurement_offer_candidates",
    ];
    for (const table of tables) {
      const anon = await anonymous
        .from(table)
        .select("workspace_id")
        .eq("workspace_id", workspaceA);
      expect(anon.data ?? [], `anonymous ${table}`).toHaveLength(0);
      const other = await userB
        .from(table)
        .select("workspace_id")
        .eq("workspace_id", workspaceA);
      expect(other.data ?? [], `User B ${table}`).toHaveLength(0);
    }
    expect(
      (await userA.from("products").select("id").eq("workspace_id", workspaceA))
        .data?.length,
    ).toBeGreaterThan(0);
  }, 30_000);

  it("isolates procurement, converts candidates idempotently, and records no stock on planning", async () => {
    const candidateId = crypto.randomUUID(), creationKey = crypto.randomUUID();
    expect((await userA.from("supplier_research_candidates").insert({
      id: candidateId, workspace_id: workspaceA, owner_id: userAId,
      candidate_name: "Evidence candidate", candidate_type: "raw_material",
      status: "shortlisted", claimed_capabilities: ["Claim only"], creation_key: creationKey,
    })).error).toBeNull();
    expect((await userB.from("supplier_research_candidates").select("id").eq("id", candidateId)).data).toEqual([]);
    expect((await userB.rpc("convert_supplier_candidate", { candidate_id: candidateId, idempotency: creationKey })).error).not.toBeNull();
    const first = await userA.rpc("convert_supplier_candidate", { candidate_id: candidateId, idempotency: creationKey });
    const retry = await userA.rpc("convert_supplier_candidate", { candidate_id: candidateId, idempotency: creationKey });
    expect(first.error).toBeNull();
    expect(retry.data).toBe(first.data);

    const beforeRaw = (await userA.from("inventory_movements").select("id", { count: "exact", head: true })).count;
    const beforePackaging = (await userA.from("packaging_inventory_movements").select("id", { count: "exact", head: true })).count;
    const plan = await userA.from("purchase_plans").insert({
      workspace_id: workspaceA, owner_id: userAId, title: "Controlled plan",
      status: "approved_internal", purpose: "Test", creation_key: crypto.randomUUID(),
    }).select("id").single();
    expect(plan.error).toBeNull();
    const orderKey = crypto.randomUUID();
    const ordered = await userA.rpc("mark_purchase_plan_external_order", { plan_id: plan.data!.id, idempotency: orderKey });
    const orderedRetry = await userA.rpc("mark_purchase_plan_external_order", { plan_id: plan.data!.id, idempotency: orderKey });
    expect(ordered.error).toBeNull();
    expect(orderedRetry.data).toBe(ordered.data);
    expect((await userA.from("inventory_movements").select("id", { count: "exact", head: true })).count).toBe(beforeRaw);
    expect((await userA.from("packaging_inventory_movements").select("id", { count: "exact", head: true })).count).toBe(beforePackaging);
  });

  it("isolates request research and records ordered status without purchasing or stock writes", async () => {
    // Generated database types refresh after the additive migration is applied.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a=userA as any,b=userB as any;
    const beforeImport=(await a.from("procurement_requests").select("id",{count:"exact",head:true})).count;
    const importRequest=crypto.randomUUID(),now=new Date().toISOString();
    const failedImport=await a.rpc("import_procurement_snapshot",{candidate_workspace_id:workspaceA,payload:{requests:[{id:importRequest,title:"Atomic import",status:"needed",category:"raw_material",priority:"normal",needed_by:null,notes:"",revision:1,created_at:now,updated_at:now}],requestedItems:[{id:crypto.randomUUID(),procurement_request_id:crypto.randomUUID(),name:"Disconnected",category:"raw_material",requested_quantity:1,unit:"kg",intended_product_ids:[],intended_formula_ids:[],required_specifications:[],acceptable_substitutes:[],priority:"normal",needed_by:null,notes:"",display_order:0,created_at:now,updated_at:now}],offers:[],recommendations:[]}});
    expect(failedImport.error).not.toBeNull();
    expect((await a.from("procurement_requests").select("id",{count:"exact",head:true})).count).toBe(beforeImport);
    const supplier=await a.from("suppliers").insert({workspace_id:workspaceA,owner_id:userAId,legal_name:"Research supplier",supplier_type:"raw_material",status:"research"}).select("id").single();
    expect(supplier.error).toBeNull();
    const beforeRaw=(await a.from("inventory_movements").select("id",{count:"exact",head:true})).count;
    const request=await a.from("procurement_requests").insert({workspace_id:workspaceA,owner_id:userAId,title:"Pilot oils",status:"needed",category:"raw_material",priority:"high"}).select("id").single();
    expect(request.error).toBeNull();
    const item=await a.from("procurement_requested_items").insert({workspace_id:workspaceA,owner_id:userAId,procurement_request_id:request.data.id,name:"Jojoba",category:"carrier_oil",requested_quantity:2,unit:"kg",priority:"high"}).select("id").single();
    expect(item.error).toBeNull();
    const offer=await a.from("procurement_supplier_offers").insert({workspace_id:workspaceA,owner_id:userAId,requested_item_id:item.data.id,supplier_id:supplier.data.id,product_title:"Jojoba 1 kg",package_quantity:1,package_unit:"kg",item_price:250,currency:"NOK",date_checked:"2026-07-23"}).select("id").single();
    expect(offer.error).toBeNull();
    expect((await a.from("procurement_recommendations").insert({workspace_id:workspaceA,owner_id:userAId,procurement_request_id:request.data.id,requested_item_id:item.data.id,supplier_offer_id:offer.data.id,summary:"Owner-reviewed choice",status:"recommended"})).error).toBeNull();
    expect((await b.from("procurement_requests").select("id").eq("id",request.data.id)).data).toEqual([]);
    expect((await a.from("procurement_requests").update({status:"ordered"}).eq("id",request.data.id)).error).toBeNull();
    expect((await a.from("inventory_movements").select("id",{count:"exact",head:true})).count).toBe(beforeRaw);
  });

  it("keeps Procurement acceptance, retries, duplicates, and cancellation workspace-safe",async()=>{
    // Generated database types refresh after the additive migration is applied.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a=userA as any,b=userB as any;
    const requestA=await a.from("procurement_requests").insert({workspace_id:workspaceA,owner_id:userAId,title:"Transactional review",category:"raw_material",priority:"normal"}).select("id").single();
    const requestB=await b.from("procurement_requests").insert({workspace_id:workspaceB,owner_id:userBId,title:"Other workspace",category:"raw_material",priority:"normal"}).select("id").single();
    const itemA=await a.from("procurement_requested_items").insert({workspace_id:workspaceA,owner_id:userAId,procurement_request_id:requestA.data.id,name:"Jojoba",category:"carrier_oil",requested_quantity:1,unit:"kg",priority:"normal"}).select("id").single();
    const itemB=await b.from("procurement_requested_items").insert({workspace_id:workspaceB,owner_id:userBId,procurement_request_id:requestB.data.id,name:"Wax",category:"wax",requested_quantity:1,unit:"kg",priority:"normal"}).select("id").single();
    const jobA=await a.from("procurement_research_jobs").insert({workspace_id:workspaceA,owner_id:userAId,procurement_request_id:requestA.data.id,provider:"mock",status:"running",started_at:new Date().toISOString()}).select("id").single();
    expect((await b.from("procurement_research_jobs").insert({workspace_id:workspaceB,owner_id:userBId,procurement_request_id:requestB.data.id,provider:"mock-retry",status:"queued",retry_of_job_id:jobA.data.id})).error).not.toBeNull();
    const jobB=await b.from("procurement_research_jobs").insert({workspace_id:workspaceB,owner_id:userBId,procurement_request_id:requestB.data.id,provider:"mock",status:"running"}).select("id").single();
    const baseCandidate={supplier_name:"Evidence supplier",product_title:"Jojoba 1 kg",source_url:"https://supplier.invalid/jojoba",package_quantity:1,package_unit:"kg",source_date:"2026-07-23"};
    const candidateA=await a.from("procurement_offer_candidates").insert({workspace_id:workspaceA,owner_id:userAId,research_job_id:jobA.data.id,procurement_request_id:requestA.data.id,requested_item_id:itemA.data.id,...baseCandidate}).select("id").single();
    expect((await b.from("procurement_offer_candidates").insert({workspace_id:workspaceB,owner_id:userBId,research_job_id:jobB.data.id,procurement_request_id:requestB.data.id,requested_item_id:itemB.data.id,...baseCandidate,duplicate_of_candidate_id:candidateA.data.id})).error).not.toBeNull();
    const foreignSupplier=await b.from("suppliers").insert({workspace_id:workspaceB,owner_id:userBId,legal_name:"Foreign supplier",supplier_type:"raw_material",status:"research"}).select("id").single();
    const beforeOffers=(await a.from("procurement_supplier_offers").select("id",{count:"exact",head:true})).count;
    expect((await a.rpc("accept_procurement_offer_candidate",{candidate_workspace_id:workspaceA,candidate_id:candidateA.data.id,selected_supplier_id:foreignSupplier.data.id,create_supplier:false})).error).not.toBeNull();
    expect((await a.from("procurement_supplier_offers").select("id",{count:"exact",head:true})).count).toBe(beforeOffers);
    const concurrent=await Promise.all([
      a.rpc("accept_procurement_offer_candidate",{candidate_workspace_id:workspaceA,candidate_id:candidateA.data.id,selected_supplier_id:null,create_supplier:true}),
      a.rpc("accept_procurement_offer_candidate",{candidate_workspace_id:workspaceA,candidate_id:candidateA.data.id,selected_supplier_id:null,create_supplier:true}),
    ]);
    expect(concurrent.filter(result=>!result.error)).toHaveLength(1);
    expect(concurrent.filter(result=>result.error)).toHaveLength(1);
    expect((await a.from("procurement_supplier_offers").select("id",{count:"exact",head:true})).count).toBe((beforeOffers??0)+1);
    expect((await a.from("procurement_research_jobs").update({status:"cancelled",cancellation_requested_at:new Date().toISOString(),completed_at:new Date().toISOString()}).eq("id",jobA.data.id)).error).toBeNull();
    expect((await a.rpc("publish_procurement_research_results",{candidate_workspace_id:workspaceA,candidate_job_id:jobA.data.id,candidates:[],terminal_status:"completed",provider_request_id:"late"})).error).not.toBeNull();
    expect((await a.from("procurement_research_jobs").select("status,result_count").eq("id",jobA.data.id).single()).data).toEqual({status:"cancelled",result_count:0});
    expect((await b.from("procurement_research_jobs").update({status:"partial",completed_at:new Date().toISOString()}).eq("id",jobB.data.id)).error).toBeNull();
    expect((await b.from("procurement_research_jobs").insert({workspace_id:workspaceB,owner_id:userBId,procurement_request_id:requestB.data.id,provider:"mock",status:"queued",retry_of_job_id:jobB.data.id})).error).toBeNull();
  });

  it("enforces the durable background lifecycle, leases, and exactly-once finalization",async()=>{
    // Service-only lifecycle RPCs are intentionally absent from browser clients.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trusted=admin as any,a=userA as any;
    const createLiveJob=async(status="running",label:string=crypto.randomUUID())=>{
      const request=await a.from("procurement_requests").insert({workspace_id:workspaceA,owner_id:userAId,title:`Durable ${label}`,category:"raw_material",priority:"normal"}).select("id").single();
      expect(request.error).toBeNull();
      const job=await a.from("procurement_research_jobs").insert({workspace_id:workspaceA,owner_id:userAId,procurement_request_id:request.data.id,provider:"openai-web-search-v1",status,started_at:status==="running"?new Date().toISOString():null,completed_at:status==="failed"?new Date().toISOString():null}).select("id").single();
      expect(job.error).toBeNull();
      return job.data.id as string;
    };
    const failed=await createLiveJob("failed","terminal");
    expect((await trusted.rpc("begin_procurement_background_submission",{candidate_workspace_id:workspaceA,candidate_job_id:failed,candidate_owner_id:userAId,maximum_daily_invocations:100})).error?.message).toContain("LIVE_JOB_NOT_RUNNING");
    expect((await a.rpc("begin_procurement_live_invocation",{candidate_workspace_id:workspaceA,candidate_job_id:failed,maximum_daily_invocations:100})).error).not.toBeNull();

    const jobId=await createLiveJob();
    const beginArgs={candidate_workspace_id:workspaceA,candidate_job_id:jobId,candidate_owner_id:userAId,maximum_daily_invocations:100};
    const first=await trusted.rpc("begin_procurement_background_submission",beginArgs);
    const second=await trusted.rpc("begin_procurement_background_submission",beginArgs);
    expect(first.error).toBeNull();
    expect(second.data).toEqual(first.data);
    const intent=first.data[0] as{attempt_id:string};
    expect((await trusted.from("procurement_background_operations").select("attempt_id").eq("job_id",jobId)).data).toHaveLength(1);
    expect((await trusted.from("procurement_background_operations").insert({})).error?.code).toBe("42501");
    expect((await trusted.from("procurement_background_operations").update({processing_stage:"forged"}).eq("attempt_id",intent.attempt_id)).error?.code).toBe("42501");
    expect((await trusted.from("procurement_background_operations").delete().eq("attempt_id",intent.attempt_id)).error?.code).toBe("42501");
    expect((await trusted.from("procurement_background_webhook_inbox").insert({})).error?.code).toBe("42501");
    expect((await trusted.from("procurement_background_webhook_inbox").update({processing_state:"processed"}).eq("event_id","evt_none")).error?.code).toBe("42501");
    expect((await trusted.from("procurement_background_webhook_inbox").delete().eq("event_id","evt_none")).error?.code).toBe("42501");
    expect((await a.from("procurement_background_operations").select("attempt_id")).error).not.toBeNull();
    expect((await a.from("procurement_background_webhook_inbox").select("event_id")).error).not.toBeNull();
    expect((await anonymous.from("procurement_background_operations").select("attempt_id")).error).not.toBeNull();
    expect((await anonymous.from("procurement_background_webhook_inbox").select("event_id")).error).not.toBeNull();
    expect((await a.from("procurement_research_jobs").update({background_lifecycle_status:"completed"}).eq("id",jobId)).error?.message).toContain("BACKGROUND_LIFECYCLE_STATE_MANAGED");

    const starts=await Promise.all([
      trusted.rpc("start_procurement_background_submission",{candidate_attempt_id:intent.attempt_id}),
      trusted.rpc("start_procurement_background_submission",{candidate_attempt_id:intent.attempt_id}),
    ]);
    expect(starts.filter((result:{data:boolean})=>result.data===true)).toHaveLength(1);
    expect(starts.filter((result:{data:boolean})=>result.data===false)).toHaveLength(1);
    const attached=await trusted.rpc("attach_procurement_background_operation",{candidate_attempt_id:intent.attempt_id,candidate_owner_id:userAId,candidate_provider_operation_id:"resp_durable_one",candidate_provider_status:"queued"});
    expect(attached.data).toBe("attached");
    expect((await trusted.rpc("attach_procurement_background_operation",{candidate_attempt_id:intent.attempt_id,candidate_owner_id:userAId,candidate_provider_operation_id:"resp_durable_one",candidate_provider_status:"queued"})).data).toBe("duplicate");
    expect((await trusted.rpc("attach_procurement_background_operation",{candidate_attempt_id:intent.attempt_id,candidate_owner_id:userAId,candidate_provider_operation_id:"resp_conflict",candidate_provider_status:"queued"})).error?.message).toContain("BACKGROUND_OPERATION_CONFLICT");
    await trusted.rpc("store_procurement_background_webhook",{candidate_event_id:"evt_terminal_primary",candidate_provider_operation_id:"resp_durable_one",candidate_event_type:"response.completed"});
    await trusted.rpc("store_procurement_background_webhook",{candidate_event_id:"evt_terminal_late",candidate_provider_operation_id:"resp_durable_one",candidate_event_type:"response.completed"});

    const earlyJob=await createLiveJob("running","early");
    const early=(await trusted.rpc("begin_procurement_background_submission",{candidate_workspace_id:workspaceA,candidate_job_id:earlyJob,candidate_owner_id:userAId,maximum_daily_invocations:100})).data[0] as{attempt_id:string};
    expect((await trusted.rpc("store_procurement_background_webhook",{candidate_event_id:"evt_early",candidate_provider_operation_id:"resp_early",candidate_event_type:"response.completed"})).data).toBe("stored");
    expect((await trusted.from("procurement_background_webhook_inbox").select("processing_state").eq("event_id","evt_early").single()).data?.processing_state).toBe("unmatched_pending");
    await trusted.rpc("start_procurement_background_submission",{candidate_attempt_id:early.attempt_id});
    await trusted.rpc("attach_procurement_background_operation",{candidate_attempt_id:early.attempt_id,candidate_owner_id:userAId,candidate_provider_operation_id:"resp_early",candidate_provider_status:"in_progress"});
    expect((await trusted.from("procurement_background_webhook_inbox").select("processing_state").eq("event_id","evt_early").single()).data?.processing_state).toBe("received");
    expect((await trusted.rpc("store_procurement_background_webhook",{candidate_event_id:"evt_early",candidate_provider_operation_id:"resp_early",candidate_event_type:"response.completed"})).error).toBeNull();
    const retryWorker=crypto.randomUUID();
    expect((await trusted.rpc("claim_procurement_background_operation",{candidate_attempt_id:early.attempt_id,candidate_worker_id:retryWorker,candidate_stage:"retry_test",lease_seconds:30})).data).toBe(true);
    expect((await trusted.rpc("reschedule_procurement_background_operation",{candidate_attempt_id:early.attempt_id,candidate_worker_id:retryWorker,safe_failure_code:"BACKGROUND_RETRIEVAL_TRANSIENT",delay_seconds:30,increment_failure:true})).data).toBe(true);

    const workerA=crypto.randomUUID(),workerB=crypto.randomUUID();
    const claims=await Promise.all([
      trusted.rpc("claim_procurement_background_operation",{candidate_attempt_id:intent.attempt_id,candidate_worker_id:workerA,candidate_stage:"test",lease_seconds:30}),
      trusted.rpc("claim_procurement_background_operation",{candidate_attempt_id:intent.attempt_id,candidate_worker_id:workerB,candidate_stage:"test",lease_seconds:30}),
    ]);
    expect(claims.filter((result:{data:boolean})=>result.data===true)).toHaveLength(1);
    const winner=claims[0].data?workerA:workerB;
    const terminalArgs={candidate_attempt_id:intent.attempt_id,candidate_worker_id:winner,candidate_event_id:"evt_terminal_primary",candidate_provider_status:"completed",candidate_candidates:[],candidate_partial:false,candidate_error_code:null,candidate_error_details:null,candidate_terminal_source:"webhook"};
    const finalized=await Promise.all([
      trusted.rpc("finalize_procurement_background_operation",terminalArgs),
      trusted.rpc("finalize_procurement_background_operation",terminalArgs),
    ]);
    expect(finalized.map((result:{data:string})=>result.data).sort()).toEqual(["duplicate","finalized"]);
    expect((await a.from("procurement_research_jobs").select("status,result_count").eq("id",jobId).single()).data).toEqual({status:"completed",result_count:0});
    expect((await trusted.from("procurement_background_webhook_inbox").select("event_id,processing_state").in("event_id",["evt_terminal_primary","evt_terminal_late"]).order("event_id")).data).toEqual([
      {event_id:"evt_terminal_late",processing_state:"duplicate"},
      {event_id:"evt_terminal_primary",processing_state:"processed"},
    ]);
    expect((await trusted.rpc("store_procurement_background_webhook",{candidate_event_id:"evt_after_terminal",candidate_provider_operation_id:"resp_durable_one",candidate_event_type:"response.completed"})).data).toBe("stored");
    expect((await trusted.from("procurement_background_webhook_inbox").select("processing_state").eq("event_id","evt_after_terminal").single()).data?.processing_state).toBe("duplicate");
    expect((await trusted.rpc("begin_procurement_background_submission",{...beginArgs,candidate_owner_id:userBId})).error?.message).toContain("LIVE_JOB_UNAVAILABLE");
  });

  it("enforces intelligence history ownership and cross-workspace integrity", async () => {
    const threadId=crypto.randomUUID(),runId=crypto.randomUUID(),now=new Date().toISOString();
    expect((await userA.from('intelligence_threads').insert({id:threadId,workspace_id:workspaceA,owner_user_id:userAId,mode:'scent_exploration',title:'A study',created_at:now,updated_at:now})).error).toBeNull();
    expect((await userA.from('intelligence_runs').insert({id:runId,workspace_id:workspaceA,owner_user_id:userAId,thread_id:threadId,request_schema_version:1,prompt_version:'scent-studio-v1',context_version:1,user_prompt:'Explore',context_selection:{selectedIngredientIds:[],conceptMaterials:[]},context_manifest:{contextVersion:1},status:'analyzing',created_at:now})).error).toBeNull();
    expect((await userA.from('intelligence_runs').update({status:'completed',input_tokens:100,output_tokens:50,total_tokens:150,cached_input_tokens:10,reasoning_tokens:5,provider_usage_version:'openai-responses-v1',estimated_cost_usd:.001,pricing_snapshot_version:'test-v1'}).eq('id',runId)).error).toBeNull();
    expect((await userA.from('intelligence_runs').select('total_tokens,estimated_cost_usd').eq('id',runId).single()).data).toMatchObject({total_tokens:150,estimated_cost_usd:.001});
    expect((await anonymous.from('intelligence_threads').select('id').eq('id',threadId)).error).not.toBeNull();
    expect((await anonymous.from('intelligence_runs').select('id').eq('id',runId)).error).not.toBeNull();
    expect((await userB.from('intelligence_threads').select('id').eq('id',threadId)).data).toHaveLength(0);
    expect((await userB.from('intelligence_runs').select('id').eq('id',runId)).data).toHaveLength(0);
    expect((await userB.from('intelligence_threads').insert({id:crypto.randomUUID(),workspace_id:workspaceA,owner_user_id:userAId,mode:'scent_exploration',title:'Forged'})).error).not.toBeNull();
    const ownB=crypto.randomUUID();expect((await userB.from('intelligence_threads').insert({id:ownB,workspace_id:workspaceB,owner_user_id:userBId,mode:'scent_exploration',title:'B study'})).error).toBeNull();
    expect((await userB.from('intelligence_runs').insert({id:crypto.randomUUID(),workspace_id:workspaceB,owner_user_id:userBId,thread_id:threadId,request_schema_version:1,prompt_version:'scent-studio-v1',context_version:1,user_prompt:'Cross',context_selection:{},context_manifest:{},status:'analyzing'})).error).not.toBeNull();
    expect((await userA.from('intelligence_threads').select('id').eq('id',threadId)).data).toHaveLength(1);
  });

  it("isolates Knowledge and revisioned Scent Memory with cross-workspace integrity", async () => {
    const now=new Date().toISOString(),threadId=crypto.randomUUID();
    expect((await userA.from('intelligence_threads').insert({id:threadId,workspace_id:workspaceA,owner_user_id:userAId,mode:'scent_exploration',title:'Knowledge source'})).error).toBeNull();
    const reference=await userA.from('knowledge_references').insert({workspace_id:workspaceA,owner_user_id:userAId,source_type:'intelligence_thread',source_intelligence_thread_id:threadId,title:'Private title',tags:['woods']}).select().single();
    expect(reference.error).toBeNull();
    expect((await anonymous.from('knowledge_references').select('id')).error).not.toBeNull();
    expect((await userB.from('knowledge_references').select('id').eq('id',reference.data!.id)).data).toHaveLength(0);
    expect((await userB.from('knowledge_references').insert({workspace_id:workspaceA,owner_user_id:userAId,source_type:'intelligence_thread',source_intelligence_thread_id:threadId})).error).not.toBeNull();
    expect((await userB.from('knowledge_references').insert({workspace_id:workspaceB,owner_user_id:userBId,source_type:'intelligence_thread',source_intelligence_thread_id:threadId})).error).not.toBeNull();

    const productId=`scent-a-${crypto.randomUUID()}`;
    expect((await userA.from('products').insert({id:productId,workspace_id:workspaceA,owner_id:userAId,name:'Private scent sample',category:'Test',status:'Active',development_stage:'Research',description:'',scent_profile:'',target_launch_date:null,created_at:now,updated_at:now})).error).toBeNull();
    expect((await userA.from('scent_memory_sessions').insert({workspace_id:workspaceA,owner_user_id:userAId,title:'Contradictory context',product_id:productId,formula_version_id:'fv-bo-02'})).error).not.toBeNull();
    const memory=await userA.from('scent_memory_sessions').insert({workspace_id:workspaceA,owner_user_id:userAId,title:'First smell',product_id:productId}).select().single();
    expect(memory.error).toBeNull();
    expect((await anonymous.from('scent_memory_sessions').select('id')).error).not.toBeNull();
    expect((await userB.from('scent_memory_sessions').select('id').eq('id',memory.data!.id)).data).toHaveLength(0);
    expect((await userB.from('scent_memory_sessions').insert({workspace_id:workspaceA,owner_user_id:userAId,title:'Forged',product_id:productId})).error).not.toBeNull();
    expect((await userB.from('scent_memory_sessions').insert({workspace_id:workspaceB,owner_user_id:userBId,title:'Cross context',product_id:productId})).error).not.toBeNull();
    const first=await userA.rpc('record_scent_memory_checkpoint',{target_session_id:memory.data!.id,checkpoint:{checkpointKind:'immediate',observedAt:now,descriptors:['dry'],notes:'Private observation'}});
    expect(first.error).toBeNull();
    const correction=await userA.rpc('record_scent_memory_checkpoint',{target_session_id:memory.data!.id,correction_of:first.data!,checkpoint:{checkpointKind:'immediate',observedAt:now,descriptors:['dry','woody'],notes:'Corrected observation'}});
    expect(correction.error).toBeNull();
    const history=await userA.from('scent_memory_checkpoints').select('id,is_current,revision').eq('session_id',memory.data!.id).order('revision');
    expect(history.data).toEqual([expect.objectContaining({is_current:false,revision:1}),expect.objectContaining({is_current:true,revision:2})]);
    expect((await anonymous.from('scent_memory_checkpoints').select('id')).error).not.toBeNull();
    expect((await userB.from('scent_memory_checkpoints').select('id').eq('session_id',memory.data!.id)).data).toHaveLength(0);
    expect((await userB.rpc('record_scent_memory_checkpoint',{target_session_id:memory.data!.id,checkpoint:{checkpointKind:'immediate',observedAt:now,descriptors:[]}})).error).not.toBeNull();
  });

  it("rejects owner/workspace forging and cross-workspace parent relationships", async () => {
    const timestamp=new Date().toISOString();
    expect((await userA.from("products").insert({id:"p-a-security",workspace_id:workspaceA,owner_id:userAId,name:"A only",category:"Test",status:"Active",development_stage:"Research",description:"",scent_profile:"",target_launch_date:"2027-01-01",created_at:timestamp,updated_at:timestamp})).error).toBeNull();
    expect((await userA.from("formulas").insert({id:"f-a-security",workspace_id:workspaceA,owner_id:userAId,product_id:"p-a-security",name:"A only",description:"",created_at:timestamp,updated_at:timestamp})).error).toBeNull();
    expect((await userA.from("formula_versions").insert({id:"fv-a-security",workspace_id:workspaceA,owner_id:userAId,formula_id:"f-a-security",version:"v0.1",status:"Draft",description:"",target_characteristics:"",created_at:timestamp,updated_at:timestamp})).error).toBeNull();
    expect((await userA.from("inventory_lots").insert({id:"lot-a-security",workspace_id:workspaceA,owner_id:userAId,ingredient_id:"i1",internal_lot_number:"A-ONLY",received_date:"2026-07-15",opening_quantity:10,unit:"g",location:"Test",status:"Active",notes:"",created_at:timestamp,updated_at:timestamp})).error).toBeNull();
    expect((await userA.from("compliance_dossiers").insert({id:"cd-a-security",workspace_id:workspaceA,owner_id:userAId,product_id:"p-a-security",formula_version_id:"fv-a-security",target_market:"Norway",target_language:"English",status:"Draft",internal_owner:"A",notes:"",created_at:timestamp,updated_at:timestamp})).error).toBeNull();
    const forged = await userB
      .from("formulas")
      .insert({
        id: "forged-formula",
        workspace_id: workspaceA,
        owner_id: userAId,
        product_id: "p-a-security",
        name: "Forged",
        description: "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    expect(forged.error).not.toBeNull();
    const crossParent = await userB
      .from("formulas")
      .insert({
        id: "cross-formula",
        workspace_id: workspaceB,
        owner_id: userBId,
        product_id: "p-a-security",
        name: "Cross",
        description: "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    expect(crossParent.error).not.toBeNull();
    const crossLine = await userB
      .from("formula_lines")
      .insert({
        id: "cross-line",
        workspace_id: workspaceB,
        owner_id: userBId,
        formula_version_id: "fv-a-security",
        ingredient_id: "i1",
        percentage: 1,
        phase: "A",
        sort_order: 1,
        notes: "",
      });
    expect(crossLine.error).not.toBeNull();
    const crossMovement = await userB
      .from("inventory_movements")
      .insert({
        id: "cross-movement",
        workspace_id: workspaceB,
        owner_id: userBId,
        inventory_lot_id: "lot-a-security",
        type: "Sample",
        quantity: 1,
        unit: "g",
        reason: "Cross",
        notes: "",
        occurred_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });
    expect(crossMovement.error).not.toBeNull();
    const crossLaunch = await userB
      .from("launch_plans")
      .insert({
        id: "cross-launch",
        workspace_id: workspaceB,
        owner_id: userBId,
        product_id: "p-a-security",
        compliance_dossier_id: "cd-a-security",
        target_market: "Norway",
        target_launch_date: "2027-01-01",
        status: "Planning",
        owner: "Other",
        notes: "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    expect(crossLaunch.error).not.toBeNull();
  });

  it("denies anonymous and cross-owner execution of all transactional RPC boundaries", async () => {
    const calls: [string, Record<string, unknown>][] = [
      ["commit_lab_consumption", { batch_id: "lb1", commits: [] }],
      ["commit_production_consumption", { run_id: "pr1", commits: [] }],
      [
        "commit_packaging_consumption",
        { target_finished_goods_batch_id: "fg1", commits: [], receipt: {} },
      ],
      [
        "register_finished_goods_output",
        { batch: { id: "forged" }, receipt: null },
      ],
    ];
    for (const [name, args] of calls) {
      expect(
        (await anonymous.rpc(name, args)).error,
        `anonymous ${name}`,
      ).not.toBeNull();
      expect(
        (await userB.rpc(name, args)).error,
        `User B ${name}`,
      ).not.toBeNull();
    }
  });

  it("isolates Development Experiments and enforces lifecycle provenance", async () => {
    const variantId=crypto.randomUUID(),created=await userA.rpc('create_development_experiment',{plan:{title:'Private experiment',experimentType:'general_development',objective:'Compare deliberately',hypothesis:'Variant A may improve the result',idempotencyKey:crypto.randomUUID(),variants:[{id:variantId,name:'Variant A',purpose:'Trial',isControl:false,displayOrder:0,changes:[]}],observationPrompts:[{prompt:'Record the immediate result',category:'other',displayOrder:0,isRequired:true}]}});
    expect(created.error).toBeNull();const experimentId=created.data!;
    expect((await userB.from('development_experiments').select('id').eq('id',experimentId)).data).toHaveLength(0);
    expect((await anonymous.from('development_experiments').select('id')).error).not.toBeNull();
    expect((await userB.from('development_experiment_variants').select('id').eq('experiment_id',experimentId)).data).toHaveLength(0);
    expect((await userA.from('development_experiments').update({status:'approved'}).eq('id',experimentId)).error).not.toBeNull();
    expect((await userA.rpc('transition_development_experiment',{target_id:experimentId,target_status:'ready_for_review',expected_revision:1})).error).toBeNull();
    expect((await userA.rpc('transition_development_experiment',{target_id:experimentId,target_status:'approved',expected_revision:2})).error).toBeNull();
    expect((await userB.rpc('transition_development_experiment',{target_id:experimentId,target_status:'cancelled',expected_revision:3})).error).not.toBeNull();
    expect((await userA.from('formula_versions').update({development_experiment_id:experimentId,development_experiment_variant_id:variantId}).eq('id','fv-bo-02')).error).not.toBeNull();
  });

  it("keeps private Storage owner-isolated and preserves explicit file versions", async () => {
    const document = (
      await userA.from("compliance_documents").select("id").limit(1).single()
    ).data!;
    const firstPath = `${userAId}/cd1/${document.id}/v1/first.txt`,
      secondPath = `${userAId}/cd1/${document.id}/v2/second.txt`;
    expect(
      (
        await userA.storage
          .from("compliance-documents")
          .upload(firstPath, new Blob(["first"], { type: "text/plain" }))
      ).error,
    ).toBeNull();
    expect(
      (
        await userA.rpc("register_document_object", {
          document_id: document.id,
          dossier_id: "cd1",
          object_bucket: "compliance-documents",
          path: firstPath,
          file_name: "first.txt",
          content_type: "text/plain",
          byte_size: 5,
          content_checksum: null,
        })
      ).error,
    ).toBeNull();
    expect(
      await (
        await userA.storage.from("compliance-documents").download(firstPath)
      ).data?.text(),
    ).toBe("first");
    expect(
      (await userB.storage.from("compliance-documents").download(firstPath))
        .error,
    ).not.toBeNull();
    expect(
      (await anonymous.storage.from("compliance-documents").download(firstPath))
        .error,
    ).not.toBeNull();
    expect(
      (
        await userB.storage
          .from("compliance-documents")
          .upload(
            `${userAId}/cd1/${document.id}/forged.txt`,
            new Blob(["forged"]),
          )
      ).error,
    ).not.toBeNull();
    expect(
      (
        await userA.storage
          .from("compliance-documents")
          .upload(secondPath, new Blob(["second"], { type: "text/plain" }))
      ).error,
    ).toBeNull();
    expect(
      (
        await userA.rpc("register_document_object", {
          document_id: document.id,
          dossier_id: "cd1",
          object_bucket: "compliance-documents",
          path: secondPath,
          file_name: "second.txt",
          content_type: "text/plain",
          byte_size: 6,
          content_checksum: null,
        })
      ).error,
    ).toBeNull();
    const versions = await userA
      .from("document_objects")
      .select("file_version,state,object_path")
      .eq("document_record_id", document.id)
      .order("file_version");
    expect(
      versions.data?.map((item) => [item.file_version, item.state]),
    ).toEqual([
      [1, "Superseded"],
      [2, "Current"],
    ]);
    expect(
      (
        await userB
          .from("document_objects")
          .select("*")
          .eq("document_record_id", document.id)
      ).data,
    ).toHaveLength(0);
    expect(
      (
        await userA.rpc("remove_current_document_object", {
          document_id: document.id,
        })
      ).error,
    ).toBeNull();
    expect(
      (await userA.storage.from("compliance-documents").remove([secondPath]))
        .error,
    ).toBeNull();
    expect(
      (
        await userA
          .from("document_objects")
          .select("state")
          .eq("document_record_id", document.id)
          .eq("file_version", 2)
          .single()
      ).data?.state,
    ).toBe("Removed");
  }, 30_000);
});
