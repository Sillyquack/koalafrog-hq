import type { EquipmentRequirementLevel, FormulaEquipmentRequirement } from '../../../types/domain'

export const equipmentCatalogCategories = [
  'weighing',
  'measuring_transfer',
  'mixing',
  'heating_cooling',
  'filling_packaging',
  'hygiene_sanitation',
  'ppe',
  'qc_observation',
] as const

export type EquipmentCatalogCategory = typeof equipmentCatalogCategories[number]

export interface EquipmentCatalogItem {
  key: string
  name: string
  category: EquipmentCatalogCategory
  equipmentType?: string
  description: string
  preparationInstructions: string
  calibrationRelevant?: boolean
}

export const equipmentCatalog: EquipmentCatalogItem[] = [
  { key:'precision_balance',name:'Precision balance',category:'weighing',equipmentType:'scale',description:'Balance selected for the smallest intended formula quantity.',preparationInstructions:'Place level, verify clean, and complete the recorded pre-use check.',calibrationRelevant:true },
  { key:'calibration_check_weight',name:'Calibration / check weight',category:'weighing',description:'Traceable or internally identified weight used for a balance check.',preparationInstructions:'Inspect and use according to the recorded balance verification method.',calibrationRelevant:true },
  { key:'pipette_dropper',name:'Pipette or dropper',category:'measuring_transfer',equipmentType:'transfer_tool',description:'Small-volume transfer tool; capacity and graduation are optional facts.',preparationInstructions:'Select a clean tool suitable for the material and intended quantity.' },
  { key:'syringe',name:'Syringe',category:'measuring_transfer',description:'Needle-free measuring or filling syringe.',preparationInstructions:'Confirm the syringe is clean, dry, and compatible with the material.' },
  { key:'funnel',name:'Funnel',category:'measuring_transfer',description:'Transfer funnel sized for the source and receiving vessels.',preparationInstructions:'Clean, dry, and stage without touching product-contact surfaces.' },
  { key:'graduated_cylinder',name:'Graduated cylinder',category:'measuring_transfer',description:'Volume-measuring vessel where a formula actually uses volume.',preparationInstructions:'Verify clean, dry, undamaged, and suitable for the target volume.' },
  { key:'glass_beaker',name:'Glass beaker',category:'mixing',equipmentType:'lab_vessel',description:'Reusable glass mixing vessel with an optional capacity requirement.',preparationInstructions:'Inspect for chips, then clean, sanitise as required, and dry fully.' },
  { key:'stainless_mixing_vessel',name:'Stainless mixing vessel',category:'mixing',description:'Reusable stainless product-contact vessel.',preparationInstructions:'Inspect, clean, sanitise as required, and dry fully.' },
  { key:'spatula',name:'Spatula',category:'mixing',description:'Glass, silicone, or stainless manual mixing and transfer tool.',preparationInstructions:'Clean, sanitise as required, dry, and stage on a clean surface.' },
  { key:'stirrer_whisk',name:'Stirrer or whisk',category:'mixing',description:'Manual stirring tool chosen for the intended process.',preparationInstructions:'Clean, sanitise as required, dry, and stage before weighing.' },
  { key:'mini_homogenizer',name:'Mini homogenizer / mixer',category:'mixing',description:'Optional powered high-shear or rotor-stator mixing capability.',preparationInstructions:'Inspect the head, verify service state, clean, and sanitise as required.' },
  { key:'water_bath',name:'Water-bath setup',category:'heating_cooling',description:'Controlled indirect heating or cooling setup.',preparationInstructions:'Verify water level, stability, vessel fit, and temperature controls.' },
  { key:'hotplate',name:'Hotplate',category:'heating_cooling',description:'Direct controlled heating source used only where the process calls for it.',preparationInstructions:'Inspect, clear the surrounding area, and verify control operation.' },
  { key:'heat_safe_vessel',name:'Heat-safe vessel',category:'heating_cooling',description:'Process vessel with a recorded material and capacity suitable for the intended heating step.',preparationInstructions:'Inspect for damage, confirm the recorded heat-safe material and capacity, then clean and dry.' },
  { key:'thermometer',name:'Thermometer',category:'heating_cooling',description:'Temperature measurement with an optional required range.',preparationInstructions:'Verify clean probe and current recorded calibration or check status.',calibrationRelevant:true },
  { key:'heat_protection',name:'Heat protection',category:'heating_cooling',description:'Heat-resistant gloves, mat, or handling aid appropriate to the process.',preparationInstructions:'Inspect for damage and stage before any heating begins.' },
  { key:'filling_tool',name:'Bottle / jar filling aid',category:'filling_packaging',description:'Funnel, pipette, syringe, or other controlled filling aid.',preparationInstructions:'Clean, sanitise as required, dry, and confirm fit with the selected packaging.' },
  { key:'closure_fitting_aid',name:'Cap / closure fitting aid',category:'filling_packaging',description:'Tool used to fit or verify closures; closures remain Packaging Components.',preparationInstructions:'Clean product-contact surfaces and verify fit with the selected closure.' },
  { key:'label_batch_marker',name:'Label and batch marker',category:'filling_packaging',description:'Durable method for applying the intended label and batch identity.',preparationInstructions:'Stage the approved working label and confirm the batch identifier before filling.' },
  { key:'surface_sanitising_supplies',name:'Surface cleaning / sanitising supplies',category:'hygiene_sanitation',description:'Recorded supplies for preparing the production surface.',preparationInstructions:'Clean the work area and apply the recorded sanitation method before staging materials.' },
  { key:'tool_sanitation_supplies',name:'Container / tool sanitation supplies',category:'hygiene_sanitation',description:'Supplies used for the recorded container and tool sanitation method.',preparationInstructions:'Prepare the sanitation method and allow product-contact items to dry as required.' },
  { key:'lint_free_wipes',name:'Lint-free paper / towels',category:'hygiene_sanitation',description:'Low-lint disposable material for controlled preparation and cleanup.',preparationInstructions:'Stage a clean supply outside direct product-contact areas.' },
  { key:'disposable_gloves',name:'Suitable gloves',category:'ppe',description:'Gloves selected for the handled material and process risk.',preparationInstructions:'Stage the correct size and change whenever contaminated or damaged.' },
  { key:'apron',name:'Apron / protective clothing',category:'ppe',description:'Clean protective clothing for the production activity.',preparationInstructions:'Put on clean protective clothing before preparing the work area.' },
  { key:'eye_protection',name:'Eye protection',category:'ppe',description:'Eye protection where process or material risk warrants it.',preparationInstructions:'Inspect, clean, and stage before the risk-producing step.' },
  { key:'timer',name:'Timer',category:'qc_observation',description:'Timekeeping for defined process durations or observation points.',preparationInstructions:'Verify operation and reset before starting the timed step.' },
  { key:'ph_meter',name:'pH meter / test equipment',category:'qc_observation',description:'pH capability only for formulas that actually require pH measurement.',preparationInstructions:'Prepare current calibration buffers and verify the recorded method.',calibrationRelevant:true },
  { key:'sample_containers',name:'Sample containers',category:'qc_observation',description:'Clean identified containers for retained or evaluation samples.',preparationInstructions:'Stage clean containers and labels before production starts.' },
  { key:'batch_record',name:'Notebook / app batch record',category:'qc_observation',description:'The controlled record used to capture execution and observations.',preparationInstructions:'Open the exact batch record and confirm its formula version before weighing.' },
]

export function catalogRequirement(
  catalogKey:string,
  options:Partial<Omit<FormulaEquipmentRequirement,'id'|'formulaVersionId'|'catalogKey'|'requirementName'|'category'|'createdAt'|'updatedAt'>> & {requirementLevel?:EquipmentRequirementLevel}={},
) {
  const item=equipmentCatalog.find(candidate=>candidate.key===catalogKey)
  if(!item)throw new Error(`Unknown Equipment Catalog item: ${catalogKey}`)
  return {
    catalogKey:item.key,
    requirementName:item.name,
    category:item.category,
    requiredEquipmentType:item.equipmentType??item.key,
    quantityRequired:1,
    requirementLevel:'required' as EquipmentRequirementLevel,
    preparationInstructions:item.preparationInstructions,
    notes:'',
    sortOrder:0,
    ...options,
  }
}

export const beardOilEquipmentRequirements = [
  catalogRequirement('precision_balance',{requiredPrecision:0.01,unit:'g',notes:'Small additions require a verified 0.01 g or better resolution.',sortOrder:1}),
  catalogRequirement('glass_beaker',{minimumCapacity:250,unit:'ml',requiredMaterial:'glass',sortOrder:2}),
  catalogRequirement('spatula',{requiredMaterial:'glass|stainless|silicone',sortOrder:3}),
  catalogRequirement('pipette_dropper',{requirementLevel:'recommended',sortOrder:4}),
  catalogRequirement('surface_sanitising_supplies',{sortOrder:5}),
  catalogRequirement('tool_sanitation_supplies',{sortOrder:6}),
  catalogRequirement('lint_free_wipes',{requirementLevel:'recommended',sortOrder:7}),
  catalogRequirement('disposable_gloves',{requirementLevel:'recommended',sortOrder:8}),
  catalogRequirement('filling_tool',{requirementLevel:'recommended',sortOrder:9}),
  catalogRequirement('label_batch_marker',{sortOrder:10}),
  catalogRequirement('batch_record',{sortOrder:11}),
]
