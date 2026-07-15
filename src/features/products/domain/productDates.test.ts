import { describe,expect,it } from 'vitest'
import { optionalDateValue, productTargetDateLabel } from './productDates'
describe('Product optional dates',()=>{it('does not serialize an unentered launch date',()=>expect(optionalDateValue('')).toBeUndefined());it('keeps a valid launch date',()=>expect(optionalDateValue('2027-01-15')).toBe('2027-01-15'));it('renders a Product without a launch date',()=>expect(productTargetDateLabel(null)).toBe('No target date'));it('does not crash on invalid optional input',()=>expect(productTargetDateLabel('bad')).toBe('Invalid date'))})
