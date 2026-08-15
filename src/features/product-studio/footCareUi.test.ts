import{readFileSync}from'node:fs'
import{describe,expect,it}from'vitest'

const page=readFileSync(new URL('FootCareStudioPage.tsx',import.meta.url),'utf8')
const entry=readFileSync(new URL('ProductStudioPage.tsx',import.meta.url),'utf8')
const app=readFileSync(new URL('../../app/App.tsx',import.meta.url),'utf8')
const context=readFileSync(new URL('../formulas/state/FormulaDataContext.tsx',import.meta.url),'utf8')
const actions=readFileSync(new URL('../procurement/actions/procurementActions.ts',import.meta.url),'utf8')
const research=readFileSync(new URL('../procurement/components/ResearchPanel.tsx',import.meta.url),'utf8')

describe('Foot Care Product Studio UI contracts',()=>{
  it('has its own Product Studio entry, route and page',()=>{
    expect(entry).toContain('Research Foot Care')
    expect(entry).toContain('productTemplates.foot_care.route')
    expect(app).toContain('FootCareStudioPage')
    expect(app).toContain('path="product-studio/foot-care"')
  })

  it('renders benchmark content from the registry rather than duplicating GEHWOL data in the page',()=>{
    expect(page).toContain('footCareBenchmarks.map')
    expect(page).toContain('benchmark.ingredients.map')
    expect(page).toContain('benchmark.developmentLearnings.map')
    expect(page).toContain('benchmark.claimGuardrails.map')
    expect(page).not.toContain('Fusskraft Blue 75 ml')
    expect(page).not.toContain('GEHWOL med Antiperspirant 125 ml')
    expect(page).not.toContain('Foot + Shoe Deodorant 150 ml')
  })

  it('creates and continues repository-backed foot_care concepts only through FormulaDataContext',()=>{
    expect(page).toContain("concept.productType==='foot_care'")
    expect(page).toContain('createFootCareConceptInput')
    expect(page).toContain('formulaData.saveProductStudioConcept')
    expect(context).toContain('commitState("saveProductStudioConcept"')
    expect(page).not.toContain('supabase')
    expect(page).not.toContain('localStorage')
  })

  it('keeps unsupported formulation systems truthful and exposes no Formula or Lab handoff',()=>{
    expect(page).toContain("system==='aerosol'")
    expect(page).toContain("archetype.maturity==='planned'")
    expect(page).toContain('No Foot Care project on this page can create a Formula or prepare a Lab Batch')
    expect(page).not.toContain('createFormulaFromStudio')
    expect(page).not.toContain('/lab?')
  })

  it('hands sourcing to the Procurement action boundary while live research retains consent and review',()=>{
    expect(page).toContain('procurementActions.createFootCareProcurementHandoff')
    expect(actions).toContain('createFootCareProcurementHandoff:repository.createFootCareProcurementHandoff')
    expect(page).toContain('Research was not started')
    expect(research).toContain("provider==='live'&&!consent")
    expect(research).toContain('Candidate review inbox')
    expect(research).toContain('preferredSupplierHints')
  })
})
