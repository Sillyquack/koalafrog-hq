import { describe, expect, it } from "vitest";
import {
  buildIntelligenceLibrary,
  filterLibrary,
  intelligenceUsageSummary,
  type IntelligenceRunRecord,
} from "./knowledge";

const thread={id:"t1",mode:"scent_exploration",title:"Original title",created_at:"2026-01-01T00:00:00Z",updated_at:"2026-01-02T00:00:00Z"};
const run: IntelligenceRunRecord={id:"r1",thread_id:"t1",user_prompt:"Explore Bergamot",context_selection:{conceptMaterials:["Bergamot"]},context_manifest:{contextVersion:1},response_payload:null,status:"completed",error_code:null,prompt_version:"v1",response_schema_version:1,context_version:1,provider_name:"openai",model_name:"model",input_tokens:10,output_tokens:20,total_tokens:30,cached_input_tokens:0,reasoning_tokens:0,estimated_cost_usd:.01,pricing_snapshot_version:"pricing-v1",created_at:"2026-01-01T00:00:00Z",completed_at:"2026-01-01T00:00:01Z"};
describe("Intelligence Library projection",()=>{
 it("exposes existing history without a Knowledge copy",()=>{const items=buildIntelligenceLibrary([thread],[run],[]);expect(items).toHaveLength(1);expect(items[0].latestRun?.user_prompt).toBe("Explore Bergamot");expect(items[0].reference).toBeUndefined()});
 it("uses organization metadata without altering authoritative thread/run records",()=>{const reference={id:"k",source_intelligence_thread_id:"t1",title:"Custom",user_note:"Private",tags:["citrus"],is_pinned:true,archived_at:null,revision:1,updated_at:"2026-01-03"};const items=buildIntelligenceLibrary([thread],[run],[reference]);expect(items[0].displayTitle).toBe("Custom");expect(items[0].latestRun?.user_prompt).toBe("Explore Bergamot");expect(reference).not.toHaveProperty("response_payload")});
 it("searches prompts, custom titles, and concept materials and hides archived by default",()=>{const open=buildIntelligenceLibrary([thread],[run],[]);expect(filterLibrary(open,{search:"bergamot"})).toHaveLength(1);const archived=buildIntelligenceLibrary([thread],[run],[{id:"k",source_intelligence_thread_id:"t1",title:"Citrus study",user_note:null,tags:[],is_pinned:false,archived_at:"2026-01-03",revision:1,updated_at:"2026-01-03"}]);expect(filterLibrary(archived,{})).toHaveLength(0);expect(filterLibrary(archived,{includeArchived:true,search:"citrus"})).toHaveLength(1)});
 it("keeps failed runs filterable and excludes their usage from aggregation",()=>{const failed={...run,id:"r2",status:"failed",error_code:"PROVIDER_FAILURE",total_tokens:999,estimated_cost_usd:99};const items=buildIntelligenceLibrary([thread],[run,failed],[]);expect(filterLibrary(items,{status:"PROVIDER_FAILURE"})).toHaveLength(1);expect(intelligenceUsageSummary(items)).toMatchObject({completedRuns:1,totalTokens:30,estimatedTotalCost:.01})});
 it("does not invent cost when pricing or usage is missing",()=>{const missing={...run,total_tokens:null,estimated_cost_usd:null};const summary=intelligenceUsageSummary(buildIntelligenceLibrary([thread],[missing],[]));expect(summary.totalTokens).toBe(0);expect(summary.estimatedTotalCost).toBeUndefined()});
});
