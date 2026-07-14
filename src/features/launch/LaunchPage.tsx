import { Rocket } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { StatusPill } from '../../components/ui/StatusPill'
import { useFormulaData } from '../formulas/state/FormulaDataContext'
import { launchComplianceBlockers } from './domain/launchLogic'
export function LaunchPage(){const d=useFormulaData();return <><PageHeader eyebrow="Internal release preparation" title="Launch Readiness" description="Operational plans connected to recorded compliance blockers. Launched never implies regulatory approval or legal sale readiness."/><div className="compliance-notice"><Rocket/><div><strong>Internal project state only</strong><p>Compliance evidence, Finished Goods inventory, and commercial launch tasks remain separate domains.</p></div></div><section className="panel"><SectionHeader title="Launch Plans" detail="Compliance-derived blockers and commercial work remain visually distinct"/><div className="launch-list">{d.launchPlans.map(plan=>{const blockers=launchComplianceBlockers(d.readinessIssues.filter(i=>i.complianceDossierId===plan.complianceDossierId));return <Link to={`/launch/${plan.id}`} key={plan.id}><div><span className="eyebrow">{plan.targetMarket} · {plan.targetLaunchDate}</span><h3>{d.products.find(p=>p.id===plan.productId)?.name}</h3><p>{plan.notes}</p></div><StatusPill tone={blockers.length?'red':'amber'}>{plan.status}</StatusPill><strong>{blockers.length} compliance blockers</strong></Link>})}</div></section></>}
