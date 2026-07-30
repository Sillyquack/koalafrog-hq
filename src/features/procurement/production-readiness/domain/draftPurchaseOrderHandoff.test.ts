import {describe,expect,it} from 'vitest'
import {DRAFT_PURCHASE_ORDER_HANDOFF_POLICY_VERSION,draftHandoffBlockers,effectiveDraftValue} from './draftPurchaseOrderHandoff'

const ready={status:'checkout_ready',revision:1,supplierCount:2,lineCount:2}
const baskets=[{id:'a',supplierId:'sa',currency:'GBP'},{id:'b',supplierId:'sb',currency:'EUR'}]
const lines=[{basketId:'a',packageCount:1,purchasedQuantity:100},{basketId:'b',packageCount:2,purchasedQuantity:200}]
const checks=[{severity:'required' as const,resolutionState:'resolved',verificationState:'confirmed'}]

describe('draft Purchase Order handoff policy',()=>{
  it('is versioned and accepts a consistent checkout-ready multi-supplier plan',()=>{
    expect(DRAFT_PURCHASE_ORDER_HANDOFF_POLICY_VERSION).toBe('1.0.0')
    expect(draftHandoffBlockers(ready,baskets,lines,checks)).toEqual([])
  })
  it.each(['verification_required','superseded','cancelled'])('rejects %s plans',status=>{
    expect(draftHandoffBlockers({...ready,status},baskets,lines,checks)).not.toEqual([])
  })
  it('rejects hard mismatches, unavailable checks, bad currencies, and invalid grouping',()=>{
    expect(draftHandoffBlockers(ready,[{...baskets[0],currency:''}], [{...lines[0],basketId:'wrong'}],[{...checks[0],verificationState:'changed_requires_new_plan',resolutionState:'blocking'}])).toEqual(expect.arrayContaining([
      'Supplier basket snapshot is inconsistent.','Purchase Plan line snapshot is inconsistent.','Every supplier basket requires an explicit supplier and currency.','Every line must belong to one basket and preserve valid quantities.','Checkout verification still contains an unresolved blocker.',
    ]))
  })
  it('preserves expected, verified, effective, and provenance separately',()=>{
    expect(effectiveDraftValue(19.22,18.9,'changed_acceptable')).toEqual({expected:19.22,verified:18.9,effective:18.9,source:'checkout_verification'})
    expect(effectiveDraftValue(19.22,null,'confirmed')).toEqual({expected:19.22,verified:null,effective:19.22,source:'approved_snapshot'})
  })
})
