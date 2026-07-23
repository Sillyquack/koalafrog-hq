import{beforeEach,describe,expect,it,vi}from'vitest'

const client=vi.hoisted(()=>({
 auth:{getSession:vi.fn()},
 functions:{invoke:vi.fn()},
}))

vi.mock('../../../platform/supabase/client',()=>({supabase:client}))

import{LiveProviderError,OpenAIWebResearchProvider}from'./liveProcurementProvider'
import type{ProcurementResearchSnapshot}from'./procurementResearchService'

const snapshot:ProcurementResearchSnapshot={
 request:{id:'request-1',title:'Jojoba',status:'researching',category:'raw_material',priority:'normal',needed_by:null,notes:'',revision:1,created_at:'',updated_at:''},
 items:[{id:'item-1',name:'Jojoba oil',category:'carrier_oil',requested_quantity:1,unit:'kg',required_specifications:['COA'],acceptable_substitutes:[],priority:'normal',needed_by:null,notes:''}],
 offers:[],
 constraints:{deliveryCountry:'NO',documentationRequirements:['COA'],preferredSuppliers:[],excludedSuppliers:[]},
}

describe('live procurement provider authentication',()=>{
 beforeEach(()=>{
  vi.clearAllMocks()
  client.auth.getSession.mockResolvedValue({data:{session:{access_token:'test-user-jwt'}},error:null})
  client.functions.invoke.mockResolvedValue({data:{accepted:true,status:'running'},error:null})
 })

 it('propagates the current session bearer token through the shared client',async()=>{
  const provider=new OpenAIWebResearchProvider()
  provider.prepareJob('job-1','workspace-1')

  await provider.discoverOffers(snapshot)

  expect(client.auth.getSession).toHaveBeenCalledOnce()
  expect(client.functions.invoke).toHaveBeenCalledWith('procurement-live-research',expect.objectContaining({
   headers:{Authorization:'Bearer test-user-jwt'},
  }))
 })

 it('returns only a durable background acknowledgement and exposes no provider operation id',async()=>{
  client.functions.invoke.mockResolvedValue({data:{accepted:true,status:'running',providerOperationId:'resp_must_not_escape'},error:null})
  const provider=new OpenAIWebResearchProvider()
  provider.prepareJob('job-1','workspace-1')
  const result=await provider.discoverOffers(snapshot)
  expect(result).toEqual(expect.objectContaining({asyncAccepted:true,findings:[]}))
  expect(result).not.toHaveProperty('providerOperationId')
 })

 it('fails closed before invocation when no authenticated session exists',async()=>{
  client.auth.getSession.mockResolvedValue({data:{session:null},error:null})
  const provider=new OpenAIWebResearchProvider()
  provider.prepareJob('job-1','workspace-1')

  await expect(provider.discoverOffers(snapshot)).rejects.toEqual(expect.objectContaining<Partial<LiveProviderError>>({
   code:'AUTHENTICATION_REQUIRED',
  }))
  expect(client.functions.invoke).not.toHaveBeenCalled()
 })

 it('does not log or persist the bearer token',async()=>{
  const log=vi.spyOn(console,'log').mockImplementation(()=>undefined)
  const info=vi.spyOn(console,'info').mockImplementation(()=>undefined)
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>undefined)
  const error=vi.spyOn(console,'error').mockImplementation(()=>undefined)
  const provider=new OpenAIWebResearchProvider()
  provider.prepareJob('job-1','workspace-1')

  await provider.discoverOffers(snapshot)

  expect([log,info,warn,error].flatMap(spy=>spy.mock.calls.flat())).not.toContain('test-user-jwt')
 })
})
