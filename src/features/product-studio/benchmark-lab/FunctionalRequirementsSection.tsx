import { useState } from "react";
import {
  ingredientReferenceCatalog,
  searchReferenceCatalog,
} from "../../ingredients/reference/catalog";
import type { BenchmarkLabDocument } from "../domain/benchmarkLab";
import { displayBenchmarkLabel, updateArrayItem } from "./benchmarkLabUi";

const roleDescriptions: Record<string, string> = {
  "Continuous phase / solvent system": "The medium that may carry or dissolve other materials and shape the product’s physical system.",
  "Primary stick-structuring system": "The main structure that may allow the product to hold a usable stick form.",
  "Co-structuring support": "Supporting structure that may modify firmness, payoff, or temperature response.",
  "Glide and sensory support": "A function that may influence drag, slip, dry-down, or after-feel.",
  "Deodorant-performance support": "A possible contribution to the intended deodorant experience; efficacy is not established here.",
  "Fragrance system": "The materials and delivery approach for scent; declared constituents are not assumed to be separately dosed.",
  "Preservation or microbial-control strategy": "How microbial risk may need to be managed; suitability requires system-specific evidence.",
  "Stability support": "A function that may help manage physical change over time or under use conditions.",
  "Film or residue-control function": "A possible influence on film formation, transfer, residue, or appearance.",
  "Appearance or clarity control": "A function that may influence clarity, colour, opacity, or surface appearance.",
  "Skin-conditioning support": "A possible contribution to skin feel or conditioning without implying a validated benefit.",
};
const roleIdentity: Record<string, [string, string]> = {
  "Continuous phase / solvent system": ["≋", "Solvent / continuous phase"],
  "Primary stick-structuring system": ["▣", "Structure"],
  "Co-structuring support": ["▣", "Structure"],
  "Glide and sensory support": ["◈", "Sensory / glide"],
  "Deodorant-performance support": ["⬣", "Performance"],
  "Fragrance system": ["✧", "Fragrance"],
  "Preservation or microbial-control strategy": ["◎", "Preservation / microbial control"],
  "Stability support": ["⚗", "Stability"],
  "Film or residue-control function": ["◫", "Appearance / film / residue"],
  "Appearance or clarity control": ["◫", "Appearance / film / residue"],
  "Skin-conditioning support": ["✦", "Skin feel"],
};

interface FunctionalRequirementsSectionProps {
  requirements: BenchmarkLabDocument["functionalRequirements"];
  onChange: (value: BenchmarkLabDocument["functionalRequirements"]) => void;
}

export function FunctionalRequirementsSection({
  requirements,
  onChange,
}: FunctionalRequirementsSectionProps) {
  const [queries, setQueries] = useState<Record<string, string>>({});
  const reviewCounts = {
    reviewed: requirements.filter((item) =>
      ["reviewed", "not_applicable"].includes(item.reviewStatus),
    ).length,
    researchNeeded: requirements.filter(
      (item) => item.reviewStatus === "research_needed",
    ).length,
    notReviewed: requirements.filter(
      (item) => item.reviewStatus === "not_reviewed",
    ).length,
  };
  const updateRequirement = (
    index: number,
    update: (
      item: BenchmarkLabDocument["functionalRequirements"][number],
    ) => BenchmarkLabDocument["functionalRequirements"][number],
  ) => onChange(updateArrayItem(requirements, index, update));

  return (
    <section className="panel benchmark-section" id="functional-requirements">
      <span className="eyebrow">
        6 / Functional requirement map — not an ingredient list
      </span>
      <p className="requirement-review-summary" aria-label="Requirement review summary">
        <strong>{reviewCounts.reviewed} reviewed</strong>
        <span>{reviewCounts.researchNeeded} research needed</span>
        <span>{reviewCounts.notReviewed} not reviewed</span>
      </p>
      <div className="requirements-grid">
        {requirements.map((requirement, index) => {
          const query = queries[requirement.id] ?? "";
          const results = query ? searchReferenceCatalog(query).slice(0, 12) : [];
          const selected = ingredientReferenceCatalog.filter((item) =>
            requirement.referenceCandidateIds.includes(item.id),
          );
          return (
          <article key={requirement.id}>
            <span className="requirement-identity">
              <span aria-hidden="true">{roleIdentity[requirement.label]?.[0] ?? "◇"}</span>
              {roleIdentity[requirement.label]?.[1] ?? "Functional role"}
            </span>
            <strong>{requirement.label}</strong>
            <p className="role-description">
              {roleDescriptions[requirement.label]}
            </p>
            <p className="candidate-empty">
              <strong>Suggested candidates</strong>
              <span>No supported suggested candidates yet.</span>
              <small>
                Current Reference Library role metadata is provisional, so it is
                available for search but not presented as supported suitability.
              </small>
            </p>
            <label>
              Importance
            <select
              aria-label={`${requirement.label} importance`}
              value={requirement.status}
              onChange={(event) =>
                updateRequirement(index, (item) => ({
                  ...item,
                  status: event.target.value as typeof item.status,
                }))
              }
            >
              <option value="unresolved">Unresolved</option>
              <option value="required">Required</option>
              <option value="optional">Optional</option>
            </select>
            </label>
            <label>
              Review status
              <select
                aria-label={`${requirement.label} review status`}
                value={requirement.reviewStatus}
                onChange={(event) =>
                  updateRequirement(index, (item) => ({
                    ...item,
                    reviewStatus: event.target.value as typeof item.reviewStatus,
                  }))
                }
              >
                <option value="not_reviewed">Not reviewed</option>
                <option value="reviewed">Reviewed</option>
                <option value="research_needed">Research needed</option>
                <option value="not_applicable">Not applicable</option>
              </select>
              <small>
                Records whether this requirement has received a deliberate
                review; it is separate from importance.
              </small>
            </label>
            <label>
              Desired outcome
              <input
                value={requirement.desiredOutcome}
                onChange={(event) =>
                  updateRequirement(index, (item) => ({
                    ...item,
                    desiredOutcome: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Current hypothesis
              <input
                value={requirement.currentHypothesis}
                onChange={(event) =>
                  updateRequirement(index, (item) => ({
                    ...item,
                    currentHypothesis: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Search the full Reference Library
              <input
                type="search"
                value={query}
                placeholder="Search name, INCI, function, or use"
                onChange={(event) =>
                  setQueries((current) => ({
                    ...current,
                    [requirement.id]: event.target.value,
                  }))
                }
              />
            </label>
            {results.length > 0 && (
              <div className="candidate-results" aria-label={`Reference Library results for ${requirement.label}`}>
                {results.map((candidate) => {
                  const chosen = requirement.referenceCandidateIds.includes(candidate.id);
                  return (
                    <button
                      type="button"
                      key={candidate.id}
                      aria-pressed={chosen}
                      onClick={() =>
                        updateRequirement(index, (item) => ({
                          ...item,
                          referenceCandidateIds: chosen
                            ? item.referenceCandidateIds.filter((id) => id !== candidate.id)
                            : [...item.referenceCandidateIds, candidate.id],
                        }))
                      }
                    >
                      <strong>{candidate.commonName}</strong>
                      <small>{candidate.inciName} · provisional catalog match</small>
                    </button>
                  );
                })}
              </div>
            )}
            {query && results.length === 0 && <small>No Reference Library matches.</small>}
            {selected.length > 0 && (
              <div className="selected-candidates">
                <strong>Selected reference candidates</strong>
                {selected.map((candidate) => (
                  <button
                    type="button"
                    key={candidate.id}
                    onClick={() =>
                      updateRequirement(index, (item) => ({
                        ...item,
                        referenceCandidateIds: item.referenceCandidateIds.filter(
                          (id) => id !== candidate.id,
                        ),
                      }))
                    }
                  >
                    {candidate.commonName} <span aria-hidden="true">×</span>
                    <span className="sr-only">Remove</span>
                  </button>
                ))}
              </div>
            )}
            <label>
              Rationale
              <textarea
                value={requirement.rationale}
                onChange={(event) =>
                  updateRequirement(index, (item) => ({
                    ...item,
                    rationale: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Open questions
              <textarea
                value={requirement.openQuestions}
                onChange={(event) =>
                  updateRequirement(index, (item) => ({
                    ...item,
                    openQuestions: event.target.value,
                  }))
                }
              />
            </label>
            <div className="requirement-evidence">
              <label>
                Evidence source
                <select
                  value={requirement.evidenceSource}
                  onChange={(event) =>
                    updateRequirement(index, (item) => ({
                      ...item,
                      evidenceSource: event.target.value as typeof item.evidenceSource,
                    }))
                  }
                >
                  <option value="unknown">Unknown</option>
                  <option value="internal_hypothesis">Internal hypothesis</option>
                  <option value="ingredient_knowledge">Ingredient Knowledge</option>
                  <option value="user_observation">User observation</option>
                </select>
              </label>
              <label>
                Confidence
                <select
                  value={requirement.confidence}
                  onChange={(event) =>
                    updateRequirement(index, (item) => ({
                      ...item,
                      confidence: event.target.value as typeof item.confidence,
                    }))
                  }
                >
                  {["verified", "supported", "observed", "assumed", "unknown", "conflicting"].map((value) => (
                    <option key={value} value={value}>{displayBenchmarkLabel(value)}</option>
                  ))}
                </select>
              </label>
            </div>
            <small>
              Linking a reference candidate creates no Workspace Ingredient,
              Formula Line, Supplier Product, or stock.
            </small>
          </article>
          );
        })}
      </div>
    </section>
  );
}
