import { useMemo, useState } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useFormulaData } from "../formulas/state/FormulaDataContext";
import {
  IntelligenceClientError,
  runIntelligence,
} from "../intelligence/api/intelligenceClient";
import type {
  ClaimKind,
  IntelligenceResponse,
} from "../intelligence/domain/intelligenceContract";
const claimLabel: Record<ClaimKind, string> = {
  fact: "Fact",
  prediction: "Prediction",
  observation: "Observation",
  recommendation: "Recommendation",
};
export function ScentStudioPage() {
  const data = useFormulaData();
  const [prompt, setPrompt] = useState("");
  const [productId, setProductId] = useState("");
  const [versionId, setVersionId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [conceptText, setConceptText] = useState("");
  const [threadId, setThreadId] = useState<string>();
  const [report, setReport] = useState<IntelligenceResponse>();
  const [state, setState] = useState<
    "idle" | "gathering" | "analyzing" | "success" | "error"
  >("idle");
  const [error, setError] = useState<{ code: string; message: string }>();
  const concepts = useMemo(
    () => [
      ...new Set(
        conceptText
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      ),
    ],
    [conceptText],
  );
  const versions = data.formulaVersions.filter(
    (v) =>
      !productId ||
      data.formulas.find((f) => f.id === v.formulaId)?.productId === productId,
  );
  const observations = data.labObservations.filter(
    (o) =>
      (productId || versionId) &&
      o.observedAt &&
      data.labBatches.some(
        (b) =>
          b.id === o.labBatchId &&
          (!productId || b.productId === productId) &&
          (!versionId || b.formulaVersionId === versionId),
      ),
  );
  const analyze = async () => {
    setError(undefined);
    setState("gathering");
    await Promise.resolve();
    setState("analyzing");
    try {
      const result = await runIntelligence({
        schemaVersion: 1,
        mode: "scent_exploration",
        threadId,
        userPrompt: prompt,
        contextSelection: {
          productId: productId || undefined,
          formulaVersionId: versionId || undefined,
          selectedIngredientIds: selected,
          conceptMaterials: concepts,
        },
      });
      setThreadId(result.threadId);
      setReport(result.response);
      setPrompt("");
      setState("success");
    } catch (cause) {
      const e =
        cause instanceof IntelligenceClientError
          ? cause
          : new IntelligenceClientError(
              "NETWORK_FAILURE",
              "Scent Studio could not reach Intelligence.",
            );
      setError({ code: e.code, message: e.message });
      setState("error");
    }
  };
  const canAnalyze =
    prompt.trim().length > 0 || selected.length > 0 || concepts.length > 0;
  return (
    <div className="scent-studio">
      <Link className="back-link" to="/scent-house">
        <ArrowLeft size={14} />
        Scent House
      </Link>
      <header>
        <span className="eyebrow">Development Copilot / Scent Studio</span>
        <h1>What are you trying to create?</h1>
        <p>
          Describe a direction, select real workspace context, or add clearly
          labelled concept materials.
        </p>
      </header>
      <div className="studio-layout">
        <section className="panel studio-input">
          <label>
            Idea or question
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="I want something dark, sexy, expensive and masculine, but not heavy."
            />
          </label>
          <div className="studio-context-grid">
            <label>
              Product context
              <select
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  setVersionId("");
                }}
              >
                <option value="">No Product selected</option>
                {data.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Formula Version context
              <select
                value={versionId}
                onChange={(e) => setVersionId(e.target.value)}
              >
                <option value="">No Formula Version selected</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {data.formulas.find((f) => f.id === v.formulaId)?.name} ·{" "}
                    {v.version}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset>
            <legend>Workspace Materials</legend>
            {data.ingredients.length ? (
              data.ingredients.map((i) => (
                <label className="material-choice" key={i.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(i.id)}
                    onChange={() =>
                      setSelected((x) =>
                        x.includes(i.id)
                          ? x.filter((id) => id !== i.id)
                          : [...x, i.id],
                      )
                    }
                  />
                  <span>
                    <b>{i.commonName}</b>
                    <small>Workspace Material · {i.inciName}</small>
                  </span>
                </label>
              ))
            ) : (
              <p className="empty-copy">
                No Workspace Materials exist yet. Concept exploration remains
                available.
              </p>
            )}
          </fieldset>
          <label>
            Concept Materials
            <input
              value={conceptText}
              onChange={(e) => setConceptText(e.target.value)}
              placeholder="Bergamot, Cardamom, Cedarwood Atlas"
            />
            <small>
              Exploratory names only. They will not create Ingredient records.
            </small>
          </label>
          <aside className="context-receipt">
            <strong>Using</strong>
            <span>{productId ? 1 : 0} Product</span>
            <span>{versionId ? 1 : 0} Formula Version</span>
            <span>{selected.length} Workspace Materials</span>
            <span>{concepts.length} Concept Materials</span>
            <span>{observations.length} Koalafrog Lab Observations</span>
            {!observations.length && (
              <p>
                No Koalafrog observations are available for this context yet.
              </p>
            )}
          </aside>
          <button
            className="button primary analyze-button"
            disabled={!canAnalyze || state === "analyzing"}
            onClick={analyze}
          >
            <Sparkles size={15} />
            {state === "gathering"
              ? "Gathering context…"
              : state === "analyzing"
                ? "Analyzing…"
                : threadId
                  ? "Continue sparring"
                  : "Analyze"}
          </button>
          {error && (
            <div className="intelligence-error" role="alert">
              <strong>
                {error.code === "INTELLIGENCE_NOT_CONFIGURED"
                  ? "Intelligence provider not configured"
                  : "Analysis unavailable"}
              </strong>
              <p>{error.message}</p>
              <button className="button ghost" onClick={analyze}>
                Retry
              </button>
            </div>
          )}
        </section>
        {report ? (
          <IntelligenceReport report={report} />
        ) : (
          <section className="panel studio-empty">
            <Sparkles />
            <h2>Your structured Intelligence Report will appear here.</h2>
            <p>
              Predictions are hypotheses—not smelled results. Facts and
              observations must cite actual Koalafrog records.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
function IntelligenceReport({ report }: { report: IntelligenceResponse }) {
  return (
    <section className="intelligence-report">
      <header className="panel">
        <span className="eyebrow">
          Validated Intelligence Report · {report.confidence} confidence
        </span>
        <h2>{report.title}</h2>
        <p>{report.summary}</p>
      </header>
      <section className="panel">
        <h3>Predicted direction</h3>
        <div className="axis-grid">
          {Object.entries(report.scentProfile.axes).map(([axis, value]) => (
            <div key={axis}>
              <span>{axis}</span>
              <div>
                <i style={{ width: `${value}%` }} />
              </div>
              <b>{value}</b>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <h3>Ingredient roles</h3>
        {report.ingredientRoles.map((r) => (
          <article className="role-row" key={r.materialName}>
            <strong>{r.materialName}</strong>
            <b>{r.predictedRole}</b>
            <p>{r.contribution}</p>
          </article>
        ))}
      </section>
      <div className="report-columns">
        <List title="What works" values={report.strengths} />
        <List title="Watch out for" values={report.tensions} />
        <List title="What may be missing" values={report.missingDimensions} />
      </div>
      <section className="panel">
        <h3>Directions</h3>
        <div className="direction-grid">
          {report.directions.map((d) => (
            <article key={d.id}>
              <h4>{d.name}</h4>
              <strong>{d.intent}</strong>
              <p>{d.predictedEffect}</p>
              <small>{d.tradeoffs.join(" · ")}</small>
            </article>
          ))}
        </div>
      </section>
      <section className="panel">
        <h3>Suggested experiments</h3>
        {report.experiments.map((e) => (
          <article className="experiment" key={e.id}>
            <h4>{e.name}</h4>
            <p>{e.hypothesis}</p>
            {e.changes.map((c) => (
              <span key={`${c.materialName}-${c.action}`}>
                <b>
                  {c.action} {c.materialName}
                </b>{" "}
                · {c.guidance} — {c.reason}
              </span>
            ))}
            <small>Observe: {e.observe.join(" · ")}</small>
          </article>
        ))}
      </section>
      <section className="panel">
        <h3>Claims & evidence</h3>
        {report.claims.map((c) => (
          <article className={`claim claim-${c.kind}`} key={c.id}>
            <span>{claimLabel[c.kind]}</span>
            <p>{c.text}</p>
            {c.evidenceRefs.map((e) => (
              <small key={`${e.entityType}-${e.entityId}`}>
                {e.label} · {e.entityType}
              </small>
            ))}
          </article>
        ))}
      </section>
      <section className="panel limitations">
        <h3>Limitations</h3>
        {report.limitations.map((x) => (
          <p key={x}>{x}</p>
        ))}
      </section>
    </section>
  );
}
function List({ title, values }: { title: string; values: string[] }) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      {values.length ? (
        values.map((x) => <p key={x}>{x}</p>)
      ) : (
        <p>None identified in this analysis.</p>
      )}
    </section>
  );
}
