import type { FormulaPhaseDefinition, FormulaProcessStep } from '../../../types/domain'

const finite = (value:number|undefined) => value == null || Number.isFinite(value)
const validTemperatureRange = (minimum:number|undefined,maximum:number|undefined) =>
  finite(minimum) && finite(maximum) && (minimum == null || maximum == null || minimum <= maximum)

export function orderedPhases(phases:FormulaPhaseDefinition[]){
  return [...phases].sort((a,b)=>a.order-b.order||a.code.localeCompare(b.code))
}

export function formulaPercentageTotal(lines:Array<{percentage:number}>){
  return lines.reduce((sum,line)=>sum+line.percentage,0)
}

export function formulaTotalsExactly100(lines:Array<{percentage:number}>,tolerance=0.0001){
  const total=formulaPercentageTotal(lines)
  return Number.isFinite(total)&&Math.abs(total-100)<=tolerance
}

export function formulaCompositionIssues(lines:Array<{percentage:number}>){
  const issues:string[]=[]
  for(const line of lines)if(!Number.isFinite(line.percentage)||line.percentage<0||line.percentage>100)issues.push('Formula percentages must be finite values from 0 to 100.')
  if(!formulaTotalsExactly100(lines))issues.push('Formula percentages must total exactly 100%.')
  return [...new Set(issues)]
}

export function formulationIssues(
  capabilities:{phases:boolean},
  phases:FormulaPhaseDefinition[],
  lines:Array<{phase:string;percentage:number}>,
  process:FormulaProcessStep[]=[],
){
  return capabilities.phases?multiPhaseIssues(phases,lines,process):formulaCompositionIssues(lines)
}

export function multiPhaseIssues(
  phases:FormulaPhaseDefinition[],
  lines:Array<{phase:string;percentage:number}>,
  process:FormulaProcessStep[]=[],
){
  const issues:string[]=[]
  const codes=phases.map(phase=>phase.code.trim())
  const orders=phases.map(phase=>phase.order)
  if(codes.some(code=>!code))issues.push('Every phase needs a code.')
  if(new Set(codes).size!==codes.length)issues.push('Phase codes must be unique.')
  if(orders.some(order=>!Number.isInteger(order)||order<1))issues.push('Phase order must use positive whole numbers.')
  if(new Set(orders).size!==orders.length)issues.push('Phase order values must be unique.')
  for(const phase of phases){
    if(!phase.name.trim())issues.push(`Phase ${phase.code||'without code'} needs a name.`)
    if(!finite(phase.targetTemperature)||!validTemperatureRange(phase.minimumTemperature,phase.maximumTemperature))issues.push(`Phase ${phase.code||'without code'} has an invalid temperature range.`)
  }
  for(const line of lines){
    if(!codes.includes(line.phase))issues.push(`Formula line references unknown phase ${line.phase||'(blank)'}.`)
  }
  issues.push(...formulaCompositionIssues(lines))
  for(const step of process){
    if(step.phaseCode&&!codes.includes(step.phaseCode))issues.push(`Process step ${step.order} references unknown phase ${step.phaseCode}.`)
    if(!Number.isInteger(step.order)||step.order<1)issues.push('Process step order must use positive whole numbers.')
    if(step.durationMinutes!=null&&(!Number.isFinite(step.durationMinutes)||step.durationMinutes<0))issues.push(`Process step ${step.order} has an invalid duration.`)
    if(!finite(step.targetTemperature)||!validTemperatureRange(step.minimumTemperature,step.maximumTemperature))issues.push(`Process step ${step.order} has an invalid temperature range.`)
  }
  const processOrders=process.map(step=>step.order)
  if(new Set(processOrders).size!==processOrders.length)issues.push('Process step order values must be unique.')
  return [...new Set(issues)]
}
