/* eslint-disable react-hooks/set-state-in-effect -- authenticated repository hydration is an external synchronization */
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookMarked, BookOpen, Brain, Plus, Search } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { useFormulaData } from "../formulas/state/FormulaDataContext";
import { useActiveWorkspace } from "../../platform/startup/ActiveWorkspaceContext";
import { createScentMemorySession, loadKnowledge } from "./data/knowledgeRepository";
import {
  buildIntelligenceLibrary,
  filterLibrary,
  intelligenceUsageSummary,
} from "./domain/knowledge";
import type { ScentMemorySession } from "./domain/scentMemory";

type Loaded = Awaited<ReturnType<typeof loadKnowledge>>;
export function KnowledgePage() {
  const workspace = useActiveWorkspace();
  const data = useFormulaData();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "scent-memory" ? "scent-memory" : "library";
  const [loaded, setLoaded] = useState<Loaded>();
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [product, setProduct] = useState("");
  const [formula, setFormula] = useState("");
  const [material, setMaterial] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [pinned, setPinned] = useState(false);
  const [archived, setArchived] = useState(false);
  const [oldest, setOldest] = useState(false);
  const refresh = useCallback(async () => {
    if (!workspace) return;
    setError("");
    try {
      setLoaded(await loadKnowledge(workspace.workspaceId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Knowledge could not be loaded.");
    }
  }, [workspace]);
  useEffect(() => void refresh(), [refresh]);
  const library = useMemo(
    () =>
      loaded
        ? buildIntelligenceLibrary(loaded.threads, loaded.runs, loaded.references)
        : [],
    [loaded],
  );
  const visible = useMemo(
    () =>
      filterLibrary(library, {
        search,
        status,
        productId: product,
        formulaVersionId: formula,
        material,
        materialIds: data.ingredients
          .filter((item) =>
            `${item.commonName} ${item.inciName}`
              .toLowerCase()
              .includes(material.trim().toLowerCase()),
          )
          .map((item) => item.id),
        dateFrom,
        pinnedOnly: pinned,
        includeArchived: archived,
        sort: oldest ? "oldest" : "newest",
      }),
    [library, search, status, product, formula, material, dateFrom, pinned, archived, oldest, data.ingredients],
  );
  const usage = intelligenceUsageSummary(library);
  return (
    <div className="knowledge-page">
      <PageHeader
        eyebrow="Private workshop memory"
        title="Knowledge"
        description="Intelligence history stays authoritative in its original runs. Scent Memory records only what you actually evaluated."
      />
      <nav className="knowledge-tabs" aria-label="Knowledge sections">
        <button className={tab === "library" ? "selected" : ""} onClick={() => setParams({})}><Brain size={14} />Intelligence Library</button>
        <button className={tab === "scent-memory" ? "selected" : ""} onClick={() => setParams({ tab: "scent-memory" })}><BookOpen size={14} />Scent Memory</button>
        <Link className="knowledge-tab-link" to="/knowledge/bible"><BookMarked size={14}/>Koalafrog Bible</Link>
      </nav>
      {error ? <section className="panel knowledge-state" role="alert"><h2>Knowledge unavailable</h2><p>{error}</p><button className="button ghost" onClick={refresh}>Retry</button></section> : !loaded ? <section className="panel knowledge-state"><p>Loading private Knowledge…</p></section> : tab === "library" ? (
        <>
          <section className="knowledge-metrics">
            <div><span>Completed analyses</span><strong>{usage.completedRuns}</strong></div>
            <div><span>Total tokens</span><strong>{usage.totalTokens || "Unavailable"}</strong></div>
            <div><span>Estimated total cost</span><strong>{usage.estimatedTotalCost == null ? "Cost unavailable" : `$${usage.estimatedTotalCost.toFixed(4)}`}</strong></div>
            <div><span>Average estimated cost</span><strong>{usage.averageEstimatedCost == null ? "Cost unavailable" : `$${usage.averageEstimatedCost.toFixed(4)}`}</strong></div>
          </section>
          <section className="panel knowledge-filters">
            <label className="knowledge-search"><Search size={14}/><input aria-label="Search Intelligence Library" value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search questions, titles, notes or concept materials" /></label>
            <select aria-label="Filter by Product" value={product} onChange={(e)=>setProduct(e.target.value)}><option value="">All Products</option>{data.products.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <select aria-label="Filter by Formula Version" value={formula} onChange={(e)=>setFormula(e.target.value)}><option value="">All Formula Versions</option>{data.formulaVersions.map(x=><option key={x.id} value={x.id}>{x.version}</option>)}</select>
            <input aria-label="Filter by material" value={material} onChange={(e)=>setMaterial(e.target.value)} placeholder="Material name" />
            <input aria-label="Filter from date" type="date" value={dateFrom} onChange={(e)=>setDateFrom(e.target.value)} />
            <select aria-label="Technical status" value={status} onChange={(e)=>setStatus(e.target.value)}><option value="">Normal library</option><option value="completed">Completed</option><option value="failed">Failed</option><option value="INVALID_PROVIDER_RESPONSE">Invalid response</option><option value="PROVIDER_FAILURE">Provider failure</option></select>
            <label><input type="checkbox" checked={pinned} onChange={(e)=>setPinned(e.target.checked)}/>Pinned only</label>
            <label><input type="checkbox" checked={archived} onChange={(e)=>setArchived(e.target.checked)}/>Show archived</label>
            <button className="button ghost" onClick={()=>setOldest(x=>!x)}>{oldest ? "Oldest first" : "Newest first"}</button>
          </section>
          <section className="knowledge-list" aria-label="Intelligence threads">
            {visible.length ? visible.map(item=><Link to={`/knowledge/intelligence/${item.thread.id}`} key={item.thread.id} className={item.reference?.archived_at ? "archived" : ""}>
              <div><span className="eyebrow">{item.thread.mode.replaceAll("_", " ")}</span><h2>{item.displayTitle}</h2><p>{item.latestRun?.user_prompt ?? "No question recorded."}</p></div>
              <dl><div><dt>Analyses</dt><dd>{item.completedRuns}</dd></div><div><dt>Latest activity</dt><dd>{new Date(item.latestRun?.created_at ?? item.thread.updated_at).toLocaleDateString()}</dd></div><div><dt>Model</dt><dd>{item.latestRun?.model_name ?? "Not recorded"}</dd></div><div><dt>Estimated cost</dt><dd>{item.estimatedCost == null ? "Unavailable" : `$${item.estimatedCost.toFixed(4)}`}</dd></div></dl>
              <span>{item.reference?.is_pinned ? "Pinned" : item.reference?.archived_at ? "Archived" : "Open"}</span>
            </Link>) : <section className="panel knowledge-state"><h2>No matching Intelligence history</h2><p>Completed Scent Studio conversations appear automatically—no duplicate save step is needed.</p></section>}
          </section>
        </>
      ) : <ScentMemoryLibrary sessions={loaded.sessions} refresh={refresh} />}
    </div>
  );
}

function ScentMemoryLibrary({sessions,refresh}:{sessions:ScentMemorySession[];refresh:()=>Promise<void>}){
  const workspace=useActiveWorkspace(),data=useFormulaData(),[params]=useSearchParams();
  const preset=params.get("experimentId")?`experiment:${params.get("experimentId")}`:params.get("labBatchId")?`batch:${params.get("labBatchId")}`:params.get("formulaVersionId")?`formula:${params.get("formulaVersionId")}`:params.get("ingredientId")?`ingredient:${params.get("ingredientId")}`:"";
  const [creating,setCreating]=useState(!!preset),[title,setTitle]=useState(""),[context,setContext]=useState(preset),[message,setMessage]=useState("");
  const options=[...(params.get("experimentId")?[{value:`experiment:${params.get("experimentId")}`,label:"Completed Development Experiment"}]:[]),...data.products.map(x=>({value:`product:${x.id}`,label:`Product · ${x.name}`})),...data.formulaVersions.map(x=>({value:`formula:${x.id}`,label:`Formula Version · ${x.version}`})),...data.labBatches.map(x=>({value:`batch:${x.id}`,label:`Lab Batch · ${x.batchNumber}`})),...data.ingredients.map(x=>({value:`ingredient:${x.id}`,label:`Ingredient · ${x.commonName}`})),...data.testSessions.map(x=>({value:`test:${x.id}`,label:`Test Session · ${x.name}`}))];
  const create=async()=>{if(!workspace||!title.trim()||!context)return;const [kind,id]=context.split(":");try{await createScentMemorySession({workspaceId:workspace.workspaceId,title,...(kind==="experiment"?{developmentExperimentId:id}:kind==="product"?{productId:id}:kind==="formula"?{formulaVersionId:id}:kind==="batch"?{labBatchId:id}:kind==="ingredient"?{ingredientId:id}:{testSessionId:id})});setTitle("");setContext("");setCreating(false);await refresh()}catch(cause){setMessage(cause instanceof Error?cause.message:"Scent Memory could not be created.")}};
  const visible=sessions.filter(x=>!x.archived_at);
  return <>
    <section className="scent-memory-intro"><div><span className="eyebrow">Empirical workshop record</span><h2>What you actually smelled—not what Intelligence predicted.</h2><p>Checkpoints become evidence only after you deliberately record a physical evaluation.</p></div><button className="button primary" onClick={()=>setCreating(x=>!x)}><Plus size={14}/>New Scent Memory</button></section>
    {creating&&<section className="panel scent-memory-create"><label>Private title<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Signature Beard Oil — first smell"/></label><label>What are you evaluating?<select value={context} onChange={e=>setContext(e.target.value)}><option value="">Choose a real Koalafrog record</option>{options.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label><button className="button primary" disabled={!title.trim()||!context} onClick={create}>Create evaluation</button>{message&&<p className="form-error">{message}</p>}</section>}
    <section className="scent-memory-list">{visible.length?visible.map(session=><Link key={session.id} to={`/knowledge/scent-memory/${session.id}`}><div><span className="eyebrow">{session.status} evaluation</span><h2>{session.title}</h2><p>{contextLabel(session,data)}</p></div><strong>{session.overall_score ? `${session.overall_score}/5` : "Not scored"}</strong><time>{new Date(session.updated_at).toLocaleDateString()}</time></Link>):<section className="panel knowledge-state"><h2>No Scent Memory yet</h2><p>Start with a short, honest note when you evaluate a real sample or material.</p></section>}</section>
  </>
}
function contextLabel(session:ScentMemorySession,data:ReturnType<typeof useFormulaData>){if(session.lab_batch_id)return `Lab Batch · ${data.labBatches.find(x=>x.id===session.lab_batch_id)?.batchNumber??session.lab_batch_id}`;if(session.formula_version_id)return `Formula Version · ${data.formulaVersions.find(x=>x.id===session.formula_version_id)?.version??session.formula_version_id}`;if(session.product_id)return `Product · ${data.products.find(x=>x.id===session.product_id)?.name??session.product_id}`;if(session.ingredient_id)return `Ingredient · ${data.ingredients.find(x=>x.id===session.ingredient_id)?.commonName??session.ingredient_id}`;return "Linked Test Session"}
