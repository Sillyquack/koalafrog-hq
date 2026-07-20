import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { ProductsPage } from '../features/products/ProductsPage'
import { IngredientsPage } from '../features/ingredients/IngredientsPage'
import { LabPage } from '../features/lab/LabPage'
import { ScentHousePage } from '../features/scent-house/ScentHousePage'
import { ScentStudioPage } from '../features/scent-house/ScentStudioPage'
import { PlaceholderPage } from '../features/placeholders/PlaceholderPage'
import { placeholderModules } from '../data/mockData'
import { ProductDetailPage } from '../features/products/ProductDetailPage'
import { FormulaLibraryPage } from '../features/formulas/FormulaLibraryPage'
import { FormulaDetailPage } from '../features/formulas/FormulaDetailPage'
import { IngredientDetailPage } from '../features/ingredients/IngredientDetailPage'
import { ReferenceLibraryPage } from '../features/ingredients/reference/ReferenceLibraryPage'
import { ReferenceEntryPage } from '../features/ingredients/reference/ReferenceEntryPage'
import { SmartStartPage } from '../features/ingredients/smart-start/SmartStartPage'
import { InventoryPage } from '../features/inventory/InventoryPage'
import { LotDetailPage } from '../features/inventory/LotDetailPage'
import { LabBatchDetailPage } from '../features/lab/LabBatchDetailPage'
import { StartBatchHandoffPage, StudioLabHandoff } from '../features/lab/components/StartBatchForm'
import { TestingPage } from '../features/testing/TestingPage'
import { ProductionPage } from '../features/production/ProductionPage'
import { ProductionRunDetailPage } from '../features/production/ProductionRunDetailPage'
import { CostingPage } from '../features/costing/CostingPage'
import { PackagingPage } from '../features/packaging/PackagingPage'
import { PackagingComponentDetailPage } from '../features/packaging/PackagingComponentDetailPage'
import { PackagingSpecificationPage } from '../features/packaging/PackagingSpecificationPage'
import { FinishedGoodsPage } from '../features/finished-goods/FinishedGoodsPage'
import { FinishedGoodsDetailPage } from '../features/finished-goods/FinishedGoodsDetailPage'
import { CompliancePage } from '../features/compliance/CompliancePage'
import { ComplianceDossierPage } from '../features/compliance/ComplianceDossierPage'
import { LaunchPage } from '../features/launch/LaunchPage'
import { LaunchPlanPage } from '../features/launch/LaunchPlanPage'
import { PlatformPage } from '../platform/PlatformPage'
import { KnowledgePage } from '../features/knowledge/KnowledgePage'
import { IntelligenceThreadPage } from '../features/knowledge/IntelligenceThreadPage'
import { ScentMemoryDetailPage } from '../features/knowledge/ScentMemoryDetailPage'
import { DevelopmentPage } from '../features/development/DevelopmentPage'
import { ExperimentReviewPage } from '../features/development/ExperimentReviewPage'
import { DevelopmentExperimentPage } from '../features/development/DevelopmentExperimentPage'
import { BiblePage } from '../features/knowledge/BiblePage'
import { SuppliersPage } from '../features/procurement/SuppliersPage'
import { SupplierDetailPage } from '../features/procurement/SupplierDetailPage'
import { EquipmentPage } from '../features/procurement/EquipmentPage'
import { EquipmentDetailPage } from '../features/procurement/EquipmentDetailPage'
import { ProductStudioPage } from '../features/product-studio/ProductStudioPage'
import { BeardOilStudioPage } from '../features/product-studio/BeardOilStudioPage'
import { BeardButterStudioPage } from '../features/product-studio/BeardButterStudioPage'
import { NaturalDeodorantStudioPage } from '../features/product-studio/NaturalDeodorantStudioPage'
import { IngredientKnowledgePage } from '../features/ingredients/IngredientKnowledgePage'
import { BeardStudioShell } from '../features/beard-studio/components/BeardStudioShell'
import { BeardLogPage, BeardOverviewPage, BeardProfilePage, GroomingToolsPage, LengthMapPage, TrimModePage, TrimRecipesPage } from '../features/beard-studio/BeardStudioPages'

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="product-studio" element={<ProductStudioPage />} />
        <Route path="product-studio/beard-oil" element={<BeardOilStudioPage />} />
        <Route path="product-studio/beard-butter" element={<BeardButterStudioPage />} />
        <Route path="product-studio/natural-deodorant" element={<NaturalDeodorantStudioPage />} />
        <Route path="grooming/beard-studio" element={<BeardStudioShell />}>
          <Route index element={<BeardOverviewPage />} />
          <Route path="profile" element={<BeardProfilePage />} />
          <Route path="length-map" element={<LengthMapPage />} />
          <Route path="recipes" element={<TrimRecipesPage />} />
          <Route path="trim" element={<TrimModePage />} />
          <Route path="log" element={<BeardLogPage />} />
          <Route path="log/:logId" element={<BeardLogPage />} />
          <Route path="tools" element={<GroomingToolsPage />} />
        </Route>
        <Route path="products" element={<ProductsPage />} />
        <Route path="products/:productId" element={<ProductDetailPage />} />
        <Route path="formulas" element={<FormulaLibraryPage />} />
        <Route path="formulas/:formulaId" element={<FormulaDetailPage />} />
        <Route path="ingredients" element={<IngredientsPage />} />
        <Route path="ingredients/reference" element={<ReferenceLibraryPage />} />
        <Route path="ingredients/reference/:entryId" element={<ReferenceEntryPage />} />
        <Route path="ingredients/smart-start" element={<SmartStartPage />} />
        <Route path="ingredients/:ingredientId" element={<IngredientDetailPage />} />
        <Route path="ingredients/:ingredientId/knowledge" element={<IngredientKnowledgePage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="inventory/lots/:lotId" element={<LotDetailPage />} />
        <Route path="lab" element={<StudioLabHandoff fallback={<LabPage />}/>} />
        <Route path="lab/start/:formulaId" element={<StartBatchHandoffPage />} />
        <Route path="lab/:labBatchId" element={<LabBatchDetailPage />} />
        <Route path="testing" element={<TestingPage />} />
        <Route path="production" element={<ProductionPage />} />
        <Route path="production/:productionRunId" element={<ProductionRunDetailPage />} />
        <Route path="costing" element={<CostingPage />} />
        <Route path="packaging" element={<PackagingPage />} />
        <Route path="packaging/components/:packagingComponentId" element={<PackagingComponentDetailPage />} />
        <Route path="packaging/specifications/:packagingSpecificationId" element={<PackagingSpecificationPage />} />
        <Route path="finished-goods" element={<FinishedGoodsPage />} />
        <Route path="finished-goods/:finishedGoodsBatchId" element={<FinishedGoodsDetailPage />} />
        <Route path="compliance" element={<CompliancePage />} />
        <Route path="compliance/:complianceDossierId" element={<ComplianceDossierPage />} />
        <Route path="launch" element={<LaunchPage />} />
        <Route path="launch/:launchPlanId" element={<LaunchPlanPage />} />
        <Route path="platform" element={<PlatformPage />} />
        <Route path="scent-house" element={<ScentHousePage />} />
        <Route path="scent-house/studio" element={<ScentStudioPage />} />
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="knowledge/intelligence/:threadId" element={<IntelligenceThreadPage />} />
        <Route path="knowledge/scent-memory/:sessionId" element={<ScentMemoryDetailPage />} />
        <Route path="knowledge/bible" element={<BiblePage />} />
        <Route path="knowledge/bible/:articleId" element={<BiblePage />} />
        <Route path="development" element={<DevelopmentPage />} />
        <Route path="development/new" element={<ExperimentReviewPage />} />
        <Route path="development/:id" element={<DevelopmentExperimentPage />} />
        <Route path="suppliers" element={<SuppliersPage />} />
        <Route path="suppliers/:id" element={<SupplierDetailPage />} />
        <Route path="equipment" element={<EquipmentPage />} />
        <Route path="equipment/:id" element={<EquipmentDetailPage />} />
        {placeholderModules.map((module) => (
          <Route key={module.path} path={module.path} element={<PlaceholderPage module={module} />} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
