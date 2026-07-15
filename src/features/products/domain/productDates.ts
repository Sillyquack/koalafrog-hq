import { formatDate } from '../../../utils/format'
export const optionalDateValue=(value:FormDataEntryValue|null)=>{const normalized=typeof value==='string'?value.trim():'';return normalized||undefined}
export const productTargetDateLabel=(value:string|null|undefined)=>formatDate(value,'No target date')
