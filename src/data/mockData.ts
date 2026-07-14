import type { Accord, Activity, Batch, Ingredient, ModuleDefinition, Product, ScentMaterial, ScentProfile, TestingActivity } from '../types/domain'

export const products: Product[] = [
  { id: 'p1', name: 'Signature Beard Oil', category: 'Beard Care', status: 'Active', developmentStage: 'Testing', description: 'A dry-touch daily oil balancing glide, absorption and a quiet signature scent.', currentDevelopmentFormulaVersionId: 'fv-bo-02', scentProfile: 'Workshop No. 01', targetLaunchDate: '2026-11-15', createdAt: '2026-03-02', updatedAt: '2026-07-14' },
  { id: 'p2', name: 'Beard Butter', category: 'Beard Care', status: 'Active', developmentStage: 'Formulation', description: 'A soft, non-waxy conditioning butter with controlled melt and a refined finish.', currentDevelopmentFormulaVersionId: 'fv-bb-01', scentProfile: 'Warm Woods Study', targetLaunchDate: '2027-02-01', createdAt: '2026-04-18', updatedAt: '2026-07-12' },
  { id: 'p3', name: 'Beard Balm', category: 'Beard Care', status: 'Active', developmentStage: 'Research', description: 'Medium-control shaping balm designed for restyling without a heavy residue.', scentProfile: 'Unassigned', targetLaunchDate: '2027-04-20', createdAt: '2026-05-04', updatedAt: '2026-07-08' },
  { id: 'p4', name: 'Koalafrog Signature Fragrance', category: 'Fragrance', status: 'Active', developmentStage: 'Research', description: 'The olfactive cornerstone: mineral air, worn leather, warm timber and amber.', scentProfile: 'Signature DNA', targetLaunchDate: '2027-09-01', createdAt: '2026-02-12', updatedAt: '2026-07-13' },
  { id: 'p5', name: 'Daily Deodorant', category: 'Body Care', status: 'On hold', developmentStage: 'Idea', description: 'A dependable daily format explored through texture, wear and packaging studies.', scentProfile: 'Open brief', targetLaunchDate: '2028-03-01', createdAt: '2026-06-21', updatedAt: '2026-06-21' },
]

export const ingredients: Ingredient[] = [
  { id: 'i1', commonName: 'Jojoba Oil', inciName: 'Simmondsia Chinensis Seed Oil', category: 'Carrier Oil', function: 'Emollient', supplier: 'Nordic Raw Materials', quantityOnHand: 620, unit: 'g', reorderLevel: 300, cost: 0.08, notes: 'Golden, cold pressed sample.' },
  { id: 'i2', commonName: 'Squalane', inciName: 'Squalane', category: 'Emollient', function: 'Slip & skin feel', supplier: 'Laboratory Supply Co.', quantityOnHand: 210, unit: 'g', reorderLevel: 250, cost: 0.14, notes: 'Olive-derived sample lot.' },
  { id: 'i3', commonName: 'Mango Butter', inciName: 'Mangifera Indica Seed Butter', category: 'Butter', function: 'Structure & conditioning', supplier: 'Nordic Raw Materials', quantityOnHand: 480, unit: 'g', reorderLevel: 200, cost: 0.06, notes: 'Refined, neutral odour.' },
  { id: 'i4', commonName: 'Beeswax', inciName: 'Cera Alba', category: 'Wax', function: 'Structure', supplier: 'Vestland Apiary', quantityOnHand: 160, unit: 'g', reorderLevel: 180, cost: 0.09, notes: 'Yellow pellets; assess odour impact.' },
  { id: 'i5', commonName: 'Vitamin E', inciName: 'Tocopherol', category: 'Antioxidant', function: 'Formula support', supplier: 'Laboratory Supply Co.', quantityOnHand: 74, unit: 'g', reorderLevel: 50, cost: 0.19, notes: 'Mixed tocopherols.' },
  { id: 'i6', commonName: 'Cedarwood Atlas Essential Oil', inciName: 'Cedrus Atlantica Bark Oil', category: 'Scent Material', function: 'Woody scent note', supplier: 'Atelier Botanica', quantityOnHand: 38, unit: 'g', reorderLevel: 20, cost: 0.42, notes: 'Dry pencil shaving character.' },
  { id: 'i7', commonName: 'Bergamot Calabrian Essential Oil', inciName: 'Citrus Aurantium Bergamia Peel Oil', category: 'Scent Material', function: 'Citrus scent note', supplier: 'Atelier Botanica', quantityOnHand: 15, unit: 'g', reorderLevel: 20, cost: 0.61, notes: 'Bright opening material for evaluation.' },
  { id: 'i8', commonName: 'Cardamom Essential Oil', inciName: 'Elettaria Cardamomum Seed Oil', category: 'Scent Material', function: 'Spiced scent note', supplier: 'Atelier Botanica', quantityOnHand: 9, unit: 'g', reorderLevel: 15, cost: 0.88, notes: 'Cool aromatic spice; signature candidate.' },
  { id: 'i9', commonName: 'Castor Oil', inciName: 'Ricinus Communis Seed Oil', category: 'Carrier Oil', function: 'Body & glide', supplier: 'Nordic Raw Materials', quantityOnHand: 310, unit: 'g', reorderLevel: 150, cost: 0.07, notes: 'Development sample; evaluate tack at different levels.' },
  { id: 'i10', commonName: 'Workshop No. 01 Blend', inciName: 'Parfum', category: 'Scent Blend', function: 'Development scent direction', supplier: 'Koalafrog Scent House', quantityOnHand: 28, unit: 'g', reorderLevel: 10, cost: 0.54, notes: 'Internal mock blend record for formula demonstrations.' },
]

export const batches: Batch[] = [
  { id: 'b1', batchNumber: 'KF-BO-260714-01', productId: 'p1', formulaVersion: 'v0.8', date: '2026-07-14', status: 'Observing', targetYield: 100, actualYield: 97.8, notes: 'Reduced heavy carrier phase; evaluate absorption.', observations: ['Initial feel is lighter', '24-hour observation due'] },
  { id: 'b2', batchNumber: 'KF-BB-260711-02', productId: 'p2', formulaVersion: 'v0.4', date: '2026-07-11', status: 'Observing', targetYield: 150, actualYield: 146.2, notes: 'Cooling curve trial B.', observations: ['Good surface after set', 'Monitor grain formation at day 7'] },
  { id: 'b3', batchNumber: 'KF-BO-260706-01', productId: 'p1', formulaVersion: 'v0.7', date: '2026-07-06', status: 'Complete', targetYield: 100, actualYield: 98.5, notes: 'Baseline wear study.', observations: ['Too persistent on hands', 'Scent balance promising'] },
  { id: 'b4', batchNumber: 'KF-BB-260716-01', productId: 'p2', formulaVersion: 'v0.5', date: '2026-07-16', status: 'Planned', targetYield: 150, notes: 'Prepare alternate butter ratio.', observations: [] },
]

export const scentProfiles: ScentProfile[] = [
  { id: 's1', name: 'Signature DNA', direction: 'Mineral workshop after rain', notes: ['Leather', 'Warm woods', 'Amber', 'Cardamom', 'Smoke', 'Mineral'], maturity: 42 },
  { id: 's2', name: 'Workshop No. 01', direction: 'Polished timber, cool spice, soft smoke', notes: ['Cedar', 'Cardamom', 'Amber', 'Black tea'], maturity: 68 },
  { id: 's3', name: 'Warm Woods Study', direction: 'A quiet, skin-close wood accord', notes: ['Cedar', 'Sandalwood', 'Resin', 'Dry vanilla'], maturity: 31 },
]
export const scentMaterials: ScentMaterial[] = [
  { id: 'sm1', name: 'Cedarwood Atlas', family: 'Wood', character: 'Dry · structural · pencil shavings' },
  { id: 'sm2', name: 'Cardamom', family: 'Spice', character: 'Cool · green · aromatic' },
  { id: 'sm3', name: 'Labdanum study', family: 'Amber', character: 'Resinous · leathery · warm' },
  { id: 'sm4', name: 'Mineral air study', family: 'Abstract', character: 'Cool · stony · diffusive' },
]
export const accords: Accord[] = [
  { id: 'a1', name: 'Worn Workbench', materials: ['Cedarwood', 'Leather study', 'Amber'], status: 'Iteration 04' },
  { id: 'a2', name: 'Cold Spark', materials: ['Cardamom', 'Bergamot', 'Mineral study'], status: 'Iteration 02' },
]

export const activities: Activity[] = [
  { id: 'a1', title: 'Batch KF-BO-260714-01 recorded', detail: 'Signature Beard Oil · v0.8', timestamp: 'Today, 10:42', type: 'Lab' },
  { id: 'a2', title: 'Signature DNA notes refined', detail: 'Smoke moved behind mineral accord', timestamp: 'Yesterday', type: 'Scent' },
  { id: 'a3', title: 'Supplier sample logged', detail: 'Mango butter · lot MB-0626', timestamp: '12 Jul', type: 'Ingredient' },
  { id: 'a4', title: 'Formula v0.4 promoted', detail: 'Beard Butter', timestamp: '11 Jul', type: 'Formula' },
]
export const testingActivities: TestingActivity[] = [
  { id: 't1', title: '24-hour observation', product: 'Signature Beard Oil · KF-BO-260714-01', date: '15 Jul', type: 'Batch review' },
  { id: 't2', title: 'Day 7 texture review', product: 'Beard Butter · KF-BB-260711-02', date: '18 Jul', type: 'Stability' },
  { id: 't3', title: 'Wear journal checkpoint', product: 'Signature Beard Oil · v0.8', date: '21 Jul', type: 'User trial' },
]

export const placeholderModules: ModuleDefinition[] = [
  { path: 'inventory', name: 'Inventory', eyebrow: 'Materials & finished goods', description: 'Track stock movements, lots, locations and expiry awareness across the workshop.', capabilities: ['Lot-level stock', 'Movement history', 'Reorder planning'] },
  { path: 'production', name: 'Production', eyebrow: 'Repeatable making', description: 'Turn validated formulas into controlled, documented production runs.', capabilities: ['Production orders', 'Run sheets', 'Yield and deviation records'] },
  { path: 'testing', name: 'Testing', eyebrow: 'Evidence over instinct', description: 'Plan and record stability, wear, packaging and validation activities.', capabilities: ['Test protocols', 'Scheduled observations', 'Comparable results'] },
  { path: 'suppliers', name: 'Suppliers', eyebrow: 'Source intelligence', description: 'Keep contacts, samples, quotes and material relationships in one considered record.', capabilities: ['Supplier profiles', 'Quotes and lead times', 'Sample history'] },
  { path: 'equipment', name: 'Equipment', eyebrow: 'Workshop readiness', description: 'Catalogue tools, calibration needs, maintenance and working procedures.', capabilities: ['Equipment register', 'Maintenance log', 'Calibration reminders'] },
  { path: 'costing', name: 'Costing', eyebrow: 'Commercial reality', description: 'Understand material, packaging and production cost as products evolve.', capabilities: ['Formula cost rollups', 'Packaging scenarios', 'Margin modelling'] },
  { path: 'compliance', name: 'Compliance', eyebrow: 'Structured readiness', description: 'Organise product documentation and future market-readiness workflows.', capabilities: ['Document checklists', 'Market requirements', 'Review milestones'] },
  { path: 'packaging', name: 'Packaging', eyebrow: 'Object & experience', description: 'Develop vessels, components, labels and pack specifications alongside the formula.', capabilities: ['Component library', 'Compatibility trials', 'Artwork versions'] },
  { path: 'launch', name: 'Launch', eyebrow: 'From workshop to world', description: 'Coordinate dependencies, decisions and launch readiness without losing the product story.', capabilities: ['Readiness gates', 'Critical dates', 'Launch assets'] },
  { path: 'knowledge', name: 'Knowledge', eyebrow: 'Koalafrog memory', description: 'A durable home for research, methods, decisions and hard-won workshop knowledge.', capabilities: ['Linked notes', 'Methods library', 'Decision records'] },
]
