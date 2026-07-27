import type { BeardPhotoAnalysisResult, BeardPhotoRecommendation, RecommendationReviewStatus } from '../../../intelligence/Vision/beardPhotoAnalysis'
import type { BeardProfile, GroomingTool } from '../../../types/beardStudio'

export const beardTargetStyles = ['structured_full_beard','short_boxed_beard','natural_defined_beard','fuller_chin_soft_side_fade','rugged_full_beard','custom'] as const
export type BeardTargetStyle = typeof beardTargetStyles[number]
export type RecommendationPriorityLabel = 'Highest impact'|'Useful refinement'|'Optional detail'

export interface BeardAnalysisTarget { value: BeardTargetStyle; label: string; customLabel?: string }
export interface GroomingSummarySnapshot {
  version: 2; targetStyle: BeardAnalysisTarget|null; overallAssessment: string; strengths: string[]; highestImpactImprovements: Array<{recommendationId:string;title:string}>
  sequence: string[]; estimatedTrimMinutes: number; difficulty: 'Easy'|'Moderate'|'Advanced'; confidence: 'High'|'Moderate'|'Low'; photoQualityCaveat: string
}
export interface ToolInstruction { tool: string; attachmentOrComb: string|null; guardSetting: string|null; technique: string; fallbackWording: string|null; supported: boolean; caution?: string }
export interface TrimPlanStep {
  id: string; order: number; title: string; region: string; tool: string; attachmentOrComb: string|null; guardSetting:string|null; technique:string; fallbackWording:string|null; direction?: string
  caution: string; expectedResult: string; recommendationIds: string[]; universal?: boolean
}
export interface TrimPlanSnapshot { version: 2; intelligenceVersion:'beard-intelligence-v2'; targetStyle:BeardAnalysisTarget|null; generatedAt: string; sourceFingerprint: string; steps: TrimPlanStep[] }

const targetLabels:Record<BeardTargetStyle,string>={
  structured_full_beard:'Structured full beard',short_boxed_beard:'Short boxed beard',natural_defined_beard:'Natural defined beard',
  fuller_chin_soft_side_fade:'Fuller chin with soft side fade',rugged_full_beard:'Rugged full beard',custom:'Custom target',
}
export const targetStyleLabel=(target?:BeardAnalysisTarget|null)=>target ? (target.value==='custom'&&target.customLabel?.trim()||targetLabels[target.value]) : 'No target style recorded'
export function targetFromProfile(profile?:BeardProfile):BeardAnalysisTarget {
  const text=`${profile?.styleName??''} ${profile?.targetLook??''}`.toLowerCase()
  if(text.includes('fuller chin')&&text.includes('fade'))return{value:'fuller_chin_soft_side_fade',label:targetLabels.fuller_chin_soft_side_fade}
  if(text.includes('structured full beard'))return{value:'structured_full_beard',label:targetLabels.structured_full_beard}
  if(text.includes('short boxed'))return{value:'short_boxed_beard',label:targetLabels.short_boxed_beard}
  if(text.includes('natural')&&text.includes('defined'))return{value:'natural_defined_beard',label:targetLabels.natural_defined_beard}
  if(text.includes('rugged'))return{value:'rugged_full_beard',label:targetLabels.rugged_full_beard}
  return{value:'custom',label:targetLabels.custom,customLabel:profile?.styleName||profile?.targetLook||'Custom target'}
}

const allItems=(result:BeardPhotoAnalysisResult)=>[...result.observations,...result.symmetry,...result.densityDistribution,...result.lineAssessment]
const priorityWeight={high:3,medium:2,low:1} as const
const targetTokens:Record<BeardTargetStyle,string[]>={
  structured_full_beard:['shape','line','side','chin','full'],short_boxed_beard:['short','box','line','cheek','neck'],
  natural_defined_beard:['natural','line','define','cheek','neck'],fuller_chin_soft_side_fade:['chin','side','fade','transition','full'],
  rugged_full_beard:['full','natural','density','chin','jaw'],custom:[],
}
const relevance=(recommendation:BeardPhotoRecommendation,target?:BeardAnalysisTarget|null)=>{
  if(!target)return 0
  const haystack=`${recommendation.title} ${recommendation.reason} ${recommendation.expectedBenefit} ${recommendation.affectedZones.join(' ')}`.toLowerCase()
  return targetTokens[target.value].some(token=>haystack.includes(token))?1:0
}
export function rankRecommendations(recommendations:BeardPhotoRecommendation[],target?:BeardAnalysisTarget|null) {
  return recommendations.map((item,index)=>({item,index,score:priorityWeight[item.priority]*10+Math.round(item.confidence*4)+Math.min(2,item.supportingObservationKeys.length)+relevance(item,target)*3}))
    .sort((a,b)=>b.score-a.score||b.item.confidence-a.item.confidence||a.item.title.localeCompare(b.item.title)||a.item.id.localeCompare(b.item.id)||a.index-b.index)
    .map(({item,score})=>({...item,priorityLabel:(score>=31?'Highest impact':score>=21?'Useful refinement':'Optional detail') as RecommendationPriorityLabel}))
}
const positive=/\b(strong|balanced|full|dense|defined|even|consistent|clean|good)\b/i
export function deriveGroomingSummary(result:BeardPhotoAnalysisResult,target?:BeardAnalysisTarget|null):GroomingSummarySnapshot {
  const items=allItems(result),ranked=rankRecommendations(result.recommendations,target)
  const strengths=items.filter(item=>positive.test(item.statement)).sort((a,b)=>b.confidence-a.confidence||a.observationKey.localeCompare(b.observationKey)).slice(0,2).map(item=>item.statement)
  const improvements=ranked.slice(0,3).map(item=>({recommendationId:item.id,title:item.title}))
  const mean=result.recommendations.length?result.recommendations.reduce((sum,item)=>sum+item.confidence,0)/result.recommendations.length:0
  const minutes=Math.max(10,Math.min(45,10+improvements.length*5+result.recommendations.filter(item=>item.priority==='high').length*5))
  return {version:2,targetStyle:target?structuredClone(target):null,overallAssessment:improvements.length?`${strengths[0]??'The supplied views provide a usable grooming baseline.'} Focus first on ${improvements[0].title.toLowerCase()} relative to ${targetStyleLabel(target)}.`:'The supplied views do not support a prioritized trim change.',
    strengths:strengths.length?strengths:['No distinct strength was stated with enough support in the persisted observations.'],highestImpactImprovements:improvements,
    sequence:improvements.map(item=>item.title),estimatedTrimMinutes:minutes,difficulty:improvements.length>2?'Moderate':'Easy',
    confidence:mean>=.8?'High':mean>=.6?'Moderate':'Low',photoQualityCaveat:result.photoQuality.overall==='suitable'&&!result.photoQuality.retakeRecommended?'Photo quality supports cautious visual guidance; it does not provide calibrated measurement.':`Photo quality is ${result.photoQuality.overall}; treat recommendations cautiously${result.photoQuality.retakeRecommended?' and consider a retake':''}.`}
}

const attachment=(tool:GroomingTool,pattern:RegExp)=>tool.attachments.find(item=>pattern.test(item.name))
const mmFrom=(strategy:string|null)=>strategy?.match(/\b(\d+(?:\.\d+)?)\s*mm\b/i)?.[1]
export function mapToolInstruction(recommendation:BeardPhotoRecommendation,tool?:GroomingTool):ToolInstruction {
  if(!tool)return{tool:'Your usual beard tool',attachmentOrComb:null,guardSetting:null,technique:recommendation.proposedGuardStrategy??'Use a conservative technique and inspect after each pass.',fallbackWording:'No compatible primary tool capability is recorded; use a conservative generic technique.',supported:false,caution:'No compatible primary tool capability is recorded.'}
  const text=`${recommendation.title} ${recommendation.proposedGuardStrategy??''} ${recommendation.affectedZones.join(' ')}`.toLowerCase()
  const detail=attachment(tool,/detail trimmer/i),fade=attachment(tool,/fade comb/i),long=attachment(tool,/long[- ]length comb/i),adjustable=attachment(tool,/adjustable comb/i),raw=mmFrom(recommendation.proposedGuardStrategy),mm=raw?Number(raw):null
  if(/\b(lip|moustache line|cheek line|neckline|detail)\b/.test(text)&&detail)return{tool:`${tool.name} / ${tool.model}`,attachmentOrComb:detail.name,guardSetting:null,technique:'Remove the comb and use the detail trimmer.',fallbackWording:null,supported:true,caution:'Define the line conservatively.'}
  if(/\b(fade|transition)\b/.test(text)&&fade)return{tool:`${tool.name} / ${tool.model}`,attachmentOrComb:fade.name,guardSetting:null,technique:'Use only in the transition zone.',fallbackWording:null,supported:true}
  if(mm!==null){
    const inRange=tool.minimumLengthMm!==null&&tool.maximumLengthMm!==null&&mm>=tool.minimumLengthMm&&mm<=tool.maximumLengthMm
    const aligned=tool.adjustmentIncrementMm!==null&&Math.abs((mm-(tool.minimumLengthMm??0))/tool.adjustmentIncrementMm-Math.round((mm-(tool.minimumLengthMm??0))/tool.adjustmentIncrementMm))<1e-6
    const comb=mm>10?long:adjustable
    if(inRange&&aligned&&comb)return{tool:`${tool.name} / ${tool.model}`,attachmentOrComb:comb.name,guardSetting:`${mm} mm`,technique:mm>10?`Use the long-length comb for ${mm} mm.`:`Set the adjustable comb to ${mm} mm.`,fallbackWording:null,supported:true}
    return{tool:`${tool.name} / ${tool.model}`,attachmentOrComb:null,guardSetting:raw?`${raw} mm`:null,technique:recommendation.proposedGuardStrategy??'Use the closest recorded supported setting.',fallbackWording:'The exact setting is not verified by the recorded tool capabilities; use the closest recorded supported setting.',supported:false,caution:'This exact setting is not verified by the recorded tool capabilities.'}
  }
  return{tool:`${tool.name} / ${tool.model}`,attachmentOrComb:null,guardSetting:null,technique:recommendation.proposedGuardStrategy??'Use a light pass and inspect before removing more.',fallbackWording:'No exact compatible setting is present; use a light pass and inspect before removing more.',supported:false,caution:'No exact compatible setting is present in the recommendation.'}
}
const stepTitle=(zones:string[])=>zones.some(z=>/moustache|lip/.test(z))?'Refine moustache':zones.some(z=>/neck/.test(z))?'Raise and define neckline':zones.some(z=>/cheek line/.test(z))?'Define cheek line':zones.some(z=>/chin/.test(z))?'Preserve chin length':zones.some(z=>/side|cheek/.test(z))?'Shape the sides':'Set overall length'
export function generateTrimPlan(result:BeardPhotoAnalysisResult,tool:GroomingTool|undefined,target:BeardAnalysisTarget|null= null,generatedAt=result.createdAt):TrimPlanSnapshot {
  const accepted=rankRecommendations(result.recommendations).filter(item=>item.status==='accepted_for_planning')
  const groups=new Map<string,typeof accepted>()
  for(const item of accepted){const title=stepTitle(item.affectedZones);groups.set(title,[...(groups.get(title)??[]),item])}
  const steps:TrimPlanStep[]=[{id:'prepare',order:1,title:'Prepare',region:'all beard zones',tool:'Comb or brush',attachmentOrComb:'Comb or brush',guardSetting:null,technique:'Use the current wash/dry routine, then comb the beard into its natural position.',fallbackWording:null,caution:'Trim only when the beard condition matches your usual routine.',expectedResult:'Hair sits naturally before length decisions.',recommendationIds:[],universal:true}]
  for(const [title,items] of groups){const mapped=mapToolInstruction(items[0],tool);steps.push({id:`step-${items.map(x=>x.id).sort().join('-')}`,order:steps.length+1,title,region:[...new Set(items.flatMap(x=>x.affectedZones))].join(', ')||'specified region',tool:mapped.tool,attachmentOrComb:mapped.attachmentOrComb,guardSetting:mapped.guardSetting,technique:mapped.technique,fallbackWording:mapped.fallbackWording,direction:/line|detail/i.test(title)?'detail only':'with growth first',caution:mapped.caution??'Start conservatively and inspect before another pass.',expectedResult:items.map(x=>x.expectedBenefit).join(' '),recommendationIds:items.map(x=>x.id).sort()})}
  steps.push({id:'final-check',order:steps.length+1,title:'Final symmetry check',region:'whole beard',tool:'Mirror and comb',attachmentOrComb:'Comb',guardSetting:null,technique:'Comb through, change viewing angle, and make only supported finishing corrections.',fallbackWording:null,caution:'Do not chase apparent asymmetry caused by lighting or camera angle.',expectedResult:'A deliberate final check without adding unreviewed changes.',recommendationIds:[],universal:true})
  const sourceFingerprint=JSON.stringify(accepted.map(item=>[item.id,item.status,item.proposedGuardStrategy]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))
  return{version:2,intelligenceVersion:'beard-intelligence-v2',targetStyle:target?structuredClone(target):null,generatedAt,sourceFingerprint,steps}
}
export const reviewCounts=(recommendations:Array<{status:RecommendationReviewStatus}>)=>recommendations.reduce((counts,item)=>({...counts,[item.status]:counts[item.status]+1}),{accepted_for_planning:0,dismissed:0,undecided:0})
