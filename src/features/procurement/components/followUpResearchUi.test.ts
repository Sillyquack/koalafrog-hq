import{readFileSync}from'node:fs'
import{describe,expect,it}from'vitest'

const panel=readFileSync(new URL('ResearchPanel.tsx',import.meta.url),'utf8')
const form=readFileSync(new URL('FollowUpResearchForm.tsx',import.meta.url),'utf8')
const css=readFileSync(new URL('../../../styles/index.css',import.meta.url),'utf8')

describe('Procurement follow-up research UI',()=>{
 it('keeps Retry distinct and launches a new consent-gated follow-up job',()=>{
  expect(panel).toContain('>Retry</button>')
  expect(panel).toContain('>Follow-up research</button>')
  expect(panel).toContain('<strong>Retry</strong> repeats essentially the same research.')
  expect(panel).toContain('runFollowUpResearch(')
  expect(form).toContain('This creates a new job linked to the previous result.')
  expect(form).toContain('I explicitly consent')
  expect(form).toContain('Results remain unreviewed candidates.')
 })

 it('shows the previous-job gaps, editable instructions, country and review lineage responsively',()=>{
  expect(form).toContain('Unresolved fields')
  expect(form).toContain('No fully resolved practical candidate')
  expect(form).toContain('<textarea required maxLength={4000}')
  expect(form).toContain('Delivery country')
  expect(panel).toContain('Follow-up result ·')
  expect(panel).toContain('newly resolved:')
  expect(css).toContain('.follow-up-research-form')
  expect(css).toContain('@media(max-width:700px)')
 })
})
