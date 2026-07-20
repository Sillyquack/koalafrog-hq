import { describe, expect, it } from 'vitest'
import { beardStudioPayload, mapBeardStudioRows, selectBeardStudioRepository, type StudioRows } from './beardStudioRepository'
import { createStarterWorkspace } from '../domain/beardStudio'

describe('hosted Beard Studio persistence', () => {
  it('maps normalized hosted rows and ordered children into clean domain models', () => {
    const state = createStarterWorkspace(), profile = state.profiles[0], tool = state.tools[0], map = state.lengthMaps[0], recipe = state.recipes[0]
    recipe.preferredProducts=[{productId:'product-oil',nameSnapshot:'Workshop Beard Oil',categorySnapshot:'Beard care',role:'beard oil'}]
    const rows = {
      profiles:[{id:profile.id,workspace_id:'workspace',owner_id:'owner',name:profile.name,status:profile.status,style_name:profile.styleName,description:profile.description,target_look:profile.targetLook,maintenance_frequency_days:profile.maintenanceFrequencyDays,preferred_overall_length_mm:profile.preferredOverallLengthMm,density:profile.density,texture:profile.texture,profile_details:{growth_notes:profile.growthNotes,asymmetry_notes:profile.asymmetryNotes,weak_area_notes:profile.weakAreaNotes,moustache_preference:profile.moustachePreference,cheek_line_preference:profile.cheekLinePreference,neckline_preference:profile.necklinePreference},created_at:profile.createdAt,updated_at:profile.updatedAt}],
      tools:[{id:tool.id,workspace_id:'workspace',owner_id:'owner',name:tool.name,brand:tool.brand,model:tool.model,tool_type:tool.type,minimum_length_mm:tool.minimumLengthMm,maximum_length_mm:tool.maximumLengthMm,adjustment_increment_mm:tool.adjustmentIncrementMm,washable:tool.washable,notes:tool.notes,is_primary:tool.primary,status:tool.status,created_at:tool.createdAt,updated_at:tool.updatedAt}],
      attachments:tool.attachments.map((item,index)=>({id:item.id,workspace_id:'workspace',tool_id:tool.id,name:item.name,display_order:index+1})),
      maps:[{id:map.id,workspace_id:'workspace',owner_id:'owner',profile_id:map.profileId,created_at:map.createdAt,updated_at:map.updatedAt}],
      zones:map.zones.map(zone=>({id:zone.id,workspace_id:'workspace',length_map_id:map.id,zone_name:zone.name,target_length_mm:zone.targetLengthMm,minimum_length_mm:zone.minimumLengthMm,maximum_length_mm:zone.maximumLengthMm,trim_direction:zone.trimDirection,tool_id:zone.toolId,attachment_id:zone.attachmentId,notes:zone.notes,display_order:zone.order,enabled:zone.enabled})),
      recipes:[{id:recipe.id,workspace_id:'workspace',owner_id:'owner',profile_id:recipe.profileId,name:recipe.name,status:recipe.status,version:recipe.version,estimated_duration_minutes:recipe.estimatedDurationMinutes,starting_condition:recipe.startingCondition,preparation_instructions:recipe.preparationInstructions,finishing_instructions:recipe.finishingInstructions,notes:recipe.notes,created_at:recipe.createdAt,updated_at:recipe.updatedAt}],
      steps:recipe.steps.map(step=>({id:step.id,workspace_id:'workspace',recipe_id:recipe.id,display_order:step.order,title:step.title,zones:step.zones,target_length_mm:step.targetLengthMm,tool_id:step.toolId,attachment_id:step.attachmentId,trim_direction:step.trimDirection,technique:step.technique,instruction:step.instruction,caution:step.caution,completion_required:step.completionRequired})),
      sessions:[],logs:[],
      recipeProducts:[{id:'link',workspace_id:'workspace',owner_id:'owner',recipe_id:recipe.id,product_id:'product-oil',product_name_snapshot:'Workshop Beard Oil',product_category_snapshot:'Beard care',usage_role:'beard oil',display_order:1}],
      logProducts:[],
    } satisfies StudioRows
    const mapped=mapBeardStudioRows(rows)
    expect(mapped.profiles[0]).toMatchObject({name:'Bobby Beard Profile',status:'Active'})
    expect(mapped.tools[0].attachments).toHaveLength(4)
    expect(mapped.lengthMaps[0].zones).toHaveLength(11)
    expect(mapped.recipes[0].steps.map(step=>step.order)).toEqual([1,2,3,4,5,6,7,8,9,10])
    expect(mapped.recipes[0].preferredProducts[0]).toEqual({productId:'product-oil',nameSnapshot:'Workshop Beard Oil',categorySnapshot:'Beard care',role:'beard oil'})
  })

  it('builds one atomic payload for profiles, tools, maps, recipes, sessions, logs and Product snapshots', () => {
    const state=createStarterWorkspace()
    state.recipes[0].preferredProducts=[{productId:'product-oil',nameSnapshot:'Workshop Beard Oil',categorySnapshot:'Beard care',role:'beard oil'}]
    const payload=beardStudioPayload('workspace',state)
    expect(payload).toMatchObject({workspace_id:'workspace',profiles:[{status:'Active'}],tools:[{attachments:expect.any(Array)}],length_maps:[{zones:expect.any(Array)}],recipes:[{product_links:[{product_id:'product-oil',role:'beard oil'}]}],sessions:[],logs:[]})
    expect(JSON.stringify(payload)).not.toContain('preferred_products')
  })

  it('selects local explicitly and refuses hosted mode without an active client/workspace', () => {
    expect(selectBeardStudioRepository('local').kind).toBe('local')
    expect(()=>selectBeardStudioRepository('supabase',undefined,undefined)).toThrow('active authenticated workspace')
  })
})
