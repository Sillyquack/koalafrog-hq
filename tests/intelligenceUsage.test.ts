import { describe, expect, it } from "vitest";
import { normalizeOpenAIUsage } from "../supabase/functions/_shared/intelligenceUsage";
describe("Intelligence provider usage",()=>{
 it("normalizes provider tokens and estimates from an explicit versioned pricing snapshot",()=>expect(normalizeOpenAIUsage({input_tokens:1000,output_tokens:500,total_tokens:1500,input_tokens_details:{cached_tokens:200},output_tokens_details:{reasoning_tokens:100}},{inputUsdPerMillion:"2",cachedInputUsdPerMillion:"1",outputUsdPerMillion:"8",snapshotVersion:"pricing-2026-07"})).toEqual({inputTokens:1000,outputTokens:500,totalTokens:1500,cachedInputTokens:200,reasoningTokens:100,providerUsageVersion:"openai-responses-v1",estimatedCostUsd:.0058,pricingSnapshotVersion:"pricing-2026-07"}));
 it("keeps usage valid without pricing and does not invent a cost",()=>expect(normalizeOpenAIUsage({input_tokens:10,output_tokens:20,total_tokens:30})).toEqual({inputTokens:10,outputTokens:20,totalTokens:30,cachedInputTokens:undefined,reasoningTokens:undefined,providerUsageVersion:"openai-responses-v1"}));
 it("does not persist arbitrary provider metadata or credentials",()=>expect(normalizeOpenAIUsage({input_tokens:1,output_tokens:1,total_tokens:2,authorization:"Bearer secret",request_headers:{api_key:"secret"}})).not.toHaveProperty("authorization"));
});
