import type { Accord, Activity, Batch, Ingredient, ModuleDefinition, Product, ScentMaterial, ScentProfile, TestingActivity } from '../types/domain'

export const products: Product[] = [
  { id: 'p1', name: 'Signature Beard Oil', category: 'Beard Care', status: 'Active', developmentStage: 'Testing', description: 'A dry-touch daily oil balancing glide, absorption and a quiet signature scent.', currentDevelopmentFormulaVersionId: 'fv-bo-02', currentApprovedFormulaVersionId:'fv-bo-02', scentProfile: 'Workshop No. 01', targetLaunchDate: '2026-11-15', createdAt: '2026-03-02', updatedAt: '2026-07-14' },
  { id: 'p2', name: 'Beard Butter', category: 'Beard Care', status: 'Active', developmentStage: 'Formulation', description: 'A soft, non-waxy conditioning butter with controlled melt and a refined finish.', currentDevelopmentFormulaVersionId: 'fv-bb-01', scentProfile: 'Warm Woods Study', targetLaunchDate: '2027-02-01', createdAt: '2026-04-18', updatedAt: '2026-07-12' },
  { id: 'p3', name: 'Beard Balm', category: 'Beard Care', status: 'Active', developmentStage: 'Research', description: 'Medium-control shaping balm designed for restyling without a heavy residue.', scentProfile: 'Unassigned', targetLaunchDate: '2027-04-20', createdAt: '2026-05-04', updatedAt: '2026-07-08' },
  { id: 'p4', name: 'Koalafrog Signature Fragrance', category: 'Fragrance', status: 'Active', developmentStage: 'Research', description: 'The olfactive cornerstone: mineral air, worn leather, warm timber and amber.', scentProfile: 'Signature DNA', targetLaunchDate: '2027-09-01', createdAt: '2026-02-12', updatedAt: '2026-07-13' },
  { id: 'p5', name: 'Daily Deodorant', category: 'Body Care', status: 'On hold', developmentStage: 'Idea', description: 'A dependable daily format explored through texture, wear and packaging studies.', scentProfile: 'Open brief', targetLaunchDate: '2028-03-01', createdAt: '2026-06-21', updatedAt: '2026-06-21' },
]

export const ingredients: Ingredient[] = [
  { id: 'i1', commonName: 'Jojoba Oil', inciName: 'Simmondsia Chinensis Seed Oil', category: 'Carrier Oil', functions: ['Emollient'], description: 'Golden carrier oil used in beard-care development.', defaultUnit: 'g', reorderThreshold: 300, notes: 'Cold pressed sample direction.', status: 'Active', createdAt: '2026-03-01', updatedAt: '2026-07-14' },
  { id: 'i2', commonName: 'Squalane', inciName: 'Squalane', category: 'Emollient', functions: ['Emollient'], description: 'Light emollient used to tune slip and finish.', defaultUnit: 'g', reorderThreshold: 250, notes: 'Olive-derived sample.', status: 'Active', createdAt: '2026-03-01', updatedAt: '2026-07-10' },
  { id: 'i3', commonName: 'Mango Butter', inciName: 'Mangifera Indica Seed Butter', category: 'Butter', functions: ['Emollient', 'Structuring Agent'], description: 'Solid butter explored for conditioning formats.', defaultUnit: 'g', reorderThreshold: 200, notes: 'Refined, neutral odour.', status: 'Active', createdAt: '2026-04-01', updatedAt: '2026-07-12' },
  { id: 'i4', commonName: 'Beeswax', inciName: 'Cera Alba', category: 'Wax', functions: ['Occlusive', 'Structuring Agent'], description: 'Wax used in balm structure studies.', defaultUnit: 'g', reorderThreshold: 180, notes: 'Yellow pellets; assess odour impact.', status: 'Active', createdAt: '2026-04-01', updatedAt: '2026-07-10' },
  { id: 'i5', commonName: 'Vitamin E', inciName: 'Tocopherol', category: 'Antioxidant', functions: ['Antioxidant'], description: 'Mixed tocopherol development material.', defaultUnit: 'g', reorderThreshold: 50, notes: 'Working material record.', status: 'Active', createdAt: '2026-03-05', updatedAt: '2026-07-11' },
  { id: 'i6', commonName: 'Cedarwood Atlas Essential Oil', inciName: 'Cedrus Atlantica Bark Oil', category: 'Scent Material', functions: ['Fragrance Material', 'Essential Oil'], description: 'Dry woody scent material for olfactive studies.', defaultUnit: 'ml', reorderThreshold: 20, notes: 'Dry pencil-shaving character.', status: 'Active', createdAt: '2026-03-09', updatedAt: '2026-07-13' },
  { id: 'i7', commonName: 'Bergamot Calabrian Essential Oil', inciName: 'Citrus Aurantium Bergamia Peel Oil', category: 'Scent Material', functions: ['Fragrance Material', 'Essential Oil'], description: 'Bright citrus scent material for evaluation.', defaultUnit: 'ml', reorderThreshold: 20, notes: 'Opening-note study material.', status: 'Research', createdAt: '2026-05-01', updatedAt: '2026-07-13' },
  { id: 'i8', commonName: 'Cardamom Essential Oil', inciName: 'Elettaria Cardamomum Seed Oil', category: 'Scent Material', functions: ['Fragrance Material', 'Essential Oil'], description: 'Cool aromatic spice material.', defaultUnit: 'ml', reorderThreshold: 15, notes: 'Signature candidate.', status: 'Research', createdAt: '2026-05-01', updatedAt: '2026-07-13' },
  { id: 'i9', commonName: 'Castor Oil', inciName: 'Ricinus Communis Seed Oil', category: 'Carrier Oil', functions: ['Emollient'], description: 'Viscous carrier oil for body and glide studies.', defaultUnit: 'g', reorderThreshold: 150, notes: 'Evaluate tack at different levels.', status: 'Active', createdAt: '2026-06-01', updatedAt: '2026-07-12' },
  { id: 'i10', commonName: 'Workshop No. 01 Blend', inciName: 'Parfum', category: 'Scent Blend', functions: ['Fragrance Material'], description: 'Internal development scent blend record.', defaultUnit: 'g', reorderThreshold: 10, notes: 'Mock blend for formula demonstrations.', status: 'Research', createdAt: '2026-06-10', updatedAt: '2026-07-14' },
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
  { path: 'suppliers', name: 'Suppliers', eyebrow: 'Source intelligence', description: 'Keep contacts, samples, quotes and material relationships in one considered record.', capabilities: ['Supplier profiles', 'Quotes and lead times', 'Sample history'] },
  { path: 'equipment', name: 'Equipment', eyebrow: 'Workshop readiness', description: 'Catalogue tools, calibration needs, maintenance and working procedures.', capabilities: ['Equipment register', 'Maintenance log', 'Calibration reminders'] },
  { path: 'compliance', name: 'Compliance', eyebrow: 'Structured readiness', description: 'Organise product documentation and future market-readiness workflows.', capabilities: ['Document checklists', 'Market requirements', 'Review milestones'] },
  { path: 'packaging', name: 'Packaging', eyebrow: 'Object & experience', description: 'Develop vessels, components, labels and pack specifications alongside the formula.', capabilities: ['Component library', 'Compatibility trials', 'Artwork versions'] },
  { path: 'launch', name: 'Launch', eyebrow: 'From workshop to world', description: 'Coordinate dependencies, decisions and launch readiness without losing the product story.', capabilities: ['Readiness gates', 'Critical dates', 'Launch assets'] },
  { path: 'knowledge', name: 'Knowledge', eyebrow: 'Koalafrog memory', description: 'A durable home for research, methods, decisions and hard-won workshop knowledge.', capabilities: ['Linked notes', 'Methods library', 'Decision records'] },
]
