import { useMemo, useRef, useState } from "react";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import type {
  CompatibilityRating,
  CompatibilityTargetType,
  EvidenceSourceType,
  IngredientKnowledgeCompatibility,
  IngredientKnowledgeEvidence,
  IngredientKnowledgeRole,
  IngredientKnowledgeRoleLevel,
  IngredientKnowledgeRoleName,
  KnowledgeConfidence,
  KnowledgeState,
  KnowledgeValue,
  MeasuredKnowledgeValue,
} from "../../types/domain";
import { useFormulaData } from "../formulas/state/FormulaDataContext";
import {
  clearIncompatibleKnowledgeValue,
  createEmptyIngredientKnowledgeProfile,
  documentIdentifierDisplay,
  ingredientKnowledgeAggregatesEqual,
  knowledgeCompleteness,
  knowledgeConfidences,
  knowledgeStates,
  measuredPhysicalPropertyNames,
  predictionInputNames,
  sensoryDimensions,
  safeIngredientKnowledgeError,
  type IngredientKnowledgeAggregate,
  validateIngredientKnowledgeAggregate,
  validateKnowledgeValue,
  validateMeasuredValue,
  validateSensoryValue,
} from "./domain/ingredientKnowledge";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import { useUnsavedIngredientKnowledgeGuard } from "./useUnsavedIngredientKnowledgeGuard";

const tabs = [
  "Overview",
  "Identity",
  "Physical",
  "Functions",
  "Sensory",
  "Compatibility",
  "Evidence",
] as const;
const roleNames: IngredientKnowledgeRoleName[] = [
  "structuring_wax",
  "soft_structurant",
  "liquid_emollient",
  "occlusive",
  "absorbent_powder",
  "deodorant_active",
  "slip_modifier",
  "texture_modifier",
  "film_former",
  "antioxidant",
  "fragrance",
  "preservative",
  "solvent",
  "humectant",
  "surfactant",
  "emulsifier",
  "active",
  "colourant",
  "other",
];
const roleLevels: IngredientKnowledgeRoleLevel[] = [
  "primary",
  "secondary",
  "optional",
  "context_dependent",
];
const targetTypes: CompatibilityTargetType[] = [
  "ingredient",
  "formulation_archetype",
  "product_template",
  "packaging_material",
];
const ratings: CompatibilityRating[] = [
  "excellent",
  "good",
  "acceptable",
  "avoid",
  "unknown",
  "review_required",
];
const sourceTypes: EvidenceSourceType[] = [
  "supplier_document",
  "scientific_literature",
  "patent",
  "regulatory_document",
  "internal_lab",
  "internal_observation",
  "external_observation",
  "user_note",
  "unknown",
];
type Tab = (typeof tabs)[number];
type Errors = Record<string, string>;
type SaveState =
  | "idle"
  | "dirty"
  | "validating"
  | "saving"
  | "saved"
  | "validation_failed"
  | "save_failed"
  | "stale_conflict";
const label = (value: string) =>
  value.replaceAll("_", " ").replaceAll(/([A-Z])/g, " $1");
const optional = (value: string) => value.trim() || undefined;
const isSafeUrl = (value: string) => !value || /^https?:\/\//i.test(value);
const completeProfile = (
  profile: ReturnType<typeof createEmptyIngredientKnowledgeProfile>,
) => {
  const empty = createEmptyIngredientKnowledgeProfile(
    profile.ingredientId,
    profile.createdAt,
  );
  return {
    ...empty,
    ...profile,
    identity: { ...empty.identity, ...profile.identity },
    physicalProperties: {
      ...empty.physicalProperties,
      ...profile.physicalProperties,
    },
    sensoryProfile: { ...empty.sensoryProfile, ...profile.sensoryProfile },
    predictionInputs: {
      ...empty.predictionInputs,
      ...profile.predictionInputs,
    },
  };
};

function ErrorText({ id, error }: { id: string; error?: string }) {
  return error ? (
    <small className="field-error" id={id} role="alert">
      {error}
    </small>
  ) : null;
}
function EvidenceLinks({
  recordId,
  selected,
  evidence,
  onChange,
  errors,
}: {
  recordId: string;
  selected: string[];
  evidence: IngredientKnowledgeEvidence[];
  onChange: (ids: string[]) => void;
  errors: Errors;
}) {
  return (
    <fieldset
      className="evidence-links"
      aria-describedby={`${recordId}-evidence-help ${recordId}-evidence-error`}
    >
      <legend>Linked evidence</legend>
      <small id={`${recordId}-evidence-help`}>
        Links stay directional and do not copy Evidence records.
      </small>
      {evidence.map((item) => (
        <label key={item.id}>
          <input
            type="checkbox"
            checked={selected.includes(item.id)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...selected, item.id]
                  : selected.filter((id) => id !== item.id),
              )
            }
          />
          <span>
            {item.title || "Untitled evidence"}{" "}
            <small>{label(item.sourceType)}</small>
          </span>
        </label>
      ))}
      {!evidence.length && (
        <p className="empty-copy">Add Evidence before linking it.</p>
      )}
      <ErrorText
        id={`${recordId}-evidence-error`}
        error={errors[`${recordId}.evidenceIds`]}
      />
    </fieldset>
  );
}
function KnowledgeField({
  id,
  labelText,
  field,
  onChange,
  type = "text",
  measured = false,
  options,
  errors,
}: {
  id: string;
  labelText: string;
  field: KnowledgeValue<unknown>;
  onChange: (value: KnowledgeValue<unknown>) => void;
  type?: "text" | "number" | "boolean";
  measured?: boolean;
  options?: string[];
  errors: Errors;
}) {
  const measurement = field as MeasuredKnowledgeValue,
    number = (value: string) => (value === "" ? undefined : Number(value)),
    errorId = `${id}-error`;
  return (
    <div className="knowledge-field">
      <label htmlFor={`${id}-state`}>{labelText}</label>
      <select
        id={`${id}-state`}
        value={field.state}
        aria-describedby={errors[id] ? errorId : undefined}
        onChange={(event) =>
          onChange(
            clearIncompatibleKnowledgeValue(
              field,
              event.target.value as KnowledgeState,
            ),
          )
        }
      >
        {knowledgeStates.map((item) => (
          <option key={item} value={item}>
            {label(item)}
          </option>
        ))}
      </select>
      {field.state === "known" && (
        <>
          {type === "boolean" ? (
            <label>
              Value
              <select
                id={`${id}-value`}
                value={field.value === undefined ? "" : String(field.value)}
                onChange={(event) =>
                  onChange({
                    ...field,
                    value:
                      event.target.value === ""
                        ? undefined
                        : event.target.value === "true",
                  })
                }
              >
                <option value="">Select…</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
          ) : options ? (
            <label>
              Value
              <select
                id={`${id}-value`}
                value={String(field.value ?? "")}
                onChange={(event) =>
                  onChange({ ...field, value: event.target.value || undefined })
                }
              >
                <option value="">Select…</option>
                {options.map((value) => (
                  <option key={value} value={value}>{label(value)}</option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Value
              <input
                id={`${id}-value`}
                type={type}
                step={type === "number" ? "any" : undefined}
                value={String(field.value ?? "")}
                onChange={(event) =>
                  onChange({
                    ...field,
                    value:
                      type === "number"
                        ? number(event.target.value)
                        : event.target.value,
                  })
                }
              />
            </label>
          )}
          {measured && (
            <>
              <label>
                Unit
                <input
                  id={`${id}-unit`}
                  value={measurement.unit ?? ""}
                  onChange={(event) =>
                    onChange({
                      ...measurement,
                      unit: optional(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Lower bound
                <input
                  id={`${id}-lower`}
                  type="number"
                  step="any"
                  value={measurement.lowerBound ?? ""}
                  onChange={(event) =>
                    onChange({
                      ...measurement,
                      lowerBound: number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Upper bound
                <input
                  id={`${id}-upper`}
                  type="number"
                  step="any"
                  value={measurement.upperBound ?? ""}
                  onChange={(event) =>
                    onChange({
                      ...measurement,
                      upperBound: number(event.target.value),
                    })
                  }
                />
              </label>
            </>
          )}
        </>
      )}
      <label>
        Confidence
        <select
          id={`${id}-confidence`}
          value={field.confidence}
          onChange={(event) =>
            onChange({
              ...field,
              confidence: event.target.value as KnowledgeConfidence,
            })
          }
        >
          {knowledgeConfidences.map((item) => (
            <option key={item}>{label(item)}</option>
          ))}
        </select>
      </label>
      <label>
        Source reference
        <input
          id={`${id}-source`}
          value={field.sourceReference ?? ""}
          onChange={(event) =>
            onChange({
              ...field,
              sourceReference: optional(event.target.value),
            })
          }
        />
      </label>
      <label>
        Context / notes
        <textarea
          id={`${id}-notes`}
          value={field.notes ?? ""}
          onChange={(event) =>
            onChange({ ...field, notes: optional(event.target.value) })
          }
        />
      </label>
      <ErrorText id={errorId} error={errors[id]} />
    </div>
  );
}

export function IngredientKnowledgePage() {
  const { ingredientId } = useParams(),
    data = useFormulaData(),
    ingredient = data.ingredients.find((item) => item.id === ingredientId);
  const existing = data.ingredientKnowledgeProfiles.find(
    (item) => item.ingredientId === ingredientId,
  );
  const initial = useMemo(
    () =>
      structuredClone(
        completeProfile(
          existing ?? createEmptyIngredientKnowledgeProfile(ingredientId ?? ""),
        ),
      ),
    [existing, ingredientId],
  );
  const [profile, setProfile] = useState(initial),
    [roles, setRoles] = useState(() =>
      structuredClone(
        data.ingredientKnowledgeRoles.filter(
          (item) => item.ingredientKnowledgeProfileId === initial.id,
        ),
      ),
    ),
    [compatibility, setCompatibility] = useState(() =>
      structuredClone(
        data.ingredientKnowledgeCompatibility.filter(
          (item) => item.ingredientKnowledgeProfileId === initial.id,
        ),
      ),
    ),
    [evidence, setEvidence] = useState(() =>
      structuredClone(
        data.ingredientKnowledgeEvidence.filter(
          (item) => item.ingredientKnowledgeProfileId === initial.id,
        ),
      ),
    );
  const initialAggregate = useMemo<IngredientKnowledgeAggregate>(
    () => ({
      profile: initial,
      roles: structuredClone(
        data.ingredientKnowledgeRoles.filter(
          (item) => item.ingredientKnowledgeProfileId === initial.id,
        ),
      ),
      compatibility: structuredClone(
        data.ingredientKnowledgeCompatibility.filter(
          (item) => item.ingredientKnowledgeProfileId === initial.id,
        ),
      ),
      evidence: structuredClone(
        data.ingredientKnowledgeEvidence.filter(
          (item) => item.ingredientKnowledgeProfileId === initial.id,
        ),
      ),
    }),
    [
      data.ingredientKnowledgeCompatibility,
      data.ingredientKnowledgeEvidence,
      data.ingredientKnowledgeRoles,
      initial,
    ],
  );
  const [baseline, setBaseline] = useState(() =>
    structuredClone(initialAggregate),
  );
  const [tab, setTab] = useState<Tab>("Overview"),
    [errors, setErrors] = useState<Errors>({}),
    [saveState, setSaveState] = useState<SaveState>("idle");
  const firstInvalid = useRef<string | undefined>(undefined);
  const aggregate = { profile, roles, compatibility, evidence },
    dirty = !ingredientKnowledgeAggregatesEqual(aggregate, baseline);
  const effectiveSaveState: SaveState = [
    "validating",
    "saving",
    "validation_failed",
    "save_failed",
    "stale_conflict",
  ].includes(saveState)
    ? saveState
    : dirty
      ? "dirty"
      : saveState;
  const blocker = useUnsavedIngredientKnowledgeGuard(dirty);
  if (!ingredient)
    return (
      <div className="empty-state">
        <h1>Ingredient not found</h1>
      </div>
    );
  const summary = knowledgeCompleteness(profile);
  const updateSection = (
    section:
      | "identity"
      | "physicalProperties"
      | "sensoryProfile"
      | "predictionInputs",
    key: string,
    value: KnowledgeValue<unknown>,
  ) =>
    setProfile((current) => ({
      ...current,
      [section]: { ...current[section], [key]: value },
    }));
  const updateRole = (index: number, patch: Partial<IngredientKnowledgeRole>) =>
    setRoles((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  const updateCompatibility = (
    index: number,
    patch: Partial<IngredientKnowledgeCompatibility>,
  ) =>
    setCompatibility((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  const updateEvidence = (
    index: number,
    patch: Partial<IngredientKnowledgeEvidence>,
  ) =>
    setEvidence((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  const addRole = () => {
    const now = new Date().toISOString();
    setRoles((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        ingredientKnowledgeProfileId: profile.id,
        role: "other",
        level: "context_dependent",
        context: "",
        evidenceIds: [],
        confidence: "unknown",
        notes: "",
        createdAt: now,
        updatedAt: now,
      },
    ]);
  };
  const addCompatibility = () => {
    const now = new Date().toISOString();
    setCompatibility((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        ingredientKnowledgeProfileId: profile.id,
        targetType: "ingredient",
        targetLabel: "",
        context: "",
        rating: "unknown",
        evidenceIds: [],
        confidence: "unknown",
        notes: "",
        createdAt: now,
        updatedAt: now,
      },
    ]);
  };
  const addEvidence = () => {
    const now = new Date().toISOString();
    setEvidence((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        ingredientKnowledgeProfileId: profile.id,
        sourceType: "unknown",
        provenance: "user",
        title: "",
        summary: "",
        notes: "",
        confidence: "unknown",
        createdAt: now,
        updatedAt: now,
      },
    ]);
  };
  const deleteEvidence = (id: string) => {
    const roleLinks = roles.filter((item) => item.evidenceIds.includes(id)),
      compatibilityLinks = compatibility.filter((item) =>
        item.evidenceIds.includes(id),
      );
    if (roleLinks.length || compatibilityLinks.length) {
      setTab("Evidence");
      setErrors((current) => ({
        ...current,
        [`${id}.delete`]: `Remove links from ${roleLinks.length} Role and ${compatibilityLinks.length} Compatibility record(s) before deleting this Evidence.`,
      }));
      return;
    }
    setEvidence((current) => current.filter((item) => item.id !== id));
  };
  const validate = () => {
    const aggregate = { profile, roles, compatibility, evidence },
      domainErrors = validateIngredientKnowledgeAggregate(
        aggregate,
        data.ingredients.map((item) => item.id),
      ),
      next: Errors = {};
    for (const [key, value] of Object.entries(profile.identity)) {
      const issue = validateKnowledgeValue(value)[0];
      if (issue) next[`identity-${key}`] = issue;
    }
    for (const [key, value] of Object.entries(profile.physicalProperties)) {
      const issue = (
        measuredPhysicalPropertyNames as readonly string[]
      ).includes(key)
        ? validateMeasuredValue(value as MeasuredKnowledgeValue)[0]
        : validateKnowledgeValue(value)[0];
      if (issue) next[`physical-${key}`] = issue;
    }
    for (const [key, value] of Object.entries(profile.sensoryProfile)) {
      const issue = validateSensoryValue(value)[0];
      if (issue) next[`sensory-${key}`] = issue;
    }
    for (const [key, value] of Object.entries(profile.predictionInputs)) {
      const issue = validateKnowledgeValue(value)[0];
      if (issue) next[`prediction-${key}`] = issue;
    }
    for (const [index, item] of roles.entries()) {
      if (!roleNames.includes(item.role))
        next[`role-${index}.role`] = "Select a valid role.";
      if (!roleLevels.includes(item.level))
        next[`role-${index}.level`] = "Select a valid role level.";
      if (!item.context.trim())
        next[`role-${index}.context`] = "Context is required.";
      if (
        item.evidenceIds.some(
          (id) => !evidence.some((record) => record.id === id),
        )
      )
        next[`role-${index}.evidenceIds`] =
          "A linked Evidence record is unavailable.";
      if (
        roles.some(
          (other, i) =>
            i < index &&
            other.role === item.role &&
            other.level === item.level &&
            other.context.trim() === item.context.trim(),
        )
      )
        next[`role-${index}.context`] =
          "This role, level, and context combination already exists.";
    }
    for (const [index, item] of compatibility.entries()) {
      if (!targetTypes.includes(item.targetType))
        next[`compatibility-${index}.targetType`] =
          "Select a valid target type.";
      if (item.targetType === "ingredient" && !item.targetId)
        next[`compatibility-${index}.target`] =
          "Select a Workspace Ingredient.";
      if (item.targetId === ingredient.id)
        next[`compatibility-${index}.target`] =
          "An Ingredient cannot target itself.";
      if (item.targetType !== "ingredient" && !item.targetLabel.trim())
        next[`compatibility-${index}.target`] =
          "Enter a user-defined target label.";
      if (!ratings.includes(item.rating))
        next[`compatibility-${index}.rating`] = "Select a valid rating.";
      if (
        item.evidenceIds.some(
          (id) => !evidence.some((record) => record.id === id),
        )
      )
        next[`compatibility-${index}.evidenceIds`] =
          "A linked Evidence record is unavailable.";
      if (
        compatibility.some(
          (other, i) =>
            i < index &&
            other.targetType === item.targetType &&
            (other.targetId ?? "") === (item.targetId ?? "") &&
            other.targetLabel.trim() === item.targetLabel.trim() &&
            other.context.trim() === item.context.trim(),
        )
      )
        next[`compatibility-${index}.target`] =
          "This directional compatibility relationship already exists.";
    }
    for (const [index, item] of evidence.entries()) {
      if (!sourceTypes.includes(item.sourceType))
        next[`evidence-${index}.sourceType`] = "Select a valid source type.";
      if (!item.title.trim())
        next[`evidence-${index}.title`] = "Evidence title is required.";
      if (
        item.evidenceDate &&
        Number.isNaN(Date.parse(`${item.evidenceDate}T00:00:00Z`))
      )
        next[`evidence-${index}.evidenceDate`] = "Enter a valid date.";
      if (item.externalUrl && !isSafeUrl(item.externalUrl))
        next[`evidence-${index}.externalUrl`] =
          "Only http:// or https:// URLs are supported. Use Document identifier for other references.";
    }
    if (Object.keys(next).length || domainErrors.length)
      next.summary =
        domainErrors[0] ??
        "Some fields need attention. Open the affected section and correct the highlighted controls.";
    setErrors(next);
    firstInvalid.current = Object.keys(next).find((key) => key !== "summary");
    if (firstInvalid.current) {
      const id = firstInvalid.current.split(".")[0];
      requestAnimationFrame(() => {
        const control =
          document.getElementById(id) ??
          document.getElementById(`${id}-state`) ??
          document.querySelector<HTMLElement>(`[id^="${id}-"]`);
        control?.focus();
      });
    }
    return !Object.keys(next).length;
  };
  const save = async () => {
    if (
      effectiveSaveState === "saving" ||
      effectiveSaveState === "validating" ||
      !dirty
    )
      return;
    setErrors({});
    setSaveState("validating");
    if (!validate()) {
      setSaveState("validation_failed");
      return;
    }
    setSaveState("saving");
    try {
      const updated = {
          ...profile,
          updatedAt: new Date().toISOString(),
          lastEditedSource: "user" as const,
        },
        saved = { profile: updated, roles, compatibility, evidence };
      await data.saveIngredientKnowledge(saved);
      setProfile(updated);
      setBaseline(structuredClone(saved));
      setErrors({});
      setSaveState("saved");
    } catch (cause) {
      const safe = safeIngredientKnowledgeError(cause);
      setErrors({ summary: safe.message });
      setSaveState(safe.kind);
    }
  };
  const statusText: Record<SaveState, string> = {
    idle: "No unsaved changes.",
    dirty: "Unsaved changes.",
    validating: "Checking Ingredient Knowledge…",
    saving: "Saving the complete Ingredient Knowledge aggregate…",
    saved:
      "Saved. This does not imply verification, approval, safety, compliance, or readiness.",
    validation_failed:
      "Not saved. Correct the highlighted validation issues; your changes remain.",
    save_failed: "Save failed. Your changes remain visible.",
    stale_conflict:
      "Stale-write conflict. Remote data was not overwritten and your local changes remain visible.",
  };
  return (
    <>
      <UnsavedChangesDialog
        open={blocker.state === "blocked"}
        onStay={() => blocker.reset?.()}
        onDiscard={() => blocker.proceed?.()}
      />
      <Link className="back-link" to={`/ingredients/${ingredient.id}`}>
        <ArrowLeft size={14} />
        Ingredient detail
      </Link>
      <PageHeader
        eyebrow="Ingredient Knowledge / Evidence-aware workspace"
        title={ingredient.commonName}
        description="Structured knowledge enriches this Workspace Ingredient. Unknown remains explicit; no safety, efficacy, compliance, stability, or formulation approval is implied."
        action={
          <button
            className="button primary"
            disabled={
              !dirty ||
              effectiveSaveState === "saving" ||
              effectiveSaveState === "validating"
            }
            onClick={() => void save()}
          >
            <Save size={15} />
            {effectiveSaveState === "saving" ? "Saving…" : "Save knowledge"}
          </button>
        }
      />
      <p
        className={`knowledge-save-status ${effectiveSaveState}`}
        role="status"
        aria-live="polite"
      >
        {statusText[effectiveSaveState]}
      </p>
      <nav
        className="knowledge-tabs"
        aria-label="Ingredient Knowledge sections"
      >
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            aria-current={tab === item ? "page" : undefined}
            className={tab === item ? "active" : ""}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </nav>
      {errors.summary && (
        <div className="form-error" role="alert" aria-live="assertive">
          <strong>
            {effectiveSaveState === "stale_conflict"
              ? "Remote change detected"
              : "Review the highlighted fields."}
          </strong>
          <p>{errors.summary}</p>
          {effectiveSaveState === "stale_conflict" && (
            <p>
              Reload the page to discard local changes and load the latest
              record, or keep these edits visible while you reconcile them
              manually.
            </p>
          )}
        </div>
      )}
      {tab === "Overview" && (
        <div className="ingredient-detail-grid">
          <section className="panel">
            <SectionHeader
              title="Knowledge completeness"
              detail="Completion only—not truth, safety, or quality"
            />
            <strong className="knowledge-percent">{summary.percentage}%</strong>
            <p>
              {summary.known} of {summary.total} bounded fields are known or
              explicitly not applicable.
            </p>
            <StatusPill tone={summary.reviewRequired ? "amber" : "neutral"}>
              {summary.reviewRequired} review items
            </StatusPill>
          </section>
          <section className="panel">
            <SectionHeader
              title="Future model inputs"
              detail="Structured placeholders only"
            />
            <p>
              {
                predictionInputNames.filter(
                  (key) => profile.predictionInputs[key].state === "known",
                ).length
              }{" "}
              supported inputs recorded; all others remain unknown.
            </p>
            <small>
              No formula-level output, recommendation, confidence percentage, or
              prediction is calculated.
            </small>
          </section>
        </div>
      )}
      {tab === "Identity" && (
        <section className="panel knowledge-section">
          <SectionHeader
            title="Identity and documentation"
            detail="Reference and supplier-specific facts must retain their source"
          />
          <div className="knowledge-grid">
            {Object.entries(profile.identity).map(([key, value]) => (
              <KnowledgeField
                key={key}
                id={`identity-${key}`}
                labelText={label(key)}
                field={value}
                errors={errors}
                type={
                  ["veganStatus", "organicStatus"].includes(key)
                    ? "boolean"
                    : "text"
                }
                onChange={(next) => updateSection("identity", key, next)}
              />
            ))}
          </div>
        </section>
      )}
      {tab === "Physical" && (
        <section className="panel knowledge-section">
          <SectionHeader
            title="Physical properties"
            detail="Measurement conditions, grade, and lot uncertainty stay explicit"
          />
          <div className="knowledge-grid">
            {Object.entries(profile.physicalProperties).map(([key, value]) => (
              <KnowledgeField
                key={key}
                id={`physical-${key}`}
                labelText={label(key)}
                field={value}
                errors={errors}
                type={
                  (measuredPhysicalPropertyNames as readonly string[]).includes(
                    key,
                  )
                    ? "number"
                    : "text"
                }
                measured={(
                  measuredPhysicalPropertyNames as readonly string[]
                ).includes(key)}
                options={
                  key === "physicalForm"
                    ? [
                        "liquid",
                        "semi_solid",
                        "solid",
                        "powder",
                        "wax",
                        "paste",
                        "granules",
                        "unknown",
                      ]
                    : undefined
                }
                onChange={(next) =>
                  updateSection("physicalProperties", key, next)
                }
              />
            ))}
          </div>
        </section>
      )}
      {tab === "Sensory" && (
        <section className="panel knowledge-section">
          <SectionHeader
            title="Sensory profile"
            detail="0–10 contextual observations; unknown is distinct from zero"
          />
          <div className="knowledge-grid">
            {sensoryDimensions.map((key) => (
              <KnowledgeField
                key={key}
                id={`sensory-${key}`}
                labelText={label(key)}
                field={profile.sensoryProfile[key]}
                errors={errors}
                type="number"
                onChange={(next) => updateSection("sensoryProfile", key, next)}
              />
            ))}
          </div>
        </section>
      )}
      {tab === "Functions" && (
        <section className="panel knowledge-section">
          <SectionHeader
            title="Functional profile"
            detail="Roles describe supported context—not efficacy"
            action={
              <button className="text-button" onClick={addRole}>
                <Plus size={14} />
                Add role
              </button>
            }
          />
          {!roles.length && (
            <p className="empty-copy">No functional roles recorded.</p>
          )}
          {roles.map((item, index) => {
            const base = `role-${index}`;
            return (
              <article className="knowledge-card" key={item.id}>
                <header>
                  <strong>{label(item.role)}</strong>
                  <StatusPill
                    tone={
                      item.confidence === "conflicting" ? "amber" : "neutral"
                    }
                  >
                    {label(item.confidence)}
                  </StatusPill>
                </header>
                <div className="knowledge-card-grid">
                  <label htmlFor={`${base}-role`}>
                    Role
                    <select
                      id={`${base}-role`}
                      value={item.role}
                      aria-describedby={`${base}-role-error`}
                      onChange={(event) =>
                        updateRole(index, {
                          role: event.target
                            .value as IngredientKnowledgeRoleName,
                        })
                      }
                    >
                      {roleNames.map((value) => (
                        <option key={value} value={value}>{label(value)}</option>
                      ))}
                    </select>
                    <ErrorText
                      id={`${base}-role-error`}
                      error={errors[`${base}.role`]}
                    />
                  </label>
                  <label htmlFor={`${base}-level`}>
                    Role level
                    <select
                      id={`${base}-level`}
                      value={item.level}
                      aria-describedby={`${base}-level-error`}
                      onChange={(event) =>
                        updateRole(index, {
                          level: event.target
                            .value as IngredientKnowledgeRoleLevel,
                        })
                      }
                    >
                      {roleLevels.map((value) => (
                        <option key={value} value={value}>{label(value)}</option>
                      ))}
                    </select>
                    <ErrorText
                      id={`${base}-level-error`}
                      error={errors[`${base}.level`]}
                    />
                  </label>
                  <label htmlFor={`${base}-confidence`}>
                    Confidence
                    <select
                      id={`${base}-confidence`}
                      value={item.confidence}
                      onChange={(event) =>
                        updateRole(index, {
                          confidence: event.target.value as KnowledgeConfidence,
                        })
                      }
                    >
                      {knowledgeConfidences.map((value) => (
                        <option key={value} value={value}>{label(value)}</option>
                      ))}
                    </select>
                  </label>
                  <label htmlFor={`${base}-context`}>
                    Context
                    <input
                      id={`${base}-context`}
                      value={item.context}
                      aria-describedby={`${base}-context-error`}
                      onChange={(event) =>
                        updateRole(index, { context: event.target.value })
                      }
                    />
                    <ErrorText
                      id={`${base}-context-error`}
                      error={errors[`${base}.context`]}
                    />
                  </label>
                  <label className="wide" htmlFor={`${base}-notes`}>
                    Notes
                    <textarea
                      id={`${base}-notes`}
                      value={item.notes}
                      onChange={(event) =>
                        updateRole(index, { notes: event.target.value })
                      }
                    />
                  </label>
                </div>
                <EvidenceLinks
                  recordId={base}
                  selected={item.evidenceIds}
                  evidence={evidence}
                  errors={errors}
                  onChange={(evidenceIds) => updateRole(index, { evidenceIds })}
                />
                <button
                  className="text-button danger"
                  aria-label={`Delete role ${label(item.role)}`}
                  onClick={() =>
                    setRoles((current) =>
                      current.filter((record) => record.id !== item.id),
                    )
                  }
                >
                  <Trash2 size={14} />
                  Delete role
                </button>
              </article>
            );
          })}
        </section>
      )}
      {tab === "Compatibility" && (
        <section className="panel knowledge-section">
          <SectionHeader
            title="Compatibility evidence"
            detail="Directional contextual evidence—not approval or an automatic pairing"
            action={
              <button className="text-button" onClick={addCompatibility}>
                <Plus size={14} />
                Add relationship
              </button>
            }
          />
          {!compatibility.length && (
            <p className="empty-copy">
              No directional compatibility relationships recorded.
            </p>
          )}
          {compatibility.map((item, index) => {
            const base = `compatibility-${index}`,
              ingredientTarget = data.ingredients.find(
                (record) => record.id === item.targetId,
              );
            return (
              <article className="knowledge-card" key={item.id}>
                <header>
                  <strong>
                    {item.targetType === "ingredient"
                      ? (ingredientTarget?.commonName ??
                        "Ingredient target missing")
                      : item.targetLabel || "User-defined target"}
                  </strong>
                  <span>Direction: {ingredient.commonName} → target</span>
                </header>
                <div className="knowledge-card-grid">
                  <label htmlFor={`${base}-type`}>
                    Target type
                    <select
                      id={`${base}-type`}
                      value={item.targetType}
                      aria-describedby={`${base}-type-error`}
                      onChange={(event) =>
                        updateCompatibility(index, {
                          targetType: event.target
                            .value as CompatibilityTargetType,
                          targetId: undefined,
                          targetLabel: "",
                        })
                      }
                    >
                      {targetTypes.map((value) => (
                        <option key={value} value={value}>{label(value)}</option>
                      ))}
                    </select>
                    <ErrorText
                      id={`${base}-type-error`}
                      error={errors[`${base}.targetType`]}
                    />
                  </label>
                  {item.targetType === "ingredient" ? (
                    <label htmlFor={`${base}-target`}>
                      Canonical Workspace Ingredient
                      <select
                        id={`${base}-target`}
                        value={item.targetId ?? ""}
                        aria-describedby={`${base}-target-error`}
                        onChange={(event) => {
                          const target = data.ingredients.find(
                            (record) => record.id === event.target.value,
                          );
                          updateCompatibility(index, {
                            targetId: target?.id,
                            targetLabel: target?.commonName ?? "",
                          });
                        }}
                      >
                        <option value="">Select Ingredient…</option>
                        {data.ingredients
                          .filter((record) => record.id !== ingredient.id)
                          .map((record) => (
                            <option key={record.id} value={record.id}>
                              {record.commonName} · {record.inciName}
                            </option>
                          ))}
                      </select>
                      <ErrorText
                        id={`${base}-target-error`}
                        error={errors[`${base}.target`]}
                      />
                    </label>
                  ) : (
                    <label htmlFor={`${base}-target`}>
                      User-defined target label
                      <input
                        id={`${base}-target`}
                        value={item.targetLabel}
                        aria-describedby={`${base}-target-error ${base}-target-help`}
                        onChange={(event) =>
                          updateCompatibility(index, {
                            targetLabel: event.target.value,
                            targetId: undefined,
                          })
                        }
                      />
                      <small id={`${base}-target-help`}>
                        User-defined label; not a verified catalog identity.
                      </small>
                      <ErrorText
                        id={`${base}-target-error`}
                        error={errors[`${base}.target`]}
                      />
                    </label>
                  )}
                  <label htmlFor={`${base}-rating`}>
                    Rating
                    <select
                      id={`${base}-rating`}
                      value={item.rating}
                      aria-describedby={`${base}-rating-error`}
                      onChange={(event) =>
                        updateCompatibility(index, {
                          rating: event.target.value as CompatibilityRating,
                        })
                      }
                    >
                      {ratings.map((value) => (
                        <option key={value} value={value}>{label(value)}</option>
                      ))}
                    </select>
                    <ErrorText
                      id={`${base}-rating-error`}
                      error={errors[`${base}.rating`]}
                    />
                  </label>
                  <label htmlFor={`${base}-confidence`}>
                    Confidence
                    <select
                      id={`${base}-confidence`}
                      value={item.confidence}
                      onChange={(event) =>
                        updateCompatibility(index, {
                          confidence: event.target.value as KnowledgeConfidence,
                        })
                      }
                    >
                      {knowledgeConfidences.map((value) => (
                        <option key={value} value={value}>{label(value)}</option>
                      ))}
                    </select>
                  </label>
                  <label htmlFor={`${base}-context`}>
                    Relationship context
                    <input
                      id={`${base}-context`}
                      value={item.context}
                      onChange={(event) =>
                        updateCompatibility(index, {
                          context: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="wide" htmlFor={`${base}-notes`}>
                    Notes
                    <textarea
                      id={`${base}-notes`}
                      value={item.notes}
                      onChange={(event) =>
                        updateCompatibility(index, {
                          notes: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
                <EvidenceLinks
                  recordId={base}
                  selected={item.evidenceIds}
                  evidence={evidence}
                  errors={errors}
                  onChange={(evidenceIds) =>
                    updateCompatibility(index, { evidenceIds })
                  }
                />
                <button
                  className="text-button danger"
                  aria-label={`Delete compatibility with ${item.targetLabel || "target"}`}
                  onClick={() =>
                    setCompatibility((current) =>
                      current.filter((record) => record.id !== item.id),
                    )
                  }
                >
                  <Trash2 size={14} />
                  Delete relationship
                </button>
              </article>
            );
          })}
        </section>
      )}
      {tab === "Evidence" && (
        <section className="panel knowledge-section">
          <SectionHeader
            title="Evidence register"
            detail="Sources and contextual observations remain distinguishable"
            action={
              <button className="text-button" onClick={addEvidence}>
                <Plus size={14} />
                Add evidence
              </button>
            }
          />
          {!evidence.length && (
            <p className="empty-copy">
              No Evidence records. Add traceable support before marking
              knowledge documented.
            </p>
          )}
          {evidence.map((item, index) => {
            const base = `evidence-${index}`,
              identifier = documentIdentifierDisplay(item.documentId);
            return (
              <article className="knowledge-card evidence-card" key={item.id}>
                <header>
                  <strong>{item.title || "New Evidence"}</strong>
                  <StatusPill
                    tone={
                      item.confidence === "conflicting" ? "amber" : "neutral"
                    }
                  >
                    {label(item.confidence)}
                  </StatusPill>
                </header>
                <div className="knowledge-card-grid">
                  <label htmlFor={`${base}-source`}>
                    Source type
                    <select
                      id={`${base}-source`}
                      value={item.sourceType}
                      aria-describedby={`${base}-source-error`}
                      onChange={(event) =>
                        updateEvidence(index, {
                          sourceType: event.target.value as EvidenceSourceType,
                        })
                      }
                    >
                      {sourceTypes.map((value) => (
                        <option key={value} value={value}>{label(value)}</option>
                      ))}
                    </select>
                    <ErrorText
                      id={`${base}-source-error`}
                      error={errors[`${base}.sourceType`]}
                    />
                  </label>
                  <label htmlFor={`${base}-provenance`}>
                    Provenance
                    <select
                      id={`${base}-provenance`}
                      value={item.provenance}
                      onChange={(event) =>
                        updateEvidence(index, {
                          provenance: event.target
                            .value as IngredientKnowledgeEvidence["provenance"],
                        })
                      }
                    >
                      {[
                        "reference",
                        "supplier_specific",
                        "internal",
                        "user",
                      ].map((value) => (
                        <option key={value} value={value}>{label(value)}</option>
                      ))}
                    </select>
                  </label>
                  <label htmlFor={`${base}-confidence`}>
                    Confidence
                    <select
                      id={`${base}-confidence`}
                      value={item.confidence}
                      onChange={(event) =>
                        updateEvidence(index, {
                          confidence: event.target.value as KnowledgeConfidence,
                        })
                      }
                    >
                      {knowledgeConfidences.map((value) => (
                        <option key={value} value={value}>{label(value)}</option>
                      ))}
                    </select>
                  </label>
                  <label htmlFor={`${base}-title`}>
                    Title or document label
                    <input
                      id={`${base}-title`}
                      value={item.title}
                      aria-describedby={`${base}-title-error`}
                      onChange={(event) =>
                        updateEvidence(index, { title: event.target.value })
                      }
                    />
                    <ErrorText
                      id={`${base}-title-error`}
                      error={errors[`${base}.title`]}
                    />
                  </label>
                  <label htmlFor={`${base}-author`}>
                    Source organization or author
                    <input
                      id={`${base}-author`}
                      value={item.authorOrOrganisation ?? ""}
                      onChange={(event) =>
                        updateEvidence(index, {
                          authorOrOrganisation: optional(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label htmlFor={`${base}-document`}>
                    Document identifier
                    <input
                      id={`${base}-document`}
                      value={
                        identifier.kind === "hidden"
                          ? identifier.text
                          : (item.documentId ?? "")
                      }
                      aria-describedby={
                        identifier.kind === "hidden"
                          ? `${base}-document-help`
                          : undefined
                      }
                      onChange={(event) =>
                        updateEvidence(index, {
                          documentId: optional(event.target.value),
                        })
                      }
                    />
                    {identifier.kind === "hidden" && (
                      <small id={`${base}-document-help`}>
                        The stored legacy value is not displayed. Clear this
                        field or type a safe replacement.
                      </small>
                    )}
                  </label>
                  <label htmlFor={`${base}-revision`}>
                    Document revision
                    <input
                      id={`${base}-revision`}
                      value={item.documentRevision ?? ""}
                      onChange={(event) =>
                        updateEvidence(index, {
                          documentRevision: optional(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label htmlFor={`${base}-date`}>
                    Evidence date
                    <input
                      id={`${base}-date`}
                      type="date"
                      value={item.evidenceDate ?? ""}
                      aria-describedby={`${base}-date-error`}
                      onChange={(event) =>
                        updateEvidence(index, {
                          evidenceDate: optional(event.target.value),
                        })
                      }
                    />
                    <ErrorText
                      id={`${base}-date-error`}
                      error={errors[`${base}.evidenceDate`]}
                    />
                  </label>
                  <label className="wide" htmlFor={`${base}-url`}>
                    Safe external URL
                    <input
                      id={`${base}-url`}
                      type="url"
                      placeholder="https://…"
                      value={item.externalUrl ?? ""}
                      aria-describedby={`${base}-url-help ${base}-url-error`}
                      onChange={(event) =>
                        updateEvidence(index, {
                          externalUrl: optional(event.target.value),
                        })
                      }
                    />
                    <small id={`${base}-url-help`}>
                      Only public http(s) references. Private storage paths are
                      never shown.
                    </small>
                    <ErrorText
                      id={`${base}-url-error`}
                      error={errors[`${base}.externalUrl`]}
                    />
                  </label>
                  <label className="wide" htmlFor={`${base}-summary`}>
                    Summary or bounded excerpt
                    <textarea
                      id={`${base}-summary`}
                      value={item.summary}
                      onChange={(event) =>
                        updateEvidence(index, { summary: event.target.value })
                      }
                    />
                  </label>
                  <label className="wide" htmlFor={`${base}-notes`}>
                    Notes
                    <textarea
                      id={`${base}-notes`}
                      value={item.notes}
                      onChange={(event) =>
                        updateEvidence(index, { notes: event.target.value })
                      }
                    />
                  </label>
                </div>
                <ErrorText
                  id={`${base}-delete-error`}
                  error={errors[`${item.id}.delete`]}
                />
                <button
                  className="text-button danger"
                  aria-label={`Delete evidence ${item.title || "record"}`}
                  onClick={() => deleteEvidence(item.id)}
                >
                  <Trash2 size={14} />
                  Delete evidence
                </button>
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}
