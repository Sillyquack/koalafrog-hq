import type { ReturnTypeOfResearchProgress } from "./researchSummaryTypes";

export function ResearchSummary({
  progress,
  openQuestionCount,
}: {
  progress: ReturnTypeOfResearchProgress;
  openQuestionCount: number;
}) {
  const focusQuestions = () => {
    const section = document.getElementById("system-hypothesis");
    section?.scrollIntoView({ behavior: "smooth" });
    section?.focus({ preventScroll: true });
  };

  return (
    <section className="research-summary" aria-labelledby="research-progress-title">
      <div className="research-progress-copy">
        <span className="eyebrow" id="research-progress-title">Research Progress</span>
        <strong>{progress.percent}%</strong>
        <progress
          max={progress.total}
          value={progress.completed}
          aria-label={`${progress.completed} of ${progress.total} research workflow checks complete`}
        />
        <small>
          Workflow completion only — not formula quality, safety, efficacy, or
          market readiness.
        </small>
      </div>
      <dl>
        <div>
          <dt>Current phase</dt>
          <dd>{progress.maturity}</dd>
        </div>
        <div>
          <dt>Open research questions</dt>
          <dd>{openQuestionCount}</dd>
          <button type="button" onClick={focusQuestions}>
            Review questions
          </button>
        </div>
      </dl>
    </section>
  );
}
