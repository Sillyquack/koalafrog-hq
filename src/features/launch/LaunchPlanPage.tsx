import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { useFormulaData } from "../formulas/state/FormulaDataContext";
export function LaunchPlanPage() {
  const { launchPlanId } = useParams(),
    d = useFormulaData(),
    plan = d.launchPlans.find((p) => p.id === launchPlanId);
  if (!plan)
    return (
      <div className="empty-state">
        <h1>Launch Plan not found</h1>
      </div>
    );
  const decisions = d.launchDecisions.filter((x) => x.launchPlanId === plan.id),
    decide = async () => {
      const decision = window.prompt(
        "Internal decision: Go, No-Go, Conditional Go, or Deferred",
        "Deferred",
      );
      if (
        ["Go", "No-Go", "Conditional Go", "Deferred"].includes(decision ?? "")
      )
        await d.recordLaunchDecision(
          plan.id,
          decision as "Go" | "No-Go" | "Conditional Go" | "Deferred",
          "Internal decision record; not regulatory approval.",
        );
    };
  return (
    <>
      <Link className="back-link" to="/launch">
        <ArrowLeft size={14} />
        Launch Readiness
      </Link>
      <PageHeader
        eyebrow={`${d.products.find((p) => p.id === plan.productId)?.name} / ${plan.targetMarket}`}
        title="Launch Plan"
        description="Internal operational go/no-go workspace. Decisions preserve unresolved blockers and acknowledged risk context."
        action={
          <button className="button primary" disabled={d.pendingActions.includes("recordLaunchDecision")} onClick={decide}>
            {d.pendingActions.includes("recordLaunchDecision") ? "Recording…" : "Record Go / No-Go"}
          </button>
        }
      />
      {d.actionError && <p className="form-error" role="alert">{d.actionError}</p>}
      <section className="batch-source">
        <div>
          <span>Project status</span>
          <StatusPill tone={plan.status === "Blocked" ? "red" : "amber"}>
            {plan.status}
          </StatusPill>
        </div>
        <div>
          <span>Target date</span>
          <strong>{plan.targetLaunchDate}</strong>
        </div>
        <div>
          <span>Evidence dossier</span>
          <strong>
            <Link to={`/compliance/${plan.complianceDossierId}`}>
              Open exact configuration
            </Link>
          </strong>
        </div>
        <div>
          <span>Owner</span>
          <strong>{plan.owner}</strong>
        </div>
      </section>
      <div className="compliance-grid">
        <section className="panel">
          <SectionHeader
            title="Compliance-derived blockers"
            detail="Evidence workflow issues"
          />
          {d.readinessIssues
            .filter(
              (i) =>
                i.complianceDossierId === plan.complianceDossierId &&
                i.severity === "Blocking",
            )
            .map((i) => (
              <article className="evidence-row" key={i.id}>
                <strong>{i.title}</strong>
                <StatusPill tone="red">{i.status}</StatusPill>
              </article>
            ))}
        </section>
        <section className="panel">
          <SectionHeader
            title="Commercial launch tasks"
            detail="Not regulatory requirements"
          />
          {d.launchMilestones
            .filter(
              (m) => m.launchPlanId === plan.id && m.kind === "Commercial Task",
            )
            .map((m) => (
              <article className="evidence-row" key={m.id}>
                <strong>{m.title}</strong>
                <StatusPill tone="neutral">{m.status}</StatusPill>
              </article>
            ))}
        </section>
      </div>
      <section className="panel">
        <SectionHeader
          title="Historical Go / No-Go decisions"
          detail="Append-only internal business records"
        />
        {decisions.map((x) => (
          <article className="decision-row" key={x.id}>
            <StatusPill tone={x.decision === "Go" ? "green" : "amber"}>
              {x.decision}
            </StatusPill>
            <div>
              <strong>
                {new Date(x.decidedAt).toLocaleString("en-GB")} · {x.decidedBy}
              </strong>
              <p>{x.notes}</p>
            </div>
            <span>{x.unresolvedBlockingIssues.length} blockers recorded</span>
          </article>
        ))}
        {!decisions.length && (
          <p className="empty-copy">No internal decision recorded.</p>
        )}
      </section>
    </>
  );
}
