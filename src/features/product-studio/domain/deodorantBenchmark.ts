import type{KnowledgeConfidence,ProductStudioConcept}from'../../../types/domain'

export type BenchmarkIngredientClass='core_or_functional'|'declared_fragrance_constituent'
export interface BenchmarkInciLine{order:number;displayedName:string;canonicalInci:string;displayedAlias?:string;referenceEntryId:string;classification:BenchmarkIngredientClass;productSpecificFunction:'unknown'|'likely_functional'|'perfuming'}
export interface BenchmarkKnowledgeStatement{referenceEntryId:string;roles:string[];source:string;confidence:KnowledgeConfidence;notes:string}

export const benchmarkDeodorantInci:BenchmarkInciLine[]=[
 {order:1,displayedName:'PROPYLENE GLYCOL',canonicalInci:'Propylene Glycol',referenceEntryId:'propylene-glycol',classification:'core_or_functional',productSpecificFunction:'likely_functional'},
 {order:2,displayedName:'AQUA/WATER',canonicalInci:'Aqua',displayedAlias:'Water',referenceEntryId:'aqua',classification:'core_or_functional',productSpecificFunction:'likely_functional'},
 {order:3,displayedName:'SODIUM STEARATE',canonicalInci:'Sodium Stearate',referenceEntryId:'sodium-stearate',classification:'core_or_functional',productSpecificFunction:'likely_functional'},
 {order:4,displayedName:'PARFUM/FRAGRANCE',canonicalInci:'Parfum',displayedAlias:'Fragrance',referenceEntryId:'parfum',classification:'core_or_functional',productSpecificFunction:'perfuming'},
 {order:5,displayedName:'JUNIPERUS VIRGINIANA OIL',canonicalInci:'Juniperus Virginiana Oil',referenceEntryId:'juniperus-virginiana-oil',classification:'core_or_functional',productSpecificFunction:'perfuming'},
 {order:6,displayedName:'ETHYLHEXYLGLYCERIN',canonicalInci:'Ethylhexylglycerin',referenceEntryId:'ethylhexylglycerin',classification:'core_or_functional',productSpecificFunction:'likely_functional'},
 {order:7,displayedName:'CETYL ALCOHOL',canonicalInci:'Cetyl Alcohol',referenceEntryId:'cetyl-alcohol',classification:'core_or_functional',productSpecificFunction:'likely_functional'},
 {order:8,displayedName:'STYRENE/ACRYLATES COPOLYMER',canonicalInci:'Styrene/Acrylates Copolymer',referenceEntryId:'styrene-acrylates-copolymer',classification:'core_or_functional',productSpecificFunction:'likely_functional'},
 {order:9,displayedName:'STEARIC ACID',canonicalInci:'Stearic Acid',referenceEntryId:'stearic-acid',classification:'core_or_functional',productSpecificFunction:'likely_functional'},
 ...['Anise Alcohol','Benzyl Alcohol','Benzyl Benzoate','Citral','Coumarin','Isoeugenol','Limonene','Linalool'].map((canonicalInci,index)=>({order:index+10,displayedName:canonicalInci.toUpperCase(),canonicalInci,referenceEntryId:canonicalInci.toLowerCase().replaceAll(' ','-'),classification:'declared_fragrance_constituent' as const,productSpecificFunction:'unknown' as const})),
]

const source='User-supplied product label imported 2026-07-19; reference roles require external verification before operational use.'
export const benchmarkIngredientKnowledge:BenchmarkKnowledgeStatement[]=[
 ['propylene-glycol',['solvent','humectant'],'Likely general cosmetic roles; exact role and level in this product are unknown.'],['aqua',['solvent'],'Likely continuous-phase material; exact percentage is unknown.'],['sodium-stearate',['structuring agent','soap-gel former','viscosity controlling'],'Supports the system hypothesis but does not verify the process.'],['parfum',['perfuming'],'Declared fragrance constituents may originate from this blend.'],['juniperus-virginiana-oil',['perfuming'],'Exact supplied identity, composition and contribution are unknown.'],['ethylhexylglycerin',['deodorant','skin conditioning','preservative support'],'Possible roles only; efficacy and preservative performance are not established.'],['cetyl-alcohol',['emollient','viscosity controlling','co-structuring'],'General roles; product-specific contribution is not verified.'],['styrene-acrylates-copolymer',['film forming','opacifying','viscosity controlling'],'Possible roles require source review for the exact grade.'],['stearic-acid',['structuring','surfactant related','viscosity related'],'Possible roles only; commercial grade and product-specific contribution are unknown.'],
 ].map(([referenceEntryId,roles,notes])=>({referenceEntryId:referenceEntryId as string,roles:roles as string[],source,confidence:'assumed',notes:notes as string}))
benchmarkIngredientKnowledge.push(...benchmarkDeodorantInci.filter(line=>line.classification==='declared_fragrance_constituent').map(line=>({referenceEntryId:line.referenceEntryId,roles:['perfuming','declared fragrance constituent'],source,confidence:'assumed' as const,notes:line.canonicalInci==='Benzyl Alcohol'?'Product-specific function is unknown; it must not be assumed to be separately dosed or preservative.':'May originate from Parfum or Juniperus Virginiana Oil and must not be assumed to be separately dosed.'})))

export const benchmarkDeclarationNote='The declaration order is label order, not a known quantitative formula. Ingredients at or below applicable declaration thresholds may not provide reliable relative concentration information.'
export const benchmarkDeodorantConcept:ProductStudioConcept={
 id:'benchmark-deodorant-glycol-sodium-stearate',name:'Benchmark Deodorant Stick — Glycol/Sodium Stearate System',productType:'natural_deodorant',intentMode:'design',
 desiredProperties:['Firm but smooth stick','Clean glide','Low drag','Good payoff','Quick dry-down','Limited greasy residue','Stable fragrance delivery','Deodorant performance','Structural stability','Low crumbling','Low sweating/syneresis','Acceptable clarity or appearance'],selectedIngredients:[],scentDirections:[],candidateSubstitutes:{},
 notes:'Competitor/reference inspiration and performance benchmark. Preserve desirable performance characteristics without making a direct copy. The INCI declaration is not a reproducible formula and creates no Formula Lines.',
 analysis:{recordType:'benchmark_reference',benchmarkStatus:'competitor_reference',productCategory:'deodorant',format:'stick',brandIdentity:{state:'unknown'},productIdentity:{state:'unknown'},exactPercentages:{state:'unknown'},manufacturingProcess:{state:'unknown'},supplierRawMaterials:{state:'unknown'},source:{type:'user_supplied_product_label',date:'2026-07-19'},physicalSystem:'aqueous glycol soap-gel stick',formulationHypothesis:{value:'water/glycol sodium-stearate gel stick',confidence:'assumed'},orderedInci:benchmarkDeodorantInci,declarationNote:benchmarkDeclarationNote,ingredientKnowledge:benchmarkIngredientKnowledge,systemAnalysis:{authority:'non_authoritative',likelySystem:['aqueous/glycol continuous phase','sodium-stearate structured gel stick','supporting fatty structuring materials','fragrance system','deodorant-support ingredient','polymeric sensory/film/stability component']}},
 createdAt:'2026-07-19',updatedAt:'2026-07-19',
}

export function benchmarkIntentAnalysis(){return{referenceBenchmarkId:benchmarkDeodorantConcept.id,physicalSystem:'aqueous glycol soap-gel stick'}}
