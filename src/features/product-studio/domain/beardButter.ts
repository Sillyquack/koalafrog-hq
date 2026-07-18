import type { FormulaPhaseDefinition, FormulaProcessStep } from '../../../types/domain'
export { formulaPercentageTotal, orderedPhases } from '../../formulas/domain/multiPhaseLogic'

export const beardButterPhases:FormulaPhaseDefinition[]=[
  {code:'A',name:'Heat phase',order:1,instructions:'Butters, waxes and heat-stable oils. Confirm supplier-specific melting and heat limits before setting temperatures.'},
  {code:'B',name:'Cool-down phase',order:2,instructions:'Cool-down ingredients. Set an addition temperature only from supported material information.'},
  {code:'C',name:'Sensitive additions',order:3,instructions:'Fragrance, antioxidants and temperature-sensitive additions. Unknown heat limits remain unknown.'},
]

export const beardButterProcess:FormulaProcessStep[]=[
  {order:1,title:'Weigh Phase A',instruction:'Weigh Phase A materials separately and record actual weights.',phaseCode:'A',critical:true,completionCriteria:'All Phase A materials identified and weighed.'},
  {order:2,title:'Melt and combine',instruction:'Heat Phase A only as required by confirmed material information and mix until homogeneous; record the actual temperature.',phaseCode:'A',mixingMethod:'Stirring',mixingIntensity:'Gentle to moderate',critical:true,completionCriteria:'No visible solid wax or butter remains.'},
  {order:3,title:'Controlled cooling',instruction:'Remove from heat and cool while continuing controlled stirring.',phaseCode:'A',mixingMethod:'Stirring',mixingIntensity:'Gentle',critical:true,completionCriteria:'Batch reaches the Phase B addition range.'},
  {order:4,title:'Add Phase B',instruction:'Add Phase B below its confirmed material-specific limit and mix until uniform; record the actual temperature.',phaseCode:'B',mixingMethod:'Stirring',mixingIntensity:'Gentle',critical:true,completionCriteria:'Phase B is evenly incorporated.'},
  {order:5,title:'Add Phase C',instruction:'Add temperature-sensitive materials only within confirmed material-specific limits; record the actual temperature.',phaseCode:'C',mixingMethod:'Stirring',mixingIntensity:'Gentle',critical:true,completionCriteria:'Additions are uniformly dispersed.'},
  {order:6,title:'Finish texture',instruction:'Continue stirring or optionally whip according to the selected variant.',mixingMethod:'Stirring or whipping',mixingIntensity:'Record actual method',critical:false,completionCriteria:'Target visual texture is reached.'},
  {order:7,title:'Fill and set',instruction:'Fill suitable containers, record fill count, then cool and set without disturbance.',critical:true,completionCriteria:'Containers are filled and the batch is set aside for observation.'},
  {order:8,title:'Record final condition',instruction:'Record yield, appearance, texture, graininess, sweating and deviations.',critical:true,completionCriteria:'Initial physical observations are recorded.'},
]

export const beardButterEvaluationFields=['firmness','scoopability','graininess','oilSeparation','meltOnContact','spreadability','absorption','greasiness','residue','beardSoftness','skinComfort','scentStrength','appearance','stability','overallResult'] as const
export type BeardButterEvaluationField=typeof beardButterEvaluationFields[number]
export type BeardButterEvaluation=Record<BeardButterEvaluationField,number>
export interface BeardButterVariant{id:string;name:string;changes:string[];evaluation?:Partial<BeardButterEvaluation>}

export function compareVariants(variants:BeardButterVariant[]){return [...variants].sort((a,b)=>(b.evaluation?.overallResult??0)-(a.evaluation?.overallResult??0))}
export function validEvaluationScore(value:number){return Number.isFinite(value)&&value>=1&&value<=5}
export function suggestedPhase(category:string,name:string){
  const value=`${category} ${name}`.toLowerCase()
  if(value.includes('fragrance')||value.includes('essential oil')||value.includes('vitamin')||value.includes('antioxid'))return'C'
  if(value.includes('active'))return'B'
  return'A'
}
