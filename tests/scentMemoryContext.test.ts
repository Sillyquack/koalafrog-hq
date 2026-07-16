import { describe, expect, it } from "vitest";
import { relevantScentMemorySessions } from "../supabase/functions/_shared/scentMemoryContext";
const sessions=[{id:"product",product_id:"p1",formula_version_id:null,lab_batch_id:null,ingredient_id:null},{id:"version",product_id:null,formula_version_id:"v1",lab_batch_id:null,ingredient_id:null},{id:"batch",product_id:null,formula_version_id:null,lab_batch_id:"b1",ingredient_id:null},{id:"ingredient",product_id:null,formula_version_id:null,lab_batch_id:null,ingredient_id:"i1"},{id:"unrelated",product_id:"other",formula_version_id:null,lab_batch_id:null,ingredient_id:null}];
describe("bounded Scent Memory context",()=>{
 it("includes only observations relevant to selected current context",()=>expect(relevantScentMemorySessions(sessions,{productId:"p1",formulaVersionId:"v1",selectedIngredientIds:["i1"]},["b1"]).map(x=>x.id)).toEqual(["product","version","batch","ingredient"]));
 it("does not treat concept text as a context or evidence relationship",()=>expect(relevantScentMemorySessions(sessions,{selectedIngredientIds:[]},[])).toEqual([]));
});
