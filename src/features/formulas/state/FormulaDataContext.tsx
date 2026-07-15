import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ComplianceDocument,
  ComplianceDossier,
  CostLine,
  FinishedGoodsBatch,
  FinishedGoodsMovement,
  Formula,
  FormulaLine,
  FormulaState,
  FormulaVersion,
  FormulaVersionStatus,
  Ingredient,
  InventoryLot,
  InventoryMovement,
  InventoryUnit,
  LabBatch,
  LabBatchAllocation,
  LabBatchLine,
  LabBatchStatus,
  LabObservation,
  LaunchPlan,
  PackagingAllocation,
  PackagingComponent,
  PackagingInventoryLot,
  PackagingInventoryMovement,
  PackagingSpecification,
  PackagingSpecificationLine,
  PackagingSpecificationStatus,
  PackagingSupplierProduct,
  PifSection,
  Product,
  ProductionRun,
  ProductionRunAllocation,
  ProductionRunLine,
  ProductionRunStatus,
  RegulatoryReview,
  SupplierProduct,
  TestResponse,
  TestSession,
  TestTemplate,
  Tester,
} from "../../../types/domain";
import { duplicateDossier as duplicateComplianceDossierDomain } from "../../compliance/domain/complianceLogic";
import { canTransition, duplicateVersion } from "../domain/formulaLogic";
import {
  generateLotNumber,
  validateMovement,
} from "../../inventory/domain/inventoryLogic";
import {
  canTransitionBatch,
  createBatchLines,
  generateBatchNumber,
  quantityVariance,
  validateAllocation,
} from "../../lab/domain/labLogic";
import {
  allocationCostSnapshot,
  canTransitionProduction,
  createProductionLines,
  generateProductionRunNumber,
  productionVariance,
  validateProductionAllocation,
} from "../../production/domain/productionLogic";
import {
  duplicatePackagingVersion as duplicatePackagingVersionDomain,
  generatePackagingLotNumber,
  packagingAllocationError,
  packagingLotUnitCost,
  packagingTransitions,
  validatePackagingMovement,
} from "../../packaging/domain/packagingLogic";
import {
  generateFinishedGoodsNumber,
  validateFinishedGoodsMovement,
  validateFinishedGoodsOutput,
} from "../../finished-goods/domain/finishedGoodsLogic";
import { LocalWorkspaceRepository } from "../../../platform/repository/localWorkspaceRepository";
import type { WorkspaceRepository } from "../../../platform/repository/workspaceRepository";
import { executeWorkspaceAction } from "../../../platform/actions/workspaceActionExecutor";
import type {
  WorkspaceActionName,
  WorkspaceStateMutation,
} from "../../../platform/actions/workspaceActions";

interface FormulaDataValue extends FormulaState {
  pendingActions: readonly WorkspaceActionName[];
  actionError?: string;
  createProduct(
    input: Omit<Product, "id" | "createdAt" | "updatedAt">,
  ): Product;
  updateProduct(id: string, patch: Partial<Product>): void;
  updateLine(
    versionId: string,
    lineId: string,
    patch: Partial<FormulaLine>,
  ): void;
  addLine(versionId: string, ingredientId: string): void;
  removeLine(versionId: string, lineId: string): void;
  moveLine(versionId: string, lineId: string, direction: -1 | 1): void;
  saveVersion(versionId: string, patch: Partial<FormulaVersion>): void;
  transitionVersion(versionId: string, status: FormulaVersionStatus): void;
  duplicateAsDraft(versionId: string): FormulaVersion | undefined;
  createFormula(productId: string, name: string, description: string): Formula;
  createIngredient(
    input: Omit<Ingredient, "id" | "createdAt" | "updatedAt">,
  ): Ingredient;
  updateIngredient(id: string, patch: Partial<Ingredient>): void;
  archiveIngredient(id: string): void;
  saveSupplierProduct(
    input: Omit<SupplierProduct, "id" | "createdAt" | "updatedAt"> & {
      id?: string;
    },
  ): SupplierProduct;
  markSupplierPreferred(id: string): void;
  receiveStock(
    input: Omit<
      InventoryLot,
      "id" | "internalLotNumber" | "createdAt" | "updatedAt" | "status"
    >,
  ): InventoryLot;
  addMovement(
    input: Omit<InventoryMovement, "id" | "createdAt">,
  ): InventoryMovement;
  createLabBatch(input: {
    productId: string;
    formulaId: string;
    formulaVersionId: string;
    plannedBatchSize: number;
    plannedBatchUnit: InventoryUnit;
    purpose: string;
    notes: string;
  }): LabBatch;
  updateBatchLine(id: string, patch: Partial<LabBatchLine>): void;
  addAllocation(lineId: string): void;
  updateAllocation(id: string, patch: Partial<LabBatchAllocation>): void;
  commitBatchConsumption(batchId: string): string[] | Promise<string[]>;
  transitionBatch(id: string, status: LabBatchStatus): void;
  updateLabBatch(id: string, patch: Partial<LabBatch>): void;
  addProcessStep(batchId: string, instruction: string): void;
  updateProcessStep(
    id: string,
    patch: Partial<FormulaState["processSteps"][number]>,
  ): void;
  addObservation(input: Omit<LabObservation, "id" | "createdAt">): void;
  createTester(displayName: string, notes: string): Tester;
  createTestTemplate(name: string, questions: string[]): TestTemplate;
  createTestSession(input: Omit<TestSession, "id" | "createdAt">): TestSession;
  addTestResponse(
    input: Omit<TestResponse, "id" | "submittedAt">,
  ): Promise<TestResponse>;
  updateInventoryLot(id: string, patch: Partial<InventoryLot>): void;
  createProductionRun(input: {
    productId: string;
    formulaId: string;
    formulaVersionId: string;
    plannedBatchSize: number;
    plannedBatchUnit: InventoryUnit;
    plannedUnits?: number;
    purpose: string;
    notes: string;
  }): ProductionRun;
  updateProductionRun(id: string, patch: Partial<ProductionRun>): void;
  transitionProductionRun(id: string, status: ProductionRunStatus): void;
  updateProductionLine(id: string, patch: Partial<ProductionRunLine>): void;
  addProductionAllocation(lineId: string): void;
  updateProductionAllocation(
    id: string,
    patch: Partial<ProductionRunAllocation>,
  ): void;
  commitProductionConsumption(runId: string): string[] | Promise<string[]>;
  addProductionStep(runId: string, instruction: string): void;
  updateProductionStep(
    id: string,
    patch: Partial<FormulaState["productionProcessSteps"][number]>,
  ): void;
  addCostLine(input: Omit<CostLine, "id" | "createdAt" | "updatedAt">): void;
  createPackagingComponent(
    input: Omit<PackagingComponent, "id" | "createdAt" | "updatedAt">,
  ): PackagingComponent;
  updatePackagingComponent(
    id: string,
    patch: Partial<PackagingComponent>,
  ): void;
  savePackagingSupplierProduct(
    input: Omit<PackagingSupplierProduct, "id" | "createdAt" | "updatedAt">,
  ): void;
  receivePackagingStock(
    input: Omit<
      PackagingInventoryLot,
      "id" | "internalLotNumber" | "status" | "createdAt" | "updatedAt"
    >,
  ): void;
  addPackagingMovement(
    input: Omit<PackagingInventoryMovement, "id" | "createdAt">,
  ): void;
  createPackagingSpecification(
    productId: string,
    name: string,
    description: string,
  ): PackagingSpecification;
  updatePackagingLine(
    id: string,
    patch: Partial<PackagingSpecificationLine>,
  ): void;
  addPackagingLine(versionId: string, componentId: string): void;
  transitionPackagingVersion(
    id: string,
    status: PackagingSpecificationStatus,
  ): void;
  duplicatePackagingVersion(id: string): void;
  createFinishedGoodsBatch(input: {
    productionRunId: string;
    quantity: number;
    packagingSpecificationVersionId?: string;
    productionDate: string;
    notes: string;
  }): Promise<FinishedGoodsBatch>;
  addPackagingAllocation(finishedGoodsBatchId: string, lineId: string): void;
  updatePackagingAllocation(
    id: string,
    patch: Partial<PackagingAllocation>,
  ): void;
  commitPackagingConsumption(
    finishedGoodsBatchId: string,
  ): string[] | Promise<string[]>;
  addFinishedGoodsMovement(
    input: Omit<FinishedGoodsMovement, "id" | "createdAt">,
  ): Promise<void>;
  createComplianceDossier(
    input: Pick<
      ComplianceDossier,
      | "productId"
      | "formulaVersionId"
      | "packagingSpecificationVersionId"
      | "targetMarket"
      | "targetLanguage"
      | "responsiblePersonId"
      | "internalOwner"
      | "notes"
    >,
  ): ComplianceDossier;
  duplicateComplianceDossier(
    id: string,
    formulaVersionId: string,
    packagingSpecificationVersionId?: string,
  ): ComplianceDossier | undefined;
  updateComplianceDossier(id: string, patch: Partial<ComplianceDossier>): void;
  createComplianceDocument(input: Omit<ComplianceDocument, "id" | "createdAt" | "updatedAt">): ComplianceDocument;
  updateComplianceDocument(id: string, patch: Partial<ComplianceDocument>): void;
  updateRegulatoryReview(id: string, patch: Partial<RegulatoryReview>): void;
  updatePifSection(id: string, patch: Partial<PifSection>): void;
  updateLaunchPlan(id: string, patch: Partial<LaunchPlan>): void;
  recordLaunchDecision(
    launchPlanId: string,
    decision: "Go" | "No-Go" | "Conditional Go" | "Deferred",
    notes: string,
  ): Promise<void> | undefined;
}
const FormulaDataContext = createContext<FormulaDataValue | null>(null);
const uid = () => crypto.randomUUID();
const defaultWorkspaceRepository = new LocalWorkspaceRepository();

export function FormulaDataProvider({
  children,
  repository = defaultWorkspaceRepository,
  initialState,
}: {
  children: React.ReactNode;
  repository?: WorkspaceRepository;
  initialState?: FormulaState;
}) {
  const loaded = useMemo(() => initialState ?? repository.load(), [initialState,repository]);
  if (loaded instanceof Promise)
    throw new Error(
      "Asynchronous repository hydration belongs to the Phase 8B.3 startup boundary.",
    );
  const [state, setState] = useState<FormulaState>(() => loaded);
  const stateRef = useRef(state);
  const [pendingActions, setPendingActions] = useState<WorkspaceActionName[]>(
    [],
  );
  const [actionError, setActionError] = useState<string>();
  const commitState = useCallback(
    (action: WorkspaceActionName, mutation: WorkspaceStateMutation) => {
      return executeWorkspaceAction(
        repository,
        stateRef.current,
        action,
        mutation,
        {
          committed(next) {
            stateRef.current = next;
            setState(next);
            setActionError(undefined);
          },
          failed(_action, error) {
            setActionError(error.message);
          },
          pending(name, pending) {
            setPendingActions((current) =>
              pending
                ? [...new Set([...current, name])]
                : current.filter((item) => item !== name),
            );
          },
        },
      );
    },
    [repository],
  );

  const value = useMemo<FormulaDataValue>(
    () => ({
      ...state,
      pendingActions,
      actionError,
      createProduct(input) {
        const now = new Date().toISOString();
        const product: Product = {
          ...input,
          id: uid(),
          createdAt: now,
          updatedAt: now,
        };
        commitState("createProduct", (current) => ({
          ...current,
          products: [...current.products, product],
        }));
        return product;
      },
      updateProduct(id, patch) {
        commitState("updateProduct", (current) => ({
          ...current,
          products: current.products.map((product) =>
            product.id === id
              ? {
                  ...product,
                  ...patch,
                  id,
                  updatedAt: new Date().toISOString(),
                }
              : product,
          ),
        }));
      },
      updateLine(versionId, lineId, patch) {
        commitState("updateLine", (current) => ({
          ...current,
          formulaLines: current.formulaLines.map((line) =>
            line.formulaVersionId === versionId && line.id === lineId
              ? { ...line, ...patch }
              : line,
          ),
          formulaVersions: current.formulaVersions.map((version) =>
            version.id === versionId
              ? { ...version, updatedAt: new Date().toISOString() }
              : version,
          ),
        }));
      },
      addLine(versionId, ingredientId) {
        commitState("addLine", (current) => ({
          ...current,
          formulaLines: [
            ...current.formulaLines,
            {
              id: uid(),
              formulaVersionId: versionId,
              ingredientId,
              percentage: 0,
              phase: "Phase A",
              sortOrder:
                current.formulaLines.filter(
                  (line) => line.formulaVersionId === versionId,
                ).length + 1,
              notes: "",
            },
          ],
        }));
      },
      removeLine(versionId, lineId) {
        commitState("removeLine", (current) => ({
          ...current,
          formulaLines: current.formulaLines.filter(
            (line) =>
              !(line.formulaVersionId === versionId && line.id === lineId),
          ),
        }));
      },
      moveLine(versionId, lineId, direction) {
        commitState("moveLine", (current) => {
          const lines = current.formulaLines
            .filter((line) => line.formulaVersionId === versionId)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          const index = lines.findIndex((line) => line.id === lineId);
          const target = index + direction;
          if (target < 0 || target >= lines.length) return current;
          [lines[index], lines[target]] = [lines[target], lines[index]];
          const orders = new Map(lines.map((line, i) => [line.id, i + 1]));
          return {
            ...current,
            formulaLines: current.formulaLines.map((line) =>
              line.formulaVersionId === versionId
                ? { ...line, sortOrder: orders.get(line.id)! }
                : line,
            ),
          };
        });
      },
      saveVersion(versionId, patch) {
        commitState("saveVersion", (current) => ({
          ...current,
          formulaVersions: current.formulaVersions.map((version) =>
            version.id === versionId && version.status === "Draft"
              ? { ...version, ...patch, updatedAt: new Date().toISOString() }
              : version,
          ),
        }));
      },
      transitionVersion(versionId, status) {
        commitState("transitionVersion", (current) => {
          const source = current.formulaVersions.find(
            (item) => item.id === versionId,
          );
          if (!source || !canTransition(source.status, status)) return current;
          const version = {
            ...source,
            status,
            approvedAt:
              status === "Approved"
                ? new Date().toISOString()
                : source.approvedAt,
            updatedAt: new Date().toISOString(),
          };
          return {
            ...current,
            formulaVersions: current.formulaVersions.map((item) =>
              item.id === versionId ? version : item,
            ),
            products: current.products.map((product) =>
              product.id !==
              current.formulas.find(
                (formula) => formula.id === source.formulaId,
              )?.productId
                ? product
                : {
                    ...product,
                    currentDevelopmentFormulaVersionId:
                      status === "Candidate"
                        ? versionId
                        : product.currentDevelopmentFormulaVersionId,
                    currentApprovedFormulaVersionId:
                      status === "Approved"
                        ? versionId
                        : product.currentApprovedFormulaVersionId,
                  },
            ),
          };
        });
      },
      duplicateAsDraft(versionId) {
        const source = state.formulaVersions.find(
          (item) => item.id === versionId,
        );
        if (!source) return;
        const result = duplicateVersion(
          source,
          state.formulaLines.filter(
            (line) => line.formulaVersionId === versionId,
          ),
          state.formulaVersions,
          uid,
        );
        commitState("duplicateAsDraft", (current) => ({
          ...current,
          formulaVersions: [...current.formulaVersions, result.version],
          formulaLines: [...current.formulaLines, ...result.lines],
        }));
        return result.version;
      },
      createFormula(productId, name, description) {
        const now = new Date().toISOString();
        const formula: Formula = {
          id: uid(),
          productId,
          name,
          description,
          createdAt: now,
          updatedAt: now,
        };
        const version: FormulaVersion = {
          id: uid(),
          formulaId: formula.id,
          version: "v0.1",
          status: "Draft",
          description: "Initial formula version.",
          targetCharacteristics: "",
          createdAt: now,
          updatedAt: now,
        };
        commitState("createFormula", (current) => ({
          ...current,
          formulas: [...current.formulas, formula],
          formulaVersions: [...current.formulaVersions, version],
        }));
        return formula;
      },
      createIngredient(input) {
        const now = new Date().toISOString();
        const ingredient = {
          ...input,
          id: uid(),
          createdAt: now,
          updatedAt: now,
        };
        commitState("createIngredient", (current) => ({
          ...current,
          ingredients: [...current.ingredients, ingredient],
        }));
        return ingredient;
      },
      updateIngredient(id, patch) {
        commitState("updateIngredient", (current) => ({
          ...current,
          ingredients: current.ingredients.map((item) =>
            item.id === id
              ? { ...item, ...patch, id, updatedAt: new Date().toISOString() }
              : item,
          ),
        }));
      },
      archiveIngredient(id) {
        commitState("archiveIngredient", (current) => ({
          ...current,
          ingredients: current.ingredients.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "Archived",
                  updatedAt: new Date().toISOString(),
                }
              : item,
          ),
        }));
      },
      saveSupplierProduct(input) {
        const now = new Date().toISOString();
        const product: SupplierProduct = {
          ...input,
          id: input.id ?? uid(),
          createdAt: now,
          updatedAt: now,
        };
        commitState("saveSupplierProduct", (current) => ({
          ...current,
          supplierProducts: input.id
            ? current.supplierProducts.map((item) =>
                item.id === input.id
                  ? { ...product, createdAt: item.createdAt }
                  : item,
              )
            : [...current.supplierProducts, product],
        }));
        return product;
      },
      markSupplierPreferred(id) {
        commitState("markSupplierPreferred", (current) => {
          const selected = current.supplierProducts.find(
            (item) => item.id === id,
          );
          if (!selected) return current;
          return {
            ...current,
            supplierProducts: current.supplierProducts.map((item) =>
              item.ingredientId === selected.ingredientId
                ? {
                    ...item,
                    isPreferred: item.id === id,
                    updatedAt: new Date().toISOString(),
                  }
                : item,
            ),
          };
        });
      },
      receiveStock(input) {
        const now = new Date().toISOString();
        if (
          !Number.isFinite(input.openingQuantity) ||
          input.openingQuantity <= 0
        )
          throw new Error("Opening quantity must be greater than zero.");
        const lot: InventoryLot = {
          ...input,
          id: uid(),
          internalLotNumber: generateLotNumber(
            state.inventoryLots.map((item) => item.internalLotNumber),
            new Date(`${input.receivedDate}T12:00:00`),
          ),
          status: "Active",
          createdAt: now,
          updatedAt: now,
        };
        const receipt: InventoryMovement = {
          id: uid(),
          inventoryLotId: lot.id,
          type: "Receipt",
          quantity: lot.openingQuantity,
          unit: lot.unit,
          reason: "Stock received",
          notes: "Initial receipt recorded with lot creation.",
          occurredAt: `${input.receivedDate}T12:00:00.000Z`,
          createdAt: now,
        };
        commitState("receiveStock", (current) => ({
          ...current,
          inventoryLots: [...current.inventoryLots, lot],
          inventoryMovements: [...current.inventoryMovements, receipt],
        }));
        return lot;
      },
      addMovement(input) {
        const lot = state.inventoryLots.find(
          (item) => item.id === input.inventoryLotId,
        );
        if (!lot) throw new Error("Inventory lot not found.");
        const error = validateMovement(lot, state.inventoryMovements, input);
        if (error) throw new Error(error);
        const movement = {
          ...input,
          id: uid(),
          createdAt: new Date().toISOString(),
        };
        commitState("addMovement", (current) => ({
          ...current,
          inventoryMovements: [...current.inventoryMovements, movement],
        }));
        return movement;
      },
      createLabBatch(input) {
        const now = new Date().toISOString();
        const product = state.products.find((p) => p.id === input.productId);
        const version = state.formulaVersions.find(
          (v) => v.id === input.formulaVersionId,
        );
        if (!product || !version || version.formulaId !== input.formulaId)
          throw new Error("Select a valid product, formula, and version.");
        if (version.status === "Retired")
          throw new Error(
            "Retired versions require a deliberate historical workflow.",
          );
        if (
          !Number.isFinite(input.plannedBatchSize) ||
          input.plannedBatchSize <= 0
        )
          throw new Error("Planned size must be greater than zero.");
        const id = uid();
        const batch: LabBatch = {
          ...input,
          id,
          batchNumber: generateBatchNumber(
            product.name,
            state.labBatches.map((b) => b.batchNumber),
            new Date(),
          ),
          status: "Planned",
          createdAt: now,
          updatedAt: now,
          summary: "",
          targetCharacteristics: version.targetCharacteristics,
        };
        const lines = createBatchLines(
          id,
          state.formulaLines.filter((l) => l.formulaVersionId === version.id),
          state.ingredients,
          input.plannedBatchSize,
          input.plannedBatchUnit,
          uid,
        );
        const steps = version.processInstructions
          ? [
              {
                id: uid(),
                labBatchId: id,
                stepNumber: 1,
                instruction: version.processInstructions,
                status: "Pending" as const,
                notes: "",
              },
            ]
          : [];
        commitState("createLabBatch", (current) => ({
          ...current,
          labBatches: [...current.labBatches, batch],
          labBatchLines: [...current.labBatchLines, ...lines],
          processSteps: [...current.processSteps, ...steps],
        }));
        return batch;
      },
      updateBatchLine(id, patch) {
        commitState("updateBatchLine", (current) => {
          const line = current.labBatchLines.find((l) => l.id === id);
          const batch = current.labBatches.find(
            (b) => b.id === line?.labBatchId,
          );
          if (
            !line ||
            !batch ||
            batch.status === "Completed" ||
            batch.status === "Archived"
          )
            return current;
          const next = { ...line, ...patch };
          if (patch.actualQuantity !== undefined)
            next.variance = quantityVariance(
              patch.actualQuantity,
              line.plannedQuantity,
            );
          return {
            ...current,
            labBatchLines: current.labBatchLines.map((l) =>
              l.id === id ? next : l,
            ),
          };
        });
      },
      addAllocation(lineId) {
        const line = state.labBatchLines.find((l) => l.id === lineId);
        if (!line) return;
        commitState("addAllocation", (current) => ({
          ...current,
          labBatchAllocations: [
            ...current.labBatchAllocations,
            { id: uid(), labBatchLineId: lineId, quantity: 0, unit: line.unit },
          ],
        }));
      },
      updateAllocation(id, patch) {
        commitState("updateAllocation", (current) => ({
          ...current,
          labBatchAllocations: current.labBatchAllocations.map((a) =>
            a.id === id && !a.inventoryMovementId ? { ...a, ...patch } : a,
          ),
        }));
      },
      commitBatchConsumption(batchId) {
        const lines = state.labBatchLines.filter(
          (l) => l.labBatchId === batchId,
        );
        const allocations = state.labBatchAllocations.filter(
          (a) =>
            lines.some((l) => l.id === a.labBatchLineId) &&
            !a.inventoryMovementId,
        );
        const errors: string[] = [];
        if (!allocations.length)
          return ["No uncommitted lot allocations remain."];
        for (const line of lines.filter((item) => item.status === "Weighed")) {
          const allocated = allocations
            .filter((a) => a.labBatchLineId === line.id)
            .reduce((sum, a) => sum + a.quantity, 0);
          if (
            line.actualQuantity != null &&
            Math.abs(allocated - line.actualQuantity) > 0.0001
          )
            errors.push(
              `${line.ingredientNameSnapshot}: allocations must total the actual quantity (${line.actualQuantity} ${line.unit}).`,
            );
        }
        if (errors.length) return errors;
        const newMovements: InventoryMovement[] = [];
        const movementByAllocation = new Map<string, string>();
        for (const allocation of allocations) {
          const line = lines.find((l) => l.id === allocation.labBatchLineId)!;
          const lot = state.inventoryLots.find(
            (l) => l.id === allocation.inventoryLotId,
          );
          if (!lot) {
            errors.push(
              `${line.ingredientNameSnapshot}: select an inventory lot.`,
            );
            continue;
          }
          const error = validateAllocation(line, allocation, lot, [
            ...state.inventoryMovements,
            ...newMovements,
          ]);
          if (error) {
            errors.push(`${line.ingredientNameSnapshot}: ${error}`);
            continue;
          }
          const movementId = uid();
          newMovements.push({
            id: movementId,
            inventoryLotId: lot.id,
            type: "Consumption",
            quantity: allocation.quantity,
            unit: allocation.unit,
            reason: `Lab batch ${state.labBatches.find((b) => b.id === batchId)?.batchNumber}`,
            referenceType: "LabBatch",
            referenceId: batchId,
            notes: line.notes,
            occurredAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          });
          movementByAllocation.set(allocation.id, movementId);
        }
        if (errors.length) return errors;
        return commitState("commitBatchConsumption", (current) => ({
          ...current,
          inventoryMovements: [...current.inventoryMovements, ...newMovements],
          labBatchAllocations: current.labBatchAllocations.map((a) =>
            movementByAllocation.has(a.id)
              ? { ...a, inventoryMovementId: movementByAllocation.get(a.id) }
              : a,
          ),
        })).then(() => []);
      },
      transitionBatch(id, status) {
        commitState("transitionBatch", (current) => {
          const batch = current.labBatches.find((b) => b.id === id);
          if (!batch || !canTransitionBatch(batch.status, status))
            return current;
          const now = new Date().toISOString();
          return {
            ...current,
            labBatches: current.labBatches.map((b) =>
              b.id === id
                ? {
                    ...b,
                    status,
                    startedAt: status === "In Progress" ? now : b.startedAt,
                    completedAt: status === "Completed" ? now : b.completedAt,
                    updatedAt: now,
                  }
                : b,
            ),
          };
        });
      },
      updateLabBatch(id, patch) {
        commitState("updateLabBatch", (current) => ({
          ...current,
          labBatches: current.labBatches.map((b) =>
            b.id === id && !["Completed", "Archived"].includes(b.status)
              ? { ...b, ...patch, id, updatedAt: new Date().toISOString() }
              : b,
          ),
        }));
      },
      addProcessStep(batchId, instruction) {
        commitState("addProcessStep", (current) => ({
          ...current,
          processSteps: [
            ...current.processSteps,
            {
              id: uid(),
              labBatchId: batchId,
              stepNumber:
                current.processSteps.filter((s) => s.labBatchId === batchId)
                  .length + 1,
              instruction,
              status: "Pending",
              notes: "",
            },
          ],
        }));
      },
      updateProcessStep(id, patch) {
        commitState("updateProcessStep", (current) => ({
          ...current,
          processSteps: current.processSteps.map((s) =>
            s.id === id
              ? {
                  ...s,
                  ...patch,
                  completedAt:
                    patch.status === "Completed"
                      ? new Date().toISOString()
                      : s.completedAt,
                }
              : s,
          ),
        }));
      },
      addObservation(input) {
        commitState("addObservation", (current) => ({
          ...current,
          labObservations: [
            ...current.labObservations,
            { ...input, id: uid(), createdAt: new Date().toISOString() },
          ],
        }));
      },
      createTester(displayName, notes) {
        const now = new Date().toISOString();
        const tester: Tester = {
          id: uid(),
          displayName,
          notes,
          status: "Active",
          createdAt: now,
          updatedAt: now,
        };
        commitState("createTester", (c) => ({
          ...c,
          testers: [...c.testers, tester],
        }));
        return tester;
      },
      createTestTemplate(name, questions) {
        const now = new Date().toISOString();
        const template: TestTemplate = {
          id: uid(),
          name,
          description: "Internal development evaluation.",
          questions: questions.map((prompt, index) => ({
            id: uid(),
            prompt,
            type: "Numeric Rating",
            sortOrder: index + 1,
          })),
          createdAt: now,
          updatedAt: now,
        };
        commitState("createTestTemplate", (c) => ({
          ...c,
          testTemplates: [...c.testTemplates, template],
        }));
        return template;
      },
      createTestSession(input) {
        const session: TestSession = {
          ...input,
          id: uid(),
          createdAt: new Date().toISOString(),
        };
        commitState("createTestSession", (c) => ({
          ...c,
          testSessions: [...c.testSessions, session],
        }));
        return session;
      },
      async addTestResponse(input) {
        const response: TestResponse = {
          ...input,
          id: uid(),
          submittedAt: new Date().toISOString(),
        };
        await commitState("addTestResponse", (c) => ({
          ...c,
          testResponses: [...c.testResponses, response],
        }));
        return response;
      },
      updateInventoryLot(id, patch) {
        commitState("updateInventoryLot", (c) => ({
          ...c,
          inventoryLots: c.inventoryLots.map((l) =>
            l.id === id
              ? { ...l, ...patch, id, updatedAt: new Date().toISOString() }
              : l,
          ),
        }));
      },
      createProductionRun(input) {
        const now = new Date().toISOString();
        const product = state.products.find((p) => p.id === input.productId);
        const version = state.formulaVersions.find(
          (v) => v.id === input.formulaVersionId,
        );
        if (!product || !version || version.formulaId !== input.formulaId)
          throw new Error("Select a valid product, formula, and version.");
        if (version.status !== "Approved")
          throw new Error(
            "Only Approved Formula Versions may be used for Production Runs.",
          );
        if (
          !Number.isFinite(input.plannedBatchSize) ||
          input.plannedBatchSize <= 0
        )
          throw new Error("Planned size must be greater than zero.");
        const id = uid();
        const run: ProductionRun = {
          ...input,
          id,
          productionRunNumber: generateProductionRunNumber(
            product.name,
            state.productionRuns.map((r) => r.productionRunNumber),
          ),
          status: "Planned",
          createdAt: now,
          updatedAt: now,
          summary: "",
        };
        const lines = createProductionLines(
          id,
          state.formulaLines.filter((l) => l.formulaVersionId === version.id),
          state.ingredients,
          input.plannedBatchSize,
          input.plannedBatchUnit,
          uid,
        );
        const steps = version.processInstructions
          ? [
              {
                id: uid(),
                productionRunId: id,
                stepNumber: 1,
                instruction: version.processInstructions,
                status: "Pending" as const,
                notes: "",
              },
            ]
          : [];
        commitState("createProductionRun", (c) => ({
          ...c,
          productionRuns: [...c.productionRuns, run],
          productionRunLines: [...c.productionRunLines, ...lines],
          productionProcessSteps: [...c.productionProcessSteps, ...steps],
        }));
        return run;
      },
      updateProductionRun(id, patch) {
        commitState("updateProductionRun", (c) => ({
          ...c,
          productionRuns: c.productionRuns.map((r) =>
            r.id === id && !["Completed", "Archived"].includes(r.status)
              ? {
                  ...r,
                  ...patch,
                  id,
                  formulaVersionId:
                    r.status === "Planned"
                      ? (patch.formulaVersionId ?? r.formulaVersionId)
                      : r.formulaVersionId,
                  updatedAt: new Date().toISOString(),
                }
              : r,
          ),
        }));
      },
      transitionProductionRun(id, status) {
        commitState("transitionProductionRun", (c) => {
          const run = c.productionRuns.find((r) => r.id === id);
          if (!run || !canTransitionProduction(run.status, status)) return c;
          const now = new Date().toISOString();
          return {
            ...c,
            productionRuns: c.productionRuns.map((r) =>
              r.id === id
                ? {
                    ...r,
                    status,
                    startedAt: status === "In Progress" ? now : r.startedAt,
                    completedAt: status === "Completed" ? now : r.completedAt,
                    updatedAt: now,
                  }
                : r,
            ),
          };
        });
      },
      updateProductionLine(id, patch) {
        commitState("updateProductionLine", (c) => {
          const line = c.productionRunLines.find((l) => l.id === id);
          const run = c.productionRuns.find(
            (r) => r.id === line?.productionRunId,
          );
          if (!line || !run || !["Planned", "In Progress"].includes(run.status))
            return c;
          const next = { ...line, ...patch };
          if (patch.actualQuantity !== undefined)
            next.variance = productionVariance(
              patch.actualQuantity,
              line.plannedQuantity,
            );
          return {
            ...c,
            productionRunLines: c.productionRunLines.map((l) =>
              l.id === id ? next : l,
            ),
          };
        });
      },
      addProductionAllocation(lineId) {
        const line = state.productionRunLines.find((l) => l.id === lineId);
        if (line)
          commitState("addProductionAllocation", (c) => ({
            ...c,
            productionRunAllocations: [
              ...c.productionRunAllocations,
              {
                id: uid(),
                productionRunLineId: lineId,
                quantity: 0,
                unit: line.unit,
              },
            ],
          }));
      },
      updateProductionAllocation(id, patch) {
        commitState("updateProductionAllocation", (c) => ({
          ...c,
          productionRunAllocations: c.productionRunAllocations.map((a) =>
            a.id === id && !a.inventoryMovementId ? { ...a, ...patch } : a,
          ),
        }));
      },
      commitProductionConsumption(runId) {
        const lines = state.productionRunLines.filter(
          (l) => l.productionRunId === runId,
        );
        const allocations = state.productionRunAllocations.filter(
          (a) =>
            lines.some((l) => l.id === a.productionRunLineId) &&
            !a.inventoryMovementId,
        );
        const errors: string[] = [];
        if (!allocations.length)
          return ["No uncommitted lot allocations remain."];
        for (const line of lines.filter((l) => l.status === "Weighed")) {
          const allocated = allocations
            .filter((a) => a.productionRunLineId === line.id)
            .reduce((s, a) => s + a.quantity, 0);
          if (
            line.actualQuantity != null &&
            Math.abs(allocated - line.actualQuantity) > 0.0001
          )
            errors.push(
              `${line.ingredientNameSnapshot}: allocations must total ${line.actualQuantity} ${line.unit}.`,
            );
        }
        if (errors.length) return errors;
        const movements: InventoryMovement[] = [];
        const committed = new Map<
          string,
          {
            movementId: string;
            unitCostSnapshot?: number;
            costCurrencySnapshot?: string;
          }
        >();
        for (const a of allocations) {
          const line = lines.find((l) => l.id === a.productionRunLineId)!;
          const lot = state.inventoryLots.find(
            (l) => l.id === a.inventoryLotId,
          );
          if (!lot) {
            errors.push(
              `${line.ingredientNameSnapshot}: select an inventory lot.`,
            );
            continue;
          }
          const error = validateProductionAllocation(line, a, lot, [
            ...state.inventoryMovements,
            ...movements,
          ]);
          if (error) {
            errors.push(`${line.ingredientNameSnapshot}: ${error}`);
            continue;
          }
          const movementId = uid();
          movements.push({
            id: movementId,
            inventoryLotId: lot.id,
            type: "Consumption",
            quantity: a.quantity,
            unit: a.unit,
            reason: `Production run ${state.productionRuns.find((r) => r.id === runId)?.productionRunNumber}`,
            referenceType: "ProductionRun",
            referenceId: runId,
            notes: line.notes,
            occurredAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          });
          committed.set(a.id, {
            movementId,
            ...allocationCostSnapshot(lot, a.unit),
          });
        }
        if (errors.length) return errors;
        return commitState("commitProductionConsumption", (c) => ({
          ...c,
          inventoryMovements: [...c.inventoryMovements, ...movements],
          productionRunAllocations: c.productionRunAllocations.map((a) => {
            const saved = committed.get(a.id);
            return saved
              ? {
                  ...a,
                  inventoryMovementId: saved.movementId,
                  unitCostSnapshot: saved.unitCostSnapshot,
                  costCurrencySnapshot: saved.costCurrencySnapshot,
                }
              : a;
          }),
        })).then(() => []);
      },
      addProductionStep(productionRunId, instruction) {
        commitState("addProductionStep", (c) => ({
          ...c,
          productionProcessSteps: [
            ...c.productionProcessSteps,
            {
              id: uid(),
              productionRunId,
              stepNumber:
                c.productionProcessSteps.filter(
                  (s) => s.productionRunId === productionRunId,
                ).length + 1,
              instruction,
              status: "Pending",
              notes: "",
            },
          ],
        }));
      },
      updateProductionStep(id, patch) {
        commitState("updateProductionStep", (c) => ({
          ...c,
          productionProcessSteps: c.productionProcessSteps.map((s) =>
            s.id === id
              ? {
                  ...s,
                  ...patch,
                  completedAt:
                    patch.status === "Completed"
                      ? new Date().toISOString()
                      : s.completedAt,
                }
              : s,
          ),
        }));
      },
      addCostLine(input) {
        const now = new Date().toISOString();
        commitState("addCostLine", (c) => ({
          ...c,
          costLines: [
            ...c.costLines,
            { ...input, id: uid(), createdAt: now, updatedAt: now },
          ],
        }));
      },
      createPackagingComponent(input) {
        const now = new Date().toISOString(),
          component = { ...input, id: uid(), createdAt: now, updatedAt: now };
        commitState("createPackagingComponent", (c) => ({
          ...c,
          packagingComponents: [...c.packagingComponents, component],
        }));
        return component;
      },
      updatePackagingComponent(id, patch) {
        commitState("updatePackagingComponent", (c) => ({
          ...c,
          packagingComponents: c.packagingComponents.map((x) =>
            x.id === id
              ? { ...x, ...patch, id, updatedAt: new Date().toISOString() }
              : x,
          ),
        }));
      },
      savePackagingSupplierProduct(input) {
        const now = new Date().toISOString();
        commitState("savePackagingSupplierProduct", (c) => ({
          ...c,
          packagingSupplierProducts: [
            ...c.packagingSupplierProducts.map((x) =>
              x.packagingComponentId === input.packagingComponentId &&
              input.isPreferred
                ? { ...x, isPreferred: false }
                : x,
            ),
            { ...input, id: uid(), createdAt: now, updatedAt: now },
          ],
        }));
      },
      receivePackagingStock(input) {
        if (
          !Number.isFinite(input.openingQuantity) ||
          input.openingQuantity <= 0
        )
          throw new Error("Received quantity must be greater than zero.");
        const now = new Date().toISOString(),
          id = uid();
        const lot: PackagingInventoryLot = {
          ...input,
          id,
          internalLotNumber: generatePackagingLotNumber(
            state.packagingInventoryLots.map((l) => l.internalLotNumber),
            new Date(`${input.receivedDate}T12:00:00`),
          ),
          status: "Active",
          createdAt: now,
          updatedAt: now,
        };
        const movement: PackagingInventoryMovement = {
          id: uid(),
          packagingInventoryLotId: id,
          type: "Receipt",
          quantity: lot.openingQuantity,
          unit: lot.unit,
          reason: "Packaging stock received",
          notes: "Authoritative receipt created with lot.",
          occurredAt: `${lot.receivedDate}T12:00:00.000Z`,
          createdAt: now,
        };
        commitState("receivePackagingStock", (c) => ({
          ...c,
          packagingInventoryLots: [...c.packagingInventoryLots, lot],
          packagingInventoryMovements: [
            ...c.packagingInventoryMovements,
            movement,
          ],
        }));
      },
      addPackagingMovement(input) {
        const lot = state.packagingInventoryLots.find(
          (l) => l.id === input.packagingInventoryLotId,
        );
        if (!lot) throw new Error("Packaging lot not found.");
        const error = validatePackagingMovement(
          lot,
          state.packagingInventoryMovements,
          input,
        );
        if (error) throw new Error(error);
        commitState("addPackagingMovement", (c) => ({
          ...c,
          packagingInventoryMovements: [
            ...c.packagingInventoryMovements,
            { ...input, id: uid(), createdAt: new Date().toISOString() },
          ],
        }));
      },
      createPackagingSpecification(productId, name, description) {
        const now = new Date().toISOString(),
          spec = {
            id: uid(),
            productId,
            name,
            description,
            createdAt: now,
            updatedAt: now,
          },
          version = {
            id: uid(),
            packagingSpecificationId: spec.id,
            version: "v0.1",
            status: "Draft" as const,
            description: "Initial packaging direction.",
            notes: "",
            createdAt: now,
            updatedAt: now,
          };
        commitState("createPackagingSpecification", (c) => ({
          ...c,
          packagingSpecifications: [...c.packagingSpecifications, spec],
          packagingSpecificationVersions: [
            ...c.packagingSpecificationVersions,
            version,
          ],
        }));
        return spec;
      },
      updatePackagingLine(id, patch) {
        commitState("updatePackagingLine", (c) => {
          const line = c.packagingSpecificationLines.find((l) => l.id === id),
            version = c.packagingSpecificationVersions.find(
              (v) => v.id === line?.packagingSpecificationVersionId,
            );
          if (!line || version?.status !== "Draft") return c;
          return {
            ...c,
            packagingSpecificationLines: c.packagingSpecificationLines.map(
              (l) => (l.id === id ? { ...l, ...patch, id } : l),
            ),
          };
        });
      },
      addPackagingLine(versionId, componentId) {
        const version = state.packagingSpecificationVersions.find(
          (v) => v.id === versionId,
        );
        if (
          version?.status !== "Draft" ||
          state.packagingSpecificationLines.some(
            (l) =>
              l.packagingSpecificationVersionId === versionId &&
              l.packagingComponentId === componentId,
          )
        )
          return;
        commitState("addPackagingLine", (c) => ({
          ...c,
          packagingSpecificationLines: [
            ...c.packagingSpecificationLines,
            {
              id: uid(),
              packagingSpecificationVersionId: versionId,
              packagingComponentId: componentId,
              quantityPerUnit: 1,
              unit: "pcs",
              sortOrder:
                c.packagingSpecificationLines.filter(
                  (l) => l.packagingSpecificationVersionId === versionId,
                ).length + 1,
              purpose: "",
              notes: "",
            },
          ],
        }));
      },
      transitionPackagingVersion(id, status) {
        commitState("transitionPackagingVersion", (c) => {
          const version = c.packagingSpecificationVersions.find(
            (v) => v.id === id,
          );
          if (
            !version ||
            !packagingTransitions[version.status].includes(status)
          )
            return c;
          return {
            ...c,
            packagingSpecificationVersions:
              c.packagingSpecificationVersions.map((v) =>
                v.id === id
                  ? { ...v, status, updatedAt: new Date().toISOString() }
                  : v,
              ),
          };
        });
      },
      duplicatePackagingVersion(id) {
        const source = state.packagingSpecificationVersions.find(
          (v) => v.id === id,
        );
        if (!source) return;
        const result = duplicatePackagingVersionDomain(
          source,
          state.packagingSpecificationLines.filter(
            (l) => l.packagingSpecificationVersionId === id,
          ),
          state.packagingSpecificationVersions.filter(
            (v) =>
              v.packagingSpecificationId === source.packagingSpecificationId,
          ),
          uid,
        );
        commitState("duplicatePackagingVersion", (c) => ({
          ...c,
          packagingSpecificationVersions: [
            ...c.packagingSpecificationVersions,
            result.version,
          ],
          packagingSpecificationLines: [
            ...c.packagingSpecificationLines,
            ...result.lines,
          ],
        }));
      },
      async createFinishedGoodsBatch(input) {
        const run = state.productionRuns.find(
          (r) => r.id === input.productionRunId,
        );
        if (!run) throw new Error("Production Run not found.");
        const error = validateFinishedGoodsOutput(
          run,
          state.finishedGoodsBatches,
          input.quantity,
        );
        if (error) throw new Error(error);
        const packagingVersion = input.packagingSpecificationVersionId
          ? state.packagingSpecificationVersions.find(
              (v) => v.id === input.packagingSpecificationVersionId,
            )
          : undefined;
        if (packagingVersion && packagingVersion.status !== "Approved")
          throw new Error(
            "Finished Goods packaging must reference an Approved Packaging Specification Version.",
          );
        const product = state.products.find((p) => p.id === run.productId)!;
        const now = new Date().toISOString(),
          id = uid();
        const batch: FinishedGoodsBatch = {
          id,
          finishedGoodsBatchNumber: generateFinishedGoodsNumber(
            product.name,
            state.finishedGoodsBatches.map((b) => b.finishedGoodsBatchNumber),
            new Date(`${input.productionDate}T12:00:00`),
          ),
          productionRunId: run.id,
          productId: run.productId,
          formulaVersionId: run.formulaVersionId,
          packagingSpecificationVersionId:
            input.packagingSpecificationVersionId,
          status: packagingVersion ? "Quarantined" : "Active",
          productionDate: input.productionDate,
          initialQuantity: input.quantity,
          unit: "pcs",
          notes: input.notes,
          createdAt: now,
          updatedAt: now,
        };
        const movement: FinishedGoodsMovement | undefined = packagingVersion
          ? undefined
          : {
              id: uid(),
              finishedGoodsBatchId: id,
              type: "ProductionReceipt",
              quantity: input.quantity,
              unit: "pcs",
              reason: "Explicit Production output registration",
              referenceType: "ProductionRun",
              referenceId: run.id,
              notes: "",
              occurredAt: now,
              createdAt: now,
            };
        await commitState("createFinishedGoodsBatch", (c) => ({
          ...c,
          finishedGoodsBatches: [...c.finishedGoodsBatches, batch],
          finishedGoodsMovements: movement
            ? [...c.finishedGoodsMovements, movement]
            : c.finishedGoodsMovements,
        }));
        return batch;
      },
      addPackagingAllocation(finishedGoodsBatchId, lineId) {
        const line = state.packagingSpecificationLines.find(
            (l) => l.id === lineId,
          ),
          batch = state.finishedGoodsBatches.find(
            (b) => b.id === finishedGoodsBatchId,
          );
        if (line && batch)
          commitState("addPackagingAllocation", (c) => ({
            ...c,
            packagingAllocations: [
              ...c.packagingAllocations,
              {
                id: uid(),
                finishedGoodsBatchId,
                packagingSpecificationLineId: lineId,
                quantity: line.quantityPerUnit * batch.initialQuantity,
                unit: line.unit,
              },
            ],
          }));
      },
      updatePackagingAllocation(id, patch) {
        commitState("updatePackagingAllocation", (c) => ({
          ...c,
          packagingAllocations: c.packagingAllocations.map((a) =>
            a.id === id && !a.packagingInventoryMovementId
              ? { ...a, ...patch }
              : a,
          ),
        }));
      },
      commitPackagingConsumption(finishedGoodsBatchId) {
        const batch = state.finishedGoodsBatches.find(
          (b) => b.id === finishedGoodsBatchId,
        );
        if (!batch) return ["Finished Goods Batch not found."];
        if (
          state.finishedGoodsMovements.some(
            (m) =>
              m.finishedGoodsBatchId === batch.id &&
              m.type === "ProductionReceipt",
          )
        )
          return [
            "Packaging Consumption and Finished Goods receipt are already committed.",
          ];
        const lines = state.packagingSpecificationLines.filter(
            (l) =>
              l.packagingSpecificationVersionId ===
              batch.packagingSpecificationVersionId,
          ),
          allocations = state.packagingAllocations.filter(
            (a) =>
              a.finishedGoodsBatchId === finishedGoodsBatchId &&
              !a.packagingInventoryMovementId,
          ),
          errors: string[] = [];
        for (const line of lines) {
          const required = line.quantityPerUnit * batch.initialQuantity,
            allocated = allocations
              .filter((a) => a.packagingSpecificationLineId === line.id)
              .reduce((s, a) => s + a.quantity, 0);
          if (Math.abs(required - allocated) > 0.0001)
            errors.push(
              `Packaging allocations must total ${required} ${line.unit}.`,
            );
        }
        if (errors.length) return errors;
        const movements: PackagingInventoryMovement[] = [],
          saved = new Map<string, { id: string; cost?: number }>();
        for (const a of allocations) {
          const lot = state.packagingInventoryLots.find(
            (l) => l.id === a.packagingInventoryLotId,
          );
          if (!lot) {
            errors.push("Select a physical packaging lot.");
            continue;
          }
          const error = packagingAllocationError(a, lot, [
            ...state.packagingInventoryMovements,
            ...movements,
          ]);
          if (error) {
            errors.push(error);
            continue;
          }
          const id = uid();
          movements.push({
            id,
            packagingInventoryLotId: lot.id,
            type: "Consumption",
            quantity: a.quantity,
            unit: a.unit,
            reason: `Finished Goods ${batch.finishedGoodsBatchNumber}`,
            referenceType: "FinishedGoodsBatch",
            referenceId: batch.id,
            notes: "",
            occurredAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          });
          saved.set(a.id, { id, cost: packagingLotUnitCost(lot, a.unit) });
        }
        if (errors.length) return errors;
        const now = new Date().toISOString(),
          receipt: FinishedGoodsMovement = {
            id: uid(),
            finishedGoodsBatchId: batch.id,
            type: "ProductionReceipt",
            quantity: batch.initialQuantity,
            unit: batch.unit,
            reason: "Packaging committed and Production output finalized",
            referenceType: "ProductionRun",
            referenceId: batch.productionRunId,
            notes: "",
            occurredAt: now,
            createdAt: now,
          };
        return commitState("commitPackagingConsumption", (c) => ({
          ...c,
          packagingInventoryMovements: [
            ...c.packagingInventoryMovements,
            ...movements,
          ],
          packagingAllocations: c.packagingAllocations.map((a) => {
            const s = saved.get(a.id);
            return s
              ? {
                  ...a,
                  packagingInventoryMovementId: s.id,
                  unitCostSnapshot: s.cost,
                  costCurrencySnapshot: s.cost == null ? undefined : "NOK",
                }
              : a;
          }),
          finishedGoodsMovements: [...c.finishedGoodsMovements, receipt],
          finishedGoodsBatches: c.finishedGoodsBatches.map((b) =>
            b.id === batch.id ? { ...b, status: "Active", updatedAt: now } : b,
          ),
        })).then(() => []);
      },
      async addFinishedGoodsMovement(input) {
        const batch = state.finishedGoodsBatches.find(
          (b) => b.id === input.finishedGoodsBatchId,
        );
        if (!batch) throw new Error("Finished Goods Batch not found.");
        const error = validateFinishedGoodsMovement(
          batch,
          state.finishedGoodsMovements,
          input,
        );
        if (error) throw new Error(error);
        await commitState("addFinishedGoodsMovement", (c) => ({
          ...c,
          finishedGoodsMovements: [
            ...c.finishedGoodsMovements,
            { ...input, id: uid(), createdAt: new Date().toISOString() },
          ],
        }));
      },
      createComplianceDossier(input) {
        const version = state.formulaVersions.find(
            (v) => v.id === input.formulaVersionId,
          ),
          formula = state.formulas.find((f) => f.id === version?.formulaId);
        if (!version || formula?.productId !== input.productId)
          throw new Error(
            "Select an exact Formula Version belonging to the Product.",
          );
        const now = new Date().toISOString(),
          id = uid();
        const compositionSnapshot = state.formulaLines
          .filter((l) => l.formulaVersionId === version.id)
          .map((l) => {
            const ingredient = state.ingredients.find(
              (i) => i.id === l.ingredientId,
            );
            return {
              formulaLineId: l.id,
              ingredientId: l.ingredientId,
              ingredientNameSnapshot:
                ingredient?.commonName ?? "Unknown ingredient",
              inciNameSnapshot: ingredient?.inciName ?? "",
              concentration: l.percentage,
            };
          });
        const dossier: ComplianceDossier = {
          ...input,
          id,
          status: "Draft",
          compositionSnapshot,
          createdAt: now,
          updatedAt: now,
        };
        commitState("createComplianceDossier", (c) => ({
          ...c,
          complianceDossiers: [...c.complianceDossiers, dossier],
        }));
        return dossier;
      },
      duplicateComplianceDossier(
        id,
        formulaVersionId,
        packagingSpecificationVersionId,
      ) {
        const source = state.complianceDossiers.find((d) => d.id === id);
        if (!source) return;
        const dossier = duplicateComplianceDossierDomain(
          source,
          {
            formulaVersionId,
            packagingSpecificationVersionId,
            labelArtworkVersionId: undefined,
          },
          uid(),
        );
        commitState("duplicateComplianceDossier", (c) => ({
          ...c,
          complianceDossiers: [...c.complianceDossiers, dossier],
          pifSections: [
            ...c.pifSections,
            ...c.pifSections
              .filter((p) => p.complianceDossierId === id)
              .map((p) => ({
                ...p,
                id: uid(),
                complianceDossierId: dossier.id,
                status: [
                  "Evidence Recorded",
                  "External Review Complete",
                ].includes(p.status)
                  ? "Needs Review"
                  : p.status,
              })),
          ],
        }));
        return dossier;
      },
      updateComplianceDossier(id, patch) {
        commitState("updateComplianceDossier", (c) => ({
          ...c,
          complianceDossiers: c.complianceDossiers.map((d) =>
            d.id === id
              ? {
                  ...d,
                  ...patch,
                  id,
                  formulaVersionId: d.formulaVersionId,
                  packagingSpecificationVersionId:
                    d.packagingSpecificationVersionId,
                  createdAt: d.createdAt,
                  updatedAt: new Date().toISOString(),
                }
              : d,
          ),
        }));
      },
      createComplianceDocument(input) {
        const now=new Date().toISOString();
        const document:ComplianceDocument={...input,id:uid(),createdAt:now,updatedAt:now};
        commitState("createComplianceDocument",current=>({...current,complianceDocuments:[...current.complianceDocuments,document]}));
        return document;
      },
      updateComplianceDocument(id,patch) {
        commitState("updateComplianceDocument",current=>({...current,complianceDocuments:current.complianceDocuments.map(document=>document.id===id?{...document,...patch,id,createdAt:document.createdAt,updatedAt:new Date().toISOString()}:document)}));
      },
      updateRegulatoryReview(id, patch) {
        commitState("updateRegulatoryReview", (current) => ({
          ...current,
          regulatoryReviews: current.regulatoryReviews.map((review) =>
            review.id === id
              ? { ...review, ...patch, id, updatedAt: new Date().toISOString() }
              : review,
          ),
        }));
      },
      updatePifSection(id, patch) {
        commitState("updatePifSection", (current) => ({
          ...current,
          pifSections: current.pifSections.map((section) =>
            section.id === id ? { ...section, ...patch, id } : section,
          ),
        }));
      },
      updateLaunchPlan(id, patch) {
        commitState("updateLaunchPlan", (current) => ({
          ...current,
          launchPlans: current.launchPlans.map((plan) =>
            plan.id === id
              ? { ...plan, ...patch, id, updatedAt: new Date().toISOString() }
              : plan,
          ),
        }));
      },
      async recordLaunchDecision(launchPlanId, decision, notes) {
        const plan = state.launchPlans.find((p) => p.id === launchPlanId);
        if (!plan) return;
        const now = new Date().toISOString();
        await commitState("recordLaunchDecision", (c) => ({
          ...c,
          launchDecisions: [
            ...c.launchDecisions,
            {
              id: uid(),
              launchPlanId,
              decision,
              decidedAt: now,
              decidedBy: "Owner",
              complianceDossierId: plan.complianceDossierId,
              unresolvedBlockingIssues: c.readinessIssues
                .filter(
                  (i) =>
                    i.complianceDossierId === plan.complianceDossierId &&
                    i.severity === "Blocking" &&
                    i.status === "Open",
                )
                .map((i) => i.title),
              acknowledgedRisks: "",
              notes,
            },
          ],
        }));
      },
    }),
    [state, pendingActions, actionError, commitState],
  );
  return (
    <FormulaDataContext.Provider value={value}>
      {children}
    </FormulaDataContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFormulaData() {
  const value = useContext(FormulaDataContext);
  if (!value) throw new Error("FormulaDataProvider is required");
  return value;
}
