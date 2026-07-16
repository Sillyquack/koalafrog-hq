import { describe, expect, it } from 'vitest'
import { routeScrollDecision } from './routeScrollDecision'

describe('application route scroll restoration',()=>{
 it.each([
  ['Dashboard → Bible article','PUSH'],
  ['long Intelligence thread → Bible','PUSH'],
  ['Development detail → Bible','PUSH'],
  ['next article','PUSH'],
  ['previous article','PUSH'],
  ['back-to-module link','PUSH'],
 ] as const)('%s starts at the top on normal navigation',(_label,navigationType)=>expect(routeScrollDecision({navigationType,hash:'',savedTop:940})).toEqual({kind:'top'}))
 it('search parameter navigation starts at the top',()=>expect(routeScrollDecision({navigationType:'REPLACE',hash:'',savedTop:600})).toEqual({kind:'top'}))
 it('Bible heading hashes target the intended heading instead of restoring stale position',()=>expect(routeScrollDecision({navigationType:'PUSH',hash:'#authority-and-immutability',savedTop:900})).toEqual({kind:'hash',hash:'#authority-and-immutability'}))
 it('browser back and forward restore a recorded position when practical',()=>expect(routeScrollDecision({navigationType:'POP',hash:'',savedTop:713})).toEqual({kind:'restore',top:713}))
 it('a POP without a known position safely starts at the top',()=>expect(routeScrollDecision({navigationType:'POP',hash:''})).toEqual({kind:'top'}))
})
