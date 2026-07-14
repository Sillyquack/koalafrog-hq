import { useMemo, useState } from 'react'
import { ArrowRight, Filter, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatusPill } from '../../components/ui/StatusPill'
import { formatDate } from '../../utils/format'
import { useFormulaData } from './state/FormulaDataContext'

export function FormulaLibraryPage() {
  const { formulas, formulaVersions, products } = useFormulaData(); const [productId, setProductId] = useState('All'); const [status, setStatus] = useState('All')
  const rows = useMemo(() => formulas.map((formula) => { const versions = formulaVersions.filter((v) => v.formulaId === formula.id).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)); return { formula, versions, latest: versions[0], product: products.find((p) => p.id === formula.productId) } }).filter((row) => (productId === 'All' || row.formula.productId === productId) && (status === 'All' || row.latest?.status === status)), [formulas, formulaVersions, products, productId, status])
  return <><PageHeader eyebrow="Versioned formulation / Library" title="Formulas" description="Controlled formula directions and immutable development history across the portfolio." action={<button className="button primary"><Plus size={16} />New formula</button>} />
    <div className="filter-bar"><Filter size={15} /><label>Product<select value={productId} onChange={(e) => setProductId(e.target.value)}><option>All</option>{products.map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label><label>Latest status<select value={status} onChange={(e) => setStatus(e.target.value)}>{['All','Draft','Candidate','Approved','Retired'].map((value) => <option key={value}>{value}</option>)}</select></label><span>{rows.length} formulas</span></div>
    <div className="formula-library">{rows.map(({ formula, versions, latest, product }) => <Link to={`/formulas/${formula.id}`} key={formula.id}><div className="formula-seal">{latest?.version ?? '—'}</div><div><span className="eyebrow">{product?.name}</span><h2>{formula.name}</h2><p>{formula.description}</p></div><dl><div><dt>Latest version</dt><dd>{latest?.version}</dd></div><div><dt>Status</dt><dd><StatusPill tone={latest?.status === 'Draft' ? 'amber' : latest?.status === 'Approved' ? 'green' : 'blue'}>{latest?.status}</StatusPill></dd></div><div><dt>History</dt><dd>{versions.length} versions</dd></div><div><dt>Updated</dt><dd>{formatDate(formula.updatedAt.slice(0,10))}</dd></div></dl><ArrowRight size={19} /></Link>)}</div></>
}
