import { FlaskConical } from "lucide-react";
import { Link } from "react-router-dom";
import type { ProductStudioConcept } from "../../../types/domain";
import type { benchmarkLabReadiness } from "../domain/benchmarkLab";

interface FormulaReadinessSectionProps {
  readiness: ReturnType<typeof benchmarkLabReadiness>;
  unresolvedAcknowledged: boolean;
  generatedFormulaId?: ProductStudioConcept["generatedFormulaId"];
  developmentProjectId?: ProductStudioConcept["id"];
  onAcknowledgementChange: (value: boolean) => void;
  onStartFormula: () => void;
}
const readinessReasons: Record<string, string> = {
  concept: "Add a working title for the development project.",
  system: "Choose a working physical-system hypothesis or explicitly mark it Unknown.",
  constraints: "Review at least one constraint and set its semantic state.",
  targets: "Define at least one known target with Critical priority.",
  requirements: "Review at least one functional requirement.",
  benchmark: "Keep the immutable deodorant benchmark linked to this project.",
};

export function FormulaReadinessSection({
  readiness,
  unresolvedAcknowledged,
  generatedFormulaId,
  developmentProjectId,
  onAcknowledgementChange,
  onStartFormula,
}: FormulaReadinessSectionProps) {
  const completedCount = readiness.items.filter((item) => item.ready).length;
  const needsReview = readiness.items.filter((item) => !item.ready);
  return (
    <section className="panel benchmark-section" id="formula-readiness">
      <span className="eyebrow">8 / Formula readiness</span>
      <h2>Start a blank Draft Formula</h2>
      <div className="readiness-summary">
        <strong>
          {completedCount} of {readiness.items.length} readiness checks complete
        </strong>
        {needsReview.length > 0 && (
          <>
            <span>Needs review:</span>
            <ul>
              {needsReview.map((item) => <li key={item.id}>{item.label}</li>)}
            </ul>
          </>
        )}
      </div>
      <div className="readiness-checks">
        {readiness.items.map((item) => (
          <div key={item.id} className={item.ready ? "complete" : "unresolved"}>
            <span aria-hidden="true">{item.ready ? "✓" : "○"}</span>
            <div>
              <strong>{item.label}</strong>
              <small>
                {item.ready ? "Complete." : readinessReasons[item.id]}
              </small>
            </div>
          </div>
        ))}
      </div>
      <label>
        <input
          type="checkbox"
          checked={unresolvedAcknowledged}
          onChange={(event) => onAcknowledgementChange(event.target.checked)}
        />
        I acknowledge unresolved items and want to proceed without false
        certainty.
      </label>
      <p>
        The Draft will contain zero Formula Lines and no percentages, phases,
        process instructions, supplier assumptions, stock, or procurement.
      </p>
      <button
        className="button primary"
        disabled={!readiness.ready || Boolean(generatedFormulaId)}
        onClick={onStartFormula}
      >
        <FlaskConical size={15} />
        {generatedFormulaId
          ? "Blank Draft already created"
          : "Start Draft Formula"}
      </button>
      {generatedFormulaId && (
        <Link className="button primary" to={`/product-studio/natural-deodorant?concept=${developmentProjectId}`}>
          Continue to formulation
        </Link>
      )}
    </section>
  );
}
