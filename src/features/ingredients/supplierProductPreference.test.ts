import{describe,expect,it,vi}from'vitest'
import{runPreferredSupplierProductAction}from'./supplierProductPreference'
describe('preferred Supplier Product quick action',()=>{
  it('invokes the canonical action and exposes pending completion',async()=>{const action=vi.fn().mockResolvedValue(undefined),pending:string[]=[],errors:string[]=[];await runPreferredSupplierProductAction('sp-b',action,id=>pending.push(id),message=>errors.push(message));expect(action).toHaveBeenCalledOnce();expect(action).toHaveBeenCalledWith('sp-b');expect(pending).toEqual(['sp-b','']);expect(errors).toEqual([''])})
  it('makes persistence failure visible and clears pending state',async()=>{const pending:string[]=[],errors:string[]=[];await expect(runPreferredSupplierProductAction('sp-b',vi.fn().mockRejectedValue(new Error('Conflict; refresh and retry')),id=>pending.push(id),message=>errors.push(message))).rejects.toThrow('Conflict');expect(errors).toEqual(['','Conflict; refresh and retry']);expect(pending).toEqual(['sp-b',''])})
})
