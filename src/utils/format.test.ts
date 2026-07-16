import { describe,expect,it } from 'vitest'
import { formatDate,formatMoney } from './format'
describe('formatDate',()=>{it('handles absent and malformed dates without throwing',()=>{expect(formatDate(null)).toBe('Not set');expect(formatDate(undefined)).toBe('Not set');expect(formatDate('')).toBe('Not set');expect(formatDate('not-a-date')).toBe('Invalid date')});it('formats valid dates',()=>expect(formatDate('2027-01-15')).toBe('15 Jan 2027'))})
describe('formatMoney',()=>{it('uses the stored currency rather than the workspace default',()=>{expect(formatMoney(77.46,'GBP')).toContain('77.46');expect(formatMoney(77.46,'GBP')).not.toContain('NOK')})})
