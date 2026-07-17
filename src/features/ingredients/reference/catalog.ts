import raw from './catalog.json'

export type ReferenceEntry = (typeof raw.entries)[number] & { reviewStatus:'needs_review'; evidenceQuality:'provisional'; catalogVersion:number }
const curatedCollections:Record<string,string[]>={
 'caprylic-capric-triglyceride':['Koalafrog Smart Start','Beard Oil Essentials','Buy Larger'],
 'simmondsia-chinensis-seed-oil':['Koalafrog Smart Start','Beard Oil Essentials','Buy Larger'],
 'ricinus-communis-seed-oil':['Koalafrog Smart Start','Beard Oil Essentials'],
 'mangifera-indica-seed-butter':['Koalafrog Smart Start','Beard Butter and Balm Essentials','Buy Larger'],
 'butyrospermum-parkii-butter':['Koalafrog Smart Start','Beard Butter and Balm Essentials','Buy Larger'],
 'cera-alba':['Koalafrog Smart Start','Beard Butter and Balm Essentials','Buy Larger'],
 'tocopherol':['Koalafrog Smart Start','Beard Oil Essentials','Buy Small'],
 'squalane':['Defer Until Formula Is Ready'],
 'argania-spinosa-kernel-oil':['Defer Until Formula Is Ready'],
 'citrus-aurantium-bergamia-peel-oil':['Koalafrog Smart Start','Fragrance Trial Materials','Buy Small'],
 'cedrus-atlantica-bark-oil':['Koalafrog Smart Start','Fragrance Trial Materials','Buy Small'],
 'amyris-balsamifera-bark-oil':['Koalafrog Smart Start','Fragrance Trial Materials','Buy Small'],
 'elettaria-cardamomum-seed-oil':['Koalafrog Smart Start','Fragrance Trial Materials','Buy Small'],
 'juniperus-communis-fruit-oil':['Koalafrog Smart Start','Fragrance Trial Materials','Buy Small'],
 'lavandula-angustifolia-oil':['Koalafrog Smart Start','Fragrance Trial Materials','Buy Small'],
}
export const ingredientReferenceCatalog:ReferenceEntry[] = raw.entries.map(entry=>({...entry,collections:[...new Set([...entry.collections,...(curatedCollections[entry.id]??[])])],reviewStatus:'needs_review',evidenceQuality:'provisional',catalogVersion:raw.catalogVersion}))
export const referenceCollections = [...new Set(ingredientReferenceCatalog.flatMap(entry=>entry.collections))].sort()

const normalize=(value:string)=>value.trim().toLocaleLowerCase().replace(/\s+/g,' ')
export function searchReferenceCatalog(query:string, category='All', collection='All') {
  const needle=query.trim().toLocaleLowerCase()
  return ingredientReferenceCatalog.filter(entry=>(category==='All'||entry.category===category)&&(collection==='All'||entry.collections.includes(collection))&&(!needle||[entry.commonName,entry.inciName,entry.category,...entry.functions,...entry.uses,...(('aliases'in entry&&entry.aliases)||[])].join(' ').toLocaleLowerCase().includes(needle)))
}

export function validateReferenceCatalog() {
  const errors:string[]=[]; const ids=new Set<string>(); const incis=new Set<string>()
  for(const entry of ingredientReferenceCatalog){
    if(!entry.id||!entry.commonName||!entry.inciName||!entry.summary) errors.push(`${entry.id||'unknown'}: missing required field`)
    if(ids.has(entry.id)) errors.push(`${entry.id}: duplicate id`); ids.add(entry.id)
    const inci=normalize(entry.inciName); if(incis.has(inci)) errors.push(`${entry.id}: duplicate canonical INCI`); incis.add(inci)
    if(!entry.limitations.length) errors.push(`${entry.id}: limitations required`)
  }
  return errors
}
