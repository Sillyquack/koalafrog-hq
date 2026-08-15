export type FootCareBenchmarkKind='daily_dry_foot_care'|'sweat_control'|'foot_shoe_deodorizer'
export type FootCareEvidenceState='verified_current_local_source'|'verified_current_brand_source'|'source_conflict_requires_pack_label'

export interface FootCareBenchmarkIngredient {
  inci:string
  functions:string[]
  sourcingPriority:'core'|'supporting'|'fragrance_or_allergen'|'compliance_review'
  notes?:string
}

export interface FootCareBenchmark {
  id:string
  brand:'GEHWOL'
  productName:string
  packSize:string
  kind:FootCareBenchmarkKind
  role:string
  evidenceState:FootCareEvidenceState
  sourceUrl:string
  alternateSourceUrl?:string
  sourceNote:string
  ingredients:FootCareBenchmarkIngredient[]
  developmentLearnings:string[]
  claimGuardrails:string[]
}

const fragrance=(inci:string):FootCareBenchmarkIngredient=>({inci,functions:['fragrance / sensory'],sourcingPriority:'fragrance_or_allergen'})

export const footCareBenchmarks:readonly FootCareBenchmark[]=[
  {
    id:'gehwol-fusskraft-blue-no-2026-08',
    brand:'GEHWOL',
    productName:'Fusskraft Blue',
    packSize:'75 ml',
    kind:'daily_dry_foot_care',
    role:'Norway-market benchmark for everyday care of dry and rough feet, moisturisation, emollience and cooling sensory feel.',
    evidenceState:'verified_current_local_source',
    sourceUrl:'https://www.gehwol.no/produkter/gehwol-fusskraft-blue/',
    sourceNote:'Current Norwegian GEHWOL listing used as the benchmark source. Older international retailer listings show historical variants; the physical pack label remains the strongest evidence if a conflict appears.',
    ingredients:[
      {inci:'Aqua (Water)',functions:['aqueous carrier'],sourcingPriority:'supporting'},
      {inci:'Glycol Stearate SE',functions:['emulsifying / structuring system'],sourcingPriority:'core'},
      {inci:'Isopropyl Palmitate',functions:['emollient','spreadability'],sourcingPriority:'core'},
      {inci:'Lanolin',functions:['emollient','occlusive / barrier support'],sourcingPriority:'core',notes:'Research vegan barrier-system alternatives in parallel rather than assuming lanolin is required.'},
      {inci:'Glycerin',functions:['humectant'],sourcingPriority:'core'},
      {inci:'Methylpropanediol',functions:['humectant / solvent'],sourcingPriority:'supporting'},
      {inci:'Urea',functions:['humectant','dry-skin care'],sourcingPriority:'core'},
      {inci:'Aloe Barbadensis Leaf Juice Powder',functions:['skin conditioning'],sourcingPriority:'core'},
      fragrance('Rosmarinus Officinalis (Rosemary) Leaf Oil'),
      fragrance('Pinus Mugo (Pine) Leaf Oil'),
      fragrance('Lavandula Angustifolia (Lavender) Oil'),
      fragrance('Lavandula Hybrida (Lavandin) Oil'),
      {inci:'Camphor',functions:['cooling / sensory'],sourcingPriority:'supporting'},
      {inci:'Menthol',functions:['cooling / sensory'],sourcingPriority:'core'},
      fragrance('Eucalyptus Globulus (Eucalyptus) Leaf Oil'),
      fragrance('Parfum (Fragrance)'),
      {inci:'Caprylyl Glycol',functions:['preservative support','humectant / emollient'],sourcingPriority:'core'},
      {inci:'Phenylpropanol',functions:['preservative support'],sourcingPriority:'core'},
      fragrance('Geraniol'),fragrance('Limonene'),fragrance('Linalool'),
    ],
    developmentLearnings:['Build a daily emulsion around humectancy + emollience + barrier feel rather than copying the benchmark composition.','Treat urea, glycerin, emollient choice, barrier system, preservation and sensory cooling as separate design decisions.','Aqueous emulsion capability requires preservation, stability and microbiological controls before Formula workflow is called operational.'],
    claimGuardrails:['Use cosmetic dry/rough-skin care and moisturisation intents only until evidence supports final claims.']
  },
  {
    id:'gehwol-med-antiperspirant-eu-2026-08',
    brand:'GEHWOL',
    productName:'GEHWOL med Antiperspirant',
    packSize:'125 ml',
    kind:'sweat_control',
    role:'Benchmark for foot-perspiration control with skin-conditioning support.',
    evidenceState:'source_conflict_requires_pack_label',
    sourceUrl:'https://www.gehwol.de/produkte/gehwol-med-antitranspirant/',
    alternateSourceUrl:'https://www.gehwolfootcare.com/product/gehwol-med-antiperspirant-lotion/',
    sourceNote:'Current German/EU brand page and English brand page expose materially different INCI lists. Store this as a source-version conflict and verify the exact Norway-delivered 125 ml pack label before treating either list as the physical-product truth.',
    ingredients:[
      {inci:'Aqua (Water)',functions:['aqueous carrier'],sourcingPriority:'supporting'},
      {inci:'Aluminum Chlorohydrate',functions:['antiperspirant active'],sourcingPriority:'core'},
      {inci:'Cetyl Alcohol',functions:['emollient','emulsion structure'],sourcingPriority:'core'},
      {inci:'Distearoylethyl Dimonium Chloride',functions:['conditioning / cationic structural support'],sourcingPriority:'core'},
      {inci:'Cetearyl Alcohol',functions:['emollient','emulsion structure'],sourcingPriority:'core'},
      {inci:'Panthenol',functions:['skin conditioning','humectant support'],sourcingPriority:'core'},
      {inci:'Phenoxyethanol',functions:['preservative'],sourcingPriority:'core'},
      {inci:'Citric Acid',functions:['pH adjustment'],sourcingPriority:'supporting'},
      fragrance('Parfum (Fragrance)'),{inci:'Camphor',functions:['sensory'],sourcingPriority:'supporting'},fragrance('Coumarin'),fragrance('Lavandula Oil/Extract'),fragrance('Linalool'),fragrance('Linalyl Acetate'),{inci:'Menthol',functions:['cooling / sensory'],sourcingPriority:'core'},fragrance('Pogostemon Cablin Oil'),fragrance('Tetramethyl Acetyloctahydronaphthalenes'),
    ],
    developmentLearnings:['Separate sweat reduction from odour control; they are different performance jobs.','Evaluate aluminum chlorohydrate deliberately instead of assuming an aluminum-free position.','Conditioning and emulsion architecture matter because antiperspirant efficacy alone is not the complete user experience.'],
    claimGuardrails:['Exact benchmark INCI is unresolved until physical-pack verification.','Antiperspirant claims require compliant substantiation and final-formula review.']
  },
  {
    id:'gehwol-foot-shoe-deo-eu-2026-08',
    brand:'GEHWOL',
    productName:'Foot + Shoe Deodorant',
    packSize:'150 ml',
    kind:'foot_shoe_deodorizer',
    role:'Benchmark for odour control across both feet and footwear.',
    evidenceState:'verified_current_brand_source',
    sourceUrl:'https://www.gehwol.de/produkte/gehwol-fuss-und-schuh-deo/',
    sourceNote:'Current GEHWOL brand listing. Aerosol propellants and antimicrobial benchmark ingredients are recorded as architecture/compliance observations, not automatic Koalafrog sourcing decisions.',
    ingredients:[
      {inci:'Alcohol denat.',functions:['carrier / solvent'],sourcingPriority:'core'},
      {inci:'Butane',functions:['aerosol propellant'],sourcingPriority:'compliance_review'},
      {inci:'Propane',functions:['aerosol propellant'],sourcingPriority:'compliance_review'},
      {inci:'Zinc Ricinoleate',functions:['odour-control active / odour binding'],sourcingPriority:'core'},
      fragrance('Parfum (Fragrance)'),
      {inci:'Triethanolamine',functions:['neutralisation / pH / solubilisation support'],sourcingPriority:'core'},
      {inci:'Propylene Glycol',functions:['solvent / humectant'],sourcingPriority:'core'},
      fragrance('Tetramethyl Acetyloctahydronaphthalenes'),
      {inci:'Ethylhexylglycerin',functions:['deodorant / preservative support'],sourcingPriority:'core'},
      {inci:'Dipropylene Glycol',functions:['solvent'],sourcingPriority:'supporting'},
      fragrance('Hexyl Cinnamal'),fragrance('Acetyl Cedrene'),fragrance('Limonene'),
      {inci:'Rosin',functions:['film / formulation support'],sourcingPriority:'supporting'},
      fragrance('Citrus Aurantium Peel Oil'),
      {inci:'Lactic Acid',functions:['pH adjustment'],sourcingPriority:'supporting'},
      fragrance('Lavandula Oil/Extract'),
      {inci:'Octenidine HCl',functions:['antimicrobial benchmark component'],sourcingPriority:'compliance_review',notes:'Do not adopt or make antimicrobial/antifungal claims without explicit regulatory review.'},
      fragrance('Citrus Limon Peel Oil'),fragrance('Pogostemon Cablin Oil'),fragrance('Alpha-Isomethyl Ionone'),fragrance('Citronellol'),fragrance('Linalool'),fragrance('Linalyl Acetate'),fragrance('Pelargonium Graveolens Flower Oil'),fragrance('Pinene'),
      {inci:'Camphor',functions:['sensory'],sourcingPriority:'supporting'},
      {inci:'Glyceryl Stearate',functions:['formulation / emulsion support'],sourcingPriority:'supporting'},
      {inci:'Citric Acid',functions:['pH adjustment'],sourcingPriority:'supporting'},
      {inci:'Ascorbyl Palmitate',functions:['antioxidant'],sourcingPriority:'supporting'},
      {inci:'BHT',functions:['antioxidant'],sourcingPriority:'supporting'},
    ],
    developmentLearnings:['Zinc ricinoleate is the first raw-material sourcing target to investigate for odour control.','Research a non-aerosol pump architecture in parallel; aerosol propellants introduce separate packaging, handling and compliance complexity.','Do not conflate odour control with antimicrobial or antifungal claims.'],
    claimGuardrails:['Do not copy benchmark foot-fungus or antimicrobial claims into Koalafrog without regulatory classification and evidence review.','Aerosol architecture is a separate packaging/production decision.']
  }
] as const

export const footCareCoreSourcingTargets=[
 'Urea','Glycerin','Lanolin or vegan barrier-system alternative','Isopropyl Palmitate or lower-grease emollient alternative','Cosmetic O/W emulsifier system','Aloe Vera powder','Menthol','Aluminum Chlorohydrate','Panthenol','Zinc Ricinoleate','Zinc Ricinoleate solubilisation/neutralisation system','Preservation system suitable for foot-care emulsions'
] as const
