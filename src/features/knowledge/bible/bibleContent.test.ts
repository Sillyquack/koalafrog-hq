import { describe, expect, it } from 'vitest'
import { bibleArticles, bibleById, majorRouteBibleMap, searchBible } from './bibleContent'

const required=['id','title','section','order','summary','audience','status','lastVerified','relatedRoutes','entities','workflows','relatedArticles','keywords','sourceFiles','limitationStatus','content'] as const
const navigation=['/','/product-studio','/products','/formulas','/ingredients','/lab','/scent-house','/inventory','/production','/testing','/suppliers','/equipment','/costing','/compliance','/packaging','/launch','/knowledge','/development']

describe('Koalafrog Bible content contract',()=>{
 it('maps every major navigation module to a real article',()=>navigation.forEach(route=>expect(bibleById.has(majorRouteBibleMap[route])).toBe(true)))
 it('has required metadata and non-empty content',()=>bibleArticles.forEach(article=>{required.forEach(key=>expect(article[key]).not.toBeUndefined());expect(article.id).toMatch(/^[a-z0-9-]+$/);expect(article.title.trim()).not.toBe('');expect(article.summary.trim()).not.toBe('');expect(article.content.length).toBeGreaterThan(0);article.content.forEach(block=>expect(`${block.heading}${block.body}`.trim()).not.toBe(''))}))
 it('has unique IDs and canonical titles',()=>{expect(new Set(bibleArticles.map(x=>x.id)).size).toBe(bibleArticles.length);expect(new Set(bibleArticles.map(x=>x.title.toLowerCase())).size).toBe(bibleArticles.length)})
 it('resolves related articles and workflow links',()=>bibleArticles.forEach(article=>{article.relatedArticles.forEach(id=>expect(bibleById.has(id),`${article.id} -> ${id}`).toBe(true));article.workflows.forEach(id=>expect(id).toMatch(/^[a-z0-9-]+$/))}))
 it('contains no obvious secret material',()=>{const serialized=JSON.stringify(bibleArticles);expect(serialized).not.toMatch(/service_role|eyJ[a-zA-Z0-9_-]{20,}|sk-[a-zA-Z0-9]{16,}/)})
})

describe('Bible search',()=>{
 it('finds module titles',()=>expect(searchBible('Inventory').some(x=>x.article.id==='inventory')).toBe(true))
 it('finds body terms and returns an excerpt',()=>{const result=searchBible('immutable movement').find(x=>x.article.id==='inventory');expect(result?.excerpt.length).toBeGreaterThan(10)})
 it('finds glossary terms',()=>expect(searchBible('CPNP').some(x=>x.article.id==='glossary')).toBe(true))
 it('returns no results safely',()=>expect(searchBible('xyzzynotaword')).toEqual([]))
})
