/* eslint-disable react-hooks/set-state-in-effect -- repository hydration and revision changes reset the controlled editor */
import { useCallback, useEffect, useState } from "react";
import { Archive, ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useActiveWorkspace } from "../../platform/startup/ActiveWorkspaceContext";
import {
  loadKnowledge,
  recordScentMemoryCheckpoint,
  saveScentMemorySession,
} from "./data/knowledgeRepository";
import type { ScentCheckpointKind } from "./domain/scentMemory";

const checkpoints: { value: ScentCheckpointKind; label: string }[] = [
  { value: "immediate", label: "Immediate" },
  { value: "15_minutes", label: "15 minutes" },
  { value: "1_hour", label: "1 hour" },
  { value: "4_hours", label: "4 hours" },
  { value: "next_day", label: "Next day" },
  { value: "custom", label: "Custom time" },
];
const conclusionFields = [
  ["what_worked", "What worked"],
  ["what_surprised_me", "What surprised me"],
  ["what_felt_dominant", "What felt dominant"],
  ["what_disappeared", "What disappeared"],
  ["what_was_missing", "What was missing"],
  ["change_next", "What I would change next"],
  ["final_conclusion", "Final conclusion"],
] as const;

export function ScentMemoryDetailPage() {
  const { sessionId = "" } = useParams(),
    workspace = useActiveWorkspace();
  const [loaded, setLoaded] = useState<Awaited<ReturnType<typeof loadKnowledge>>>();
  const [error, setError] = useState("");
  const [kind, setKind] = useState<ScentCheckpointKind>("immediate");
  const [customMinutes, setCustomMinutes] = useState("");
  const [descriptors, setDescriptors] = useState("");
  const [notes, setNotes] = useState("");
  const [overall, setOverall] = useState("");
  const [intensity, setIntensity] = useState("");
  const [correction, setCorrection] = useState<string>();
  const [summary, setSummary] = useState<Record<string, string>>({});
  const refresh = useCallback(async () => {
    if (!workspace) return;
    try {
      setLoaded(await loadKnowledge(workspace.workspaceId));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Scent Memory unavailable.");
    }
  }, [workspace]);
  useEffect(() => void refresh(), [refresh]);
  const session = loaded?.sessions.find((item) => item.id === sessionId),
    entries = loaded?.checkpoints.filter((item) => item.session_id === sessionId) ?? [];
  useEffect(() => {
    if (!session) return;
    setSummary(
      Object.fromEntries([
        ["overall_score", session.overall_score?.toString() ?? ""],
        ...conclusionFields.map(([key]) => [key, String(session[key] ?? "")]),
      ]),
    );
  }, [session]);
  if (error)
    return <section className="panel knowledge-state" role="alert"><h2>Scent Memory unavailable</h2><p>{error}</p><button className="button ghost" onClick={refresh}>Retry</button></section>;
  if (!session)
    return <section className="panel knowledge-state"><p>Loading Scent Memory…</p></section>;
  const record = async () => {
    try {
      await recordScentMemoryCheckpoint({
        sessionId,
        correctionOf: correction,
        checkpoint: {
          checkpointKind: kind,
          ...(kind === "custom" ? { customMinutes: Number(customMinutes) } : {}),
          observedAt: new Date().toISOString(),
          descriptors: descriptors.split(",").map((item) => item.trim()).filter(Boolean),
          notes,
          ...(intensity ? { intensity: Number(intensity) } : {}),
          overallImpression: overall,
        },
      });
      setDescriptors(""); setNotes(""); setOverall(""); setIntensity(""); setCorrection(undefined);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkpoint could not be recorded.");
    }
  };
  const update = async (values: Record<string, unknown>) => {
    try { await saveScentMemorySession(session, values); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Session could not be updated."); }
  };
  const saveSummary = () => update({
    overall_score: summary.overall_score ? Number(summary.overall_score) : null,
    ...Object.fromEntries(conclusionFields.map(([key]) => [key, summary[key]?.trim() || null])),
  });
  return <div className="scent-memory-detail">
    <Link className="back-link" to="/knowledge?tab=scent-memory"><ArrowLeft size={14}/>Scent Memory</Link>
    <header><div><span className="eyebrow">Empirical observation record</span><h1>{session.title}</h1><p>{session.status} · revision {session.revision}</p></div><div className="action-row"><button className="button ghost" onClick={()=>update({archived_at:new Date().toISOString()})}><Archive size={14}/>Archive</button><button className="button ghost" onClick={()=>update({status:session.status==="active"?"completed":"active"})}>{session.status==="active"?"Complete evaluation":"Reopen evaluation"}</button></div></header>
    <div className="scent-memory-layout">
      <div><section className="panel checkpoint-form"><h2>{correction?"Correct checkpoint":"Add observation checkpoint"}</h2><p>Record only what you actually evaluated. Empty fields are welcome.</p><label>Checkpoint<select value={kind} onChange={event=>setKind(event.target.value as ScentCheckpointKind)}>{checkpoints.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>{kind==="custom"&&<label>Minutes after application<input type="number" min="0" value={customMinutes} onChange={event=>setCustomMinutes(event.target.value)}/></label>}<label>Descriptors<input value={descriptors} onChange={event=>setDescriptors(event.target.value)} placeholder="dry, aromatic, woody"/></label><label>Honest notes<textarea value={notes} onChange={event=>setNotes(event.target.value)}/></label><label>Intensity (1–5)<input type="number" min="1" max="5" value={intensity} onChange={event=>setIntensity(event.target.value)}/></label><label>Overall impression<textarea value={overall} onChange={event=>setOverall(event.target.value)}/></label><button className="button primary" disabled={kind==="custom"&&!customMinutes} onClick={record}>{correction?"Record correction":"Record checkpoint"}</button>{correction&&<button className="button ghost" onClick={()=>setCorrection(undefined)}>Cancel correction</button>}</section>
      <section className="panel scent-memory-summary"><h2>Evaluation conclusion</h2><label>Overall score (1–5)<input type="number" min="1" max="5" value={summary.overall_score??""} onChange={event=>setSummary(value=>({...value,overall_score:event.target.value}))}/></label>{conclusionFields.map(([key,labelText])=><label key={key}>{labelText}<textarea value={summary[key]??""} onChange={event=>setSummary(value=>({...value,[key]:event.target.value}))}/></label>)}<button className="button primary" onClick={saveSummary}>Save conclusion</button></section></div>
      <section className="checkpoint-timeline"><h2>Observation timeline</h2>{entries.length?entries.map(entry=><article key={entry.id} className={!entry.is_current?"superseded":""}><div><span className="eyebrow">{checkpointLabel(entry.checkpoint_kind,entry.custom_minutes)} · revision {entry.revision}</span><h3>{entry.descriptors.join(" · ")||"Observation checkpoint"}</h3><p>{entry.notes||String(entry.overall_impression??"")||"No narrative note recorded."}</p><small>{new Date(entry.observed_at).toLocaleString()}{!entry.is_current?" · Superseded":" · Current evidence"}</small></div>{entry.is_current&&<button className="button ghost" onClick={()=>{setCorrection(entry.id);setKind(entry.checkpoint_kind);setDescriptors(entry.descriptors.join(", "));setNotes(entry.notes??"")}}>Correct</button>}</article>):<section className="panel knowledge-state"><p>No observations recorded yet.</p></section>}</section>
    </div>
  </div>;
}
const checkpointLabel = (kind: ScentCheckpointKind, minutes: number | null) => kind === "custom" ? `${minutes} minutes` : checkpoints.find((item) => item.value === kind)?.label ?? kind;
