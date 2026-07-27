import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, LockKeyhole, ShoppingBasket } from 'lucide-react'
import { PageHeader } from '../../../components/ui/PageHeader'
import { useFormulaData } from '../../formulas/state/FormulaDataContext'
import { calculateInventoryGap, formulaReadiness, generateRequirements, REQUIRED_PRODUCTION_CATEGORIES, type ProductionCategory, type RoundProductBasis } from './domain/productionReadiness'

const labels: Record<ProductionCategory, string> = { beard_oil: 'Beard Oil', beard_butter: 'Beard Butter', beard_balm: 'Beard Balm', deodorant: 'Deodorant' }
const categoryMatches = (category: ProductionCategory, value: string) => {
  const normalized = value.toLowerCase().replace(/[^a-z]+/g, ' ')
  return category === 'deodorant' ? normalized.includes('deodorant') : normalized.includes(category.replace('_', ' '))
}

export function ProductionReadinessPage() {
  const data = useFormulaData()
  const [selectedVersions, setSelectedVersions] = useState<Record<string, string>>({})
  const [batchSizes, setBatchSizes] = useState<Record<string, number>>({})
  const [overages, setOverages] = useState<Record<string, number>>({})
  const [generated, setGenerated] = useState(false)
  const bases = useMemo(() => REQUIRED_PRODUCTION_CATEGORIES.map(category => {
    const product = data.products.find(item => categoryMatches(category, `${item.name} ${item.category}`))
    const formulas = product ? data.formulas.filter(item => item.productId === product.id) : []
    const versions = data.formulaVersions.filter(item => formulas.some(formula => formula.id === item.formulaId))
    const preferredId = selectedVersions[category] || product?.currentApprovedFormulaVersionId || product?.currentDevelopmentFormulaVersionId
    const formulaVersion = versions.find(item => item.id === preferredId) ?? versions.find(item => item.status === 'Approved') ?? versions[0]
    return { category, product, formulas, versions, formulaVersion }
  }), [data.products, data.formulas, data.formulaVersions, selectedVersions])
  const roundBases: RoundProductBasis[] = bases.filter(item => item.product).map(item => ({
    product: item.product!,
    category: item.category,
    formulaVersion: item.formulaVersion,
    formulaLines: data.formulaLines.filter(line => line.formulaVersionId === item.formulaVersion?.id),
    ingredients: data.ingredients,
    batchCount: 1,
    batchSize: batchSizes[item.category] ?? 100,
    batchUnit: 'g',
    overagePercent: overages[item.category] ?? 5,
    deodorantStructure: item.category === 'deodorant' ? (item.formulaVersion?.phaseDefinitions?.length ? 'other' : undefined) : undefined,
  }))
  const missingProducts = bases.filter(item => !item.product)
  const calculation = generateRequirements(roundBases)
  const requirements = generated ? calculation.requirements : []
  const gaps = requirements.map(requirement => ({ requirement, gap: calculateInventoryGap({ requirement, lots: data.inventoryLots, movements: data.inventoryMovements }) }))
  const readiness = roundBases.map(basis => ({ basis, result: formulaReadiness(basis) }))
  const blocked = missingProducts.length + readiness.filter(item => item.result.state === 'blocked').length

  return <div className="production-readiness">
    <PageHeader eyebrow="Procurement / first production round" title="Production readiness" description="Bind exact formula versions to a reproducible raw-material plan. Planning and approval never place orders or create stock." />
    <div className="operational-notice"><LockKeyhole /><p>Four products are mandatory · formula identity is exact · mass and volume never convert silently · ordering remains manual.</p></div>
    <section className="readiness-summary" aria-label="Round summary">
      <article><strong>4</strong><span>Products in scope</span></article>
      <article><strong>{readiness.filter(item => item.result.state !== 'blocked').length}/4</strong><span>Formula basis available</span></article>
      <article><strong>{requirements.length || '—'}</strong><span>Ingredients required</span></article>
      <article><strong>{blocked}</strong><span>Blocking products</span></article>
      <article><strong>{generated ? gaps.filter(item => item.gap.purchasingGap > 0).length : '—'}</strong><span>Purchasing gaps</span></article>
    </section>

    <section aria-labelledby="scope-title">
      <header className="section-header"><div><span className="eyebrow">Stage 1–2</span><h2 id="scope-title">Scope and formula readiness</h2></div></header>
      <div className="readiness-products">
        {bases.map(item => {
          if (!item.product) return <article className="panel readiness-product blocked" key={item.category}><AlertTriangle /><span className="eyebrow">{labels[item.category]}</span><h3>Product missing</h3><p>Create or identify the {labels[item.category]} Product before procurement can continue.</p></article>
          const basis = roundBases.find(entry => entry.category === item.category)!
          const result = formulaReadiness(basis)
          return <article className={`panel readiness-product ${result.state}`} key={item.category}>
            {result.state === 'ready' ? <CheckCircle2 /> : <AlertTriangle />}
            <span className="eyebrow">{labels[item.category]} · mandatory</span><h3>{item.product.name}</h3>
            <label>Formula version<select value={item.formulaVersion?.id ?? ''} onChange={event => { setSelectedVersions(current => ({ ...current, [item.category]: event.target.value })); setGenerated(false) }}><option value="">Select version</option>{item.versions.map(version => <option key={version.id} value={version.id}>{version.version} · {version.status}</option>)}</select></label>
            <div className="readiness-batch"><label>Batch size (g)<input type="number" min="0.001" value={batchSizes[item.category] ?? 100} onChange={event => { setBatchSizes(current => ({ ...current, [item.category]: Number(event.target.value) })); setGenerated(false) }} /></label><label>Overage %<input type="number" min="0" value={overages[item.category] ?? 5} onChange={event => { setOverages(current => ({ ...current, [item.category]: Number(event.target.value) })); setGenerated(false) }} /></label></div>
            <strong className="readiness-state">{result.state.replace('_', ' ')}</strong>
            {result.reasons.length ? <ul>{result.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul> : <p>Composition reconciles and scales deterministically from this immutable basis.</p>}
          </article>
        })}
      </div>
      <button className="button primary" disabled={blocked > 0} onClick={() => setGenerated(true)}><ShoppingBasket size={15} />Generate requirements</button>
      {blocked > 0 && <p className="form-message" role="alert">Requirement generation is blocked by {blocked} product {blocked === 1 ? 'basis' : 'bases'}. Resolve the explicit reasons above; no assumptions will be invented.</p>}
    </section>

    {generated && <section aria-labelledby="requirements-title">
      <header className="section-header"><div><span className="eyebrow">Stage 3–4</span><h2 id="requirements-title">Consolidated requirements and inventory gap</h2></div></header>
      <div className="readiness-requirements">
        {gaps.map(({ requirement, gap }) => <article className="panel" key={`${requirement.ingredientId}:${requirement.unit}`}>
          <div><span className="eyebrow">{requirement.sources.length} formula contributions</span><h3>{requirement.ingredientName}</h3><p>{requirement.sources.map(source => `${source.productName} ${source.totalQuantity} ${source.unit}`).join(' · ')}</p></div>
          <dl><div><dt>Required</dt><dd>{gap.required} {gap.unit}</dd></div><div><dt>Usable stock</dt><dd>{gap.usableAvailable} {gap.unit}</dd></div><div><dt>Quarantined / expired</dt><dd>{gap.quarantined + gap.expired} {gap.unit}</dd></div><div><dt>Purchase gap</dt><dd>{gap.purchasingGap} {gap.unit}</dd></div></dl>
        </article>)}
        {!gaps.length && <article className="panel"><h3>No requirements generated</h3><p>The selected formulas contain no purchasable ingredient requirements.</p></article>}
      </div>
      <p className="readiness-boundary"><strong>Next gate:</strong> each non-zero gap needs an explicitly accepted Supplier Product, integer package selection, documented commercial assumptions, and a complete basket before approval. Unknown shipping, tax, duty, documentation, stock, or freshness remains unresolved.</p>
    </section>}
  </div>
}
