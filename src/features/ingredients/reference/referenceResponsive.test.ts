import{describe,expect,it}from'vitest'
import{readFileSync}from'node:fs'
const css=readFileSync(new URL('../../../styles/index.css',import.meta.url),'utf8')
describe('reference library responsive contract',()=>{it('collapses to one column at exact 390px',()=>{expect(css).toContain('@media(max-width:480px){.reference-grid{grid-template-columns:1fr}');expect(css).toContain('.reference-adopt .button{width:100%')})})
describe('Smart Start responsive contract',()=>{it('keeps lines and actions usable at exactly 390px',()=>{expect(css).toContain('@media(max-width:480px){.smart-start .page-header{display:block}');expect(css).toContain('.smart-start-lines article{grid-template-columns:1fr');expect(css).toContain('.smart-start-lines aside .button{width:100%')})})
