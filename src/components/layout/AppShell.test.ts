import{describe,expect,it}from'vitest'
import{readFileSync}from'node:fs'

const shell=readFileSync(new URL('AppShell.tsx',import.meta.url),'utf8')
const auth=readFileSync(new URL('../../platform/auth/AuthGate.tsx',import.meta.url),'utf8')
const css=readFileSync(new URL('../../styles/index.css',import.meta.url),'utf8')

describe('authenticated workspace identity layout',()=>{
 it('renders one semantic workspace identity block and preserves the avatar',()=>{
  expect(shell.match(/className="owner-mark"/g)).toHaveLength(1)
  expect(shell).toContain('className="owner-copy"')
  expect(shell).toContain('<strong>Owner workspace</strong>')
  expect(shell).toContain('{workspaceIdentity.title}')
  expect(shell).toContain('aria-hidden="true">RK</b>')
  expect(auth).not.toContain('className="owner-logout"')
  expect(shell.match(/Owner workspace/g)).toHaveLength(1)
 })
 it('uses Safari-safe shrinking without absolutely positioning account labels',()=>{
  expect(css).toContain('.owner-mark{display:flex')
  expect(css).toContain('.owner-copy{display:block;min-width:0')
  expect(css).toContain('text-overflow:ellipsis;white-space:nowrap')
  expect(css).not.toContain('.owner-copy{position:absolute')
 })
 it('uses balanced mobile columns and keeps search, avatar and logout accessible',()=>{
  expect(css).toContain('grid-template-columns:34px minmax(0,1fr) 34px')
  expect(shell).toContain('className="topbar-search"')
  expect(shell).toContain('owner account menu')
  expect(shell).toContain('<SecureLogoutButton />')
  expect(auth).toContain('className="account-logout"')
 })
})
