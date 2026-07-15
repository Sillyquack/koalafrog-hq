import {describe,expect,it,vi} from 'vitest'
import {invokeIntelligence,type AuthenticatedIntelligenceGateway} from './intelligenceClient'
const request={schemaVersion:1 as const,mode:'scent_exploration' as const,workspaceId:'workspace-active',userPrompt:'Explore',contextSelection:{selectedIngredientIds:[],conceptMaterials:['Bergamot']}}
const gateway=(session:unknown={user:{id:'owner'}})=>({auth:{getSession:vi.fn().mockResolvedValue({data:{session},error:null})},functions:{invoke:vi.fn().mockResolvedValue({data:{threadId:'t',runId:'r',response:{},contextManifest:{}}})}} as unknown as AuthenticatedIntelligenceGateway)
describe('authenticated Intelligence invocation',()=>{
  it('uses the canonical workspace ID and authenticated gateway',async()=>{const client=gateway();await invokeIntelligence(client,request);expect(client.functions.invoke).toHaveBeenCalledWith('koalafrog-intelligence',{body:request})})
  it('does not call the function without an active workspace',async()=>{const client=gateway();await expect(invokeIntelligence(client,{...request,workspaceId:''})).rejects.toMatchObject({code:'ACTIVE_WORKSPACE_UNAVAILABLE'});expect(client.functions.invoke).not.toHaveBeenCalled()})
  it('maps expired authentication separately',async()=>{const client=gateway(null);await expect(invokeIntelligence(client,request)).rejects.toMatchObject({code:'AUTHENTICATION_EXPIRED'});expect(client.functions.invoke).not.toHaveBeenCalled()})
})
