import type{Ingredient}from'../../../types/domain'
export function normalizeCosingFunctions(value:string|string[]){const values=Array.isArray(value)?value:value.split(',');return[...new Set(values.map(item=>item.trim().toUpperCase()).filter(Boolean))]}
export function cosingStatus(ingredient:Ingredient){return ingredient.cosingVerificationStatus??(ingredient.functions.length?'needs_review':'unverified')}
