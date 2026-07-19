import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Sidebar } from './Sidebar'

describe('Sidebar',()=>{
  it('exposes Platform in a subordinate System navigation group',()=>{
    const html=renderToStaticMarkup(<MemoryRouter><Sidebar open onClose={vi.fn()}/></MemoryRouter>)
    expect(html).toContain('System')
    expect(html).toContain('href="/platform"')
    expect(html.indexOf('System')).toBeGreaterThan(html.indexOf('Workshop'))
  })
})
