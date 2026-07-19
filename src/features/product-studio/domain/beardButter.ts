export { formulaPercentageTotal, orderedPhases } from '../../formulas/domain/multiPhaseLogic'
import { productTemplates } from './formulationEngine'

export const beardButterPhases=[...productTemplates.beard_butter.defaultPhases]
export const beardButterProcess=[...productTemplates.beard_butter.draftProcess]

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
