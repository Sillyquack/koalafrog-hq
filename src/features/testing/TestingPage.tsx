import { useState } from 'react'
import { Plus, UserPlus } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { StatusPill } from '../../components/ui/StatusPill'
import { useFormulaData } from '../formulas/state/FormulaDataContext'
import { aggregateNumericResults } from '../lab/domain/labLogic'
import { TestResponseForm } from './components/TestResponseForm'
import { TestSessionForm } from './components/TestSessionForm'
import { TesterForm } from './components/TesterForm'
import { TestTemplateForm } from './components/TestTemplateForm'

export function TestingPage(){
  const data=useFormulaData(); const [sessionForm,setSessionForm]=useState(false); const [testerForm,setTesterForm]=useState(false); const [templateForm,setTemplateForm]=useState(false); const [responseFor,setResponseFor]=useState<string>(); const [status,setStatus]=useState('All')
  const sessions=data.testSessions.filter(session=>status==='All'||session.status===status)
  return <><PageHeader eyebrow="Development testing / Batch-linked feedback" title="Testing" description="Structured internal evaluation tied to the physical Lab Batch that was actually tested." action={<div className="action-row"><button className="button ghost" onClick={()=>setTesterForm(true)}><UserPlus size={15}/>Add Tester</button><button className="button ghost" onClick={()=>setTemplateForm(true)}><Plus size={15}/>Create Template</button><button className="button primary" onClick={()=>setSessionForm(true)}><Plus size={15}/>Create Test Session</button></div>}/>
    <div className="testing-metrics"><div><span>Active sessions</span><strong>{data.testSessions.filter(session=>session.status==='Active').length}</strong></div><div><span>Submitted responses</span><strong>{data.testResponses.length}</strong></div><div><span>Active testers</span><strong>{data.testers.filter(tester=>tester.status==='Active').length}</strong></div><div><span>Reusable templates</span><strong>{data.testTemplates.length}</strong></div></div>
    <div className="filter-bar"><label>Status<select value={status} onChange={event=>setStatus(event.target.value)}>{['All','Planned','Active','Completed','Archived'].map(value=><option key={value}>{value}</option>)}</select></label></div>
    <div className="testing-grid"><section className="panel test-sessions"><SectionHeader title="Test sessions" detail="Internal evaluation—not scientific validation"/>{sessions.map(session=>{const batch=data.labBatches.find(item=>item.id===session.labBatchId);const template=data.testTemplates.find(item=>item.id===session.testTemplateId);const responses=data.testResponses.filter(response=>response.testSessionId===session.id);return <article key={session.id}><div><span className="eyebrow">{batch?.batchNumber}</span><h3>{session.name}</h3><p>{template?.name} · Due {session.dueDate??'not scheduled'}</p></div><StatusPill tone={session.status==='Completed'?'green':'blue'}>{session.status}</StatusPill><strong>{responses.length} response{responses.length===1?'':'s'}</strong><button className="text-button" onClick={()=>setResponseFor(session.id)}>Add response</button></article>})}</section>
      <aside className="panel result-summary"><SectionHeader title="Recent results" detail="Simple descriptive summaries"/>{sessions.flatMap(session=>{const template=data.testTemplates.find(item=>item.id===session.testTemplateId);const responses=data.testResponses.filter(response=>response.testSessionId===session.id);return template?aggregateNumericResults(template.questions,responses):[]}).slice(0,6).map((result,index)=><div key={`${result.questionId}-${index}`}><span>{result.prompt}</span><strong>{result.average??'—'}<small> / 5</small></strong><p>{result.count} response{result.count===1?'':'s'}</p></div>)}</aside></div>
    {sessionForm&&<TestSessionForm onClose={()=>setSessionForm(false)}/>} {testerForm&&<TesterForm onClose={()=>setTesterForm(false)}/>} {templateForm&&<TestTemplateForm onClose={()=>setTemplateForm(false)}/>} {responseFor&&<TestResponseForm sessionId={responseFor} onClose={()=>setResponseFor(undefined)}/>}</>
}
