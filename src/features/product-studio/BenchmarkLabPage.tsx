import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowLeft, ArrowRight, Save } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useFormulaData } from "../formulas/state/FormulaDataContext";
import { useUnsavedIngredientKnowledgeGuard } from "../ingredients/useUnsavedIngredientKnowledgeGuard";
import {
  benchmarkLabFrom,
  benchmarkLabReadiness,
  benchmarkTargetComparison,
  createBenchmarkLabDocument,
  createDevelopmentProjectFromBenchmark,
  type BenchmarkLabDocument,
} from "./domain/benchmarkLab";
import { BenchmarkLabOverviewSection } from "./benchmark-lab/BenchmarkLabOverviewSection";
import { BenchmarkReferenceSection } from "./benchmark-lab/BenchmarkReferenceSection";
import { BenchmarkScorecardSection } from "./benchmark-lab/BenchmarkScorecardSection";
import { DevelopmentBriefSection } from "./benchmark-lab/DevelopmentBriefSection";
import { SystemHypothesisSection } from "./benchmark-lab/SystemHypothesisSection";
import { FunctionalRequirementsSection } from "./benchmark-lab/FunctionalRequirementsSection";
import { BenchmarkComparisonSection } from "./benchmark-lab/BenchmarkComparisonSection";
import { FormulaReadinessSection } from "./benchmark-lab/FormulaReadinessSection";
import { UnsavedBenchmarkLabChangesModal } from "./benchmark-lab/UnsavedBenchmarkLabChangesModal";
import { ResearchSummary } from "./benchmark-lab/ResearchSummary";
import {
  countOpenResearchQuestions,
  deriveResearchProgress,
} from "./benchmark-lab/researchProgress";

const progressSteps = [
  ["Overview", "overview"],
  ["Benchmark", "benchmark"],
  ["Observations", "observations"],
  ["Development Brief", "development-brief"],
  ["System Hypothesis", "system-hypothesis"],
  ["Functional Requirements", "functional-requirements"],
  ["Target Comparison", "target-comparison"],
  ["Formula Readiness", "formula-readiness"],
] as const;

export function BenchmarkLabPage() {
  const data = useFormulaData();
  const navigate = useNavigate();
  const { conceptId } = useParams();
  const existing = data.productStudioConcepts.find(
    (item) => item.id === conceptId,
  );
  const initial = useMemo(
    () =>
      structuredClone(
        existing
          ? (benchmarkLabFrom(existing) ?? createBenchmarkLabDocument())
          : createBenchmarkLabDocument(),
      ),
    [existing],
  );
  const [document, setDocument] = useState<BenchmarkLabDocument>(initial);
  const [baseline, setBaseline] = useState(JSON.stringify(initial));
  const [message, setMessage] = useState("");
  const [leaving, setLeaving] = useState(false);
  const dirty = JSON.stringify(document) !== baseline;
  const blocker = useUnsavedIngredientKnowledgeGuard(dirty && !leaving);
  const readiness = benchmarkLabReadiness(document);
  const comparison = benchmarkTargetComparison(document);
  const researchProgress = deriveResearchProgress(
    document,
    Boolean(existing?.generatedFormulaId),
  );
  const openQuestionCount = countOpenResearchQuestions(document);

  const patch = <K extends keyof BenchmarkLabDocument>(
    key: K,
    value: BenchmarkLabDocument[K],
  ) => setDocument((current) => ({ ...current, [key]: value }));

  const navigateAfterSave = (path: string, replace = false) => {
    flushSync(() => setLeaving(true));
    navigate(path, { replace });
    queueMicrotask(() => setLeaving(false));
  };

  const save = async () => {
    try {
      if (existing) {
        const saved = await data.saveProductStudioConcept({
          ...existing,
          name: document.workingTitle,
          notes: document.objective,
          analysis: {
            ...existing.analysis,
            recordType: "development_project",
            benchmarkLab: document,
          },
        });
        setBaseline(JSON.stringify(document));
        setMessage(
          "Development project saved. Benchmark evidence and operational records were not changed.",
        );
        if (saved.id !== conceptId) {
          navigateAfterSave(`/product-studio/benchmark-lab/${saved.id}`, true);
        }
        return;
      }

      const project = createDevelopmentProjectFromBenchmark(
        document.workingTitle,
        document.systemHypothesis.physicalSystem.state === "known"
          ? document.systemHypothesis.physicalSystem.value
          : undefined,
      );
      project.analysis.benchmarkLab = document;
      const { id, createdAt, updatedAt, ...input } = project;
      const saved = await data.saveProductStudioConcept({ ...input, id });
      void createdAt;
      void updatedAt;
      setBaseline(JSON.stringify(document));
      navigateAfterSave(`/product-studio/benchmark-lab/${saved.id}`, true);
    } catch (cause) {
      setLeaving(false);
      setMessage(
        cause instanceof Error
          ? cause.message
          : "The development project could not be saved.",
      );
    }
  };

  const startFormula = async () => {
    if (!existing) {
      setMessage("Save the development project before starting a Formula.");
      return;
    }
    if (dirty) {
      setMessage(
        "Save current changes before the Formula readiness review can continue.",
      );
      return;
    }
    if (!readiness.ready) {
      setMessage(
        "Review the readiness items or explicitly acknowledge unresolved items.",
      );
      return;
    }
    try {
      await data.createFormulaFromStudio(existing.id, {
        productName: document.workingTitle,
        productCategory: document.productCategory,
        formulaName: `${document.workingTitle} — Blank Draft`,
        description: `${document.productFormat} development project from Benchmark Lab. Lineage: ${document.benchmarkLink.benchmarkId} → ${existing.id}. No benchmark ingredients, percentages, phases, or process were copied.`,
        lines: [],
        blankDraft: true,
      });
      setMessage("Blank Draft Formula created. Continue to formulation when you are ready to work on composition.");
    } catch (cause) {
      setLeaving(false);
      setMessage(
        cause instanceof Error
          ? cause.message
          : "The blank Draft Formula could not be created.",
      );
    }
  };

  return (
    <div className="benchmark-lab">
      <Link className="back-link" to="/product-studio">
        <ArrowLeft size={14} />
        Product Studio
      </Link>
      <nav className="workflow-mode-nav" aria-label="Natural Deodorant workflow">
        <span aria-current="page"><strong>Research</strong><small>Benchmark Lab and requirements</small></span>
        {existing?.generatedFormulaId ? <Link to={`/product-studio/natural-deodorant?concept=${existing.id}`}><strong>Formulation</strong><small>Natural Deodorant Studio</small><ArrowRight size={14}/></Link> : <span aria-disabled="true"><strong>Formulation</strong><small>Available after the Formula Gate</small></span>}
      </nav>
      <header className="studio-hero">
        <span className="eyebrow">
          Benchmark Lab / guided R&amp;D project
        </span>
        <h1>
          {existing ? document.workingTitle : "Create development project"}
        </h1>
        <p>
          Reference evidence, observations, targets, hypotheses, candidates, and
          Formula composition remain separate.
        </p>
        <button className="button primary" onClick={() => void save()}>
          <Save size={15} />
          {existing ? "Save project" : "Create development project"}
        </button>
      </header>
      <ResearchSummary
        progress={researchProgress}
        openQuestionCount={openQuestionCount}
      />
      <nav className="studio-steps" aria-label="Benchmark Lab progress">
        {progressSteps.map(([step, id], index) => (
          <button
            type="button"
            key={id}
            onClick={() =>
              window.document
                .getElementById(id)
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            <b>{index + 1}</b>
            {step}
          </button>
        ))}
      </nav>

      <BenchmarkLabOverviewSection document={document} onChange={patch} />
      <BenchmarkReferenceSection
        benchmarkLink={document.benchmarkLink}
        onChange={(benchmarkLink) => patch("benchmarkLink", benchmarkLink)}
      />
      <BenchmarkScorecardSection
        scorecard={document.scorecard}
        onChange={(scorecard) => patch("scorecard", scorecard)}
        onValidationMessage={setMessage}
      />
      <DevelopmentBriefSection
        brief={document.brief}
        onChange={(brief) => patch("brief", brief)}
      />
      <SystemHypothesisSection
        hypothesis={document.systemHypothesis}
        onChange={(hypothesis) => patch("systemHypothesis", hypothesis)}
      />
      <FunctionalRequirementsSection
        requirements={document.functionalRequirements}
        onChange={(requirements) =>
          patch("functionalRequirements", requirements)
        }
      />
      <BenchmarkComparisonSection comparison={comparison} />
      <FormulaReadinessSection
        readiness={readiness}
        unresolvedAcknowledged={document.unresolvedAcknowledged}
        generatedFormulaId={existing?.generatedFormulaId}
        developmentProjectId={existing?.id}
        onAcknowledgementChange={(value) =>
          patch("unresolvedAcknowledged", value)
        }
        onStartFormula={() => void startFormula()}
      />

      {message && (
        <p role="status" className="studio-state-message">
          {message}
        </p>
      )}
      {blocker.state === "blocked" && (
        <UnsavedBenchmarkLabChangesModal
          onStay={() => blocker.reset()}
          onDiscard={() => blocker.proceed()}
        />
      )}
    </div>
  );
}
