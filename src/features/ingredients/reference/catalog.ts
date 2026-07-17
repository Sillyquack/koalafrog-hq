import raw from './catalog.json'

export type ReferenceEntry = (typeof raw.entries)[number] & { reviewStatus:'needs_review'; evidenceQuality:'provisional'; catalogVersion:number }
export const referenceCollections = [...new Set(raw.entries.flatMap(entry=>entry.collections))].sort()
export const ingredientReferenceCatalog:ReferenceEntry[] = raw.entries.map(entry=>({...entry,reviewStatus:'needs_review',evidenceQuality:'provisional',catalogVersion:raw.catalogVersion}))

export function searchReferenceCatalog(query:string, category='All', collection='All') {
  const needle=query.trim().toLocaleLowerCase()
  return ingredientReferenceCatalog.filter(entry=>(category==='All'||entry.category===category)&&(collection==='All'||entry.collections.includes(collection))&&(!needle||[entry.commonName,entry.inciName,entry.category,...entry.functions,...entry.uses].join(' ').toLocaleLowerCase().includes(needle)))
}

export function validateReferenceCatalog() {
  const errors:string[]=[]; const ids=new Set<string>(); const incis=new Set<string>()
  for(const entry of ingredientReferenceCatalog){
    if(!entry.id||!entry.commonName||!entry.inciName||!entry.summary) errors.push(`${entry.id||'unknown'}: missing required field`)
    if(ids.has(entry.id)) errors.push(`${entry.id}: duplicate id`); ids.add(entry.id)
    const inci=entry.inciName.toLocaleLowerCase(); if(incis.has(inci)) errors.push(`${entry.id}: duplicate canonical INCI`); incis.add(inci)
    if(!entry.limitations.length) errors.push(`${entry.id}: limitations required`)
  }
  return errors
}
