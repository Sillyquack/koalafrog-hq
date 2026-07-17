import fs from 'node:fs'
const catalog=JSON.parse(fs.readFileSync(new URL('../src/features/ingredients/reference/catalog.json',import.meta.url),'utf8'))
const errors=[]; const ids=new Set(); const incis=new Set()
for(const e of catalog.entries){if(!e.id||!e.commonName||!e.inciName||!e.summary)errors.push(`${e.id||'unknown'}: missing required field`);if(ids.has(e.id))errors.push(`${e.id}: duplicate id`);ids.add(e.id);const inci=e.inciName.toLowerCase();if(incis.has(inci))errors.push(`${e.id}: duplicate INCI`);incis.add(inci);if(!e.limitations?.length)errors.push(`${e.id}: limitations required`)}
if(process.argv.includes('--report')) console.log(JSON.stringify({catalogVersion:catalog.catalogVersion,publishedAt:catalog.publishedAt,entries:catalog.entries.length,categories:[...new Set(catalog.entries.map(e=>e.category))].sort(),collections:[...new Set(catalog.entries.flatMap(e=>e.collections))].sort(),validationErrors:errors},null,2))
else {if(errors.length){console.error(errors.join('\n'));process.exitCode=1}else console.log(`Ingredient Reference Library v${catalog.catalogVersion}: ${catalog.entries.length} valid entries`)}
