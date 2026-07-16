import{readFileSync}from'node:fs'
import{describe,expect,it}from'vitest'
const css=readFileSync(new URL('../../styles/index.css',import.meta.url),'utf8')
describe('Ingredient metadata responsive contracts',()=>{it('keeps the 390px Ingredient form single-column and the Formula editor horizontally usable',()=>{expect(css).toContain('@media(max-width:760px)');expect(css).toContain('.form-grid{grid-template-columns:1fr}');expect(css).toContain('.builder-table{overflow-x:auto}');expect(css).toContain('@media(max-width:820px)');expect(css).toContain('.builder-columns,.builder-line{min-width:930px}')})})
