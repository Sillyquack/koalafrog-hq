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
import { InventoryPage } from '../features/inventory/InventoryPage'
import { LotDetailPage } from '../features/inventory/LotDetailPage'
import { LabBatchDetailPage } from '../features/lab/LabBatchDetailPage'
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

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="products/:productId" element={<ProductDetailPage />} />
        <Route path="formulas" element={<FormulaLibraryPage />} />
        <Route path="formulas/:formulaId" element={<FormulaDetailPage />} />
        <Route path="ingredients" element={<IngredientsPage />} />
        <Route path="ingredients/:ingredientId" element={<IngredientDetailPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="inventory/lots/:lotId" element={<LotDetailPage />} />
        <Route path="lab" element={<LabPage />} />
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
        {placeholderModules.map((module) => (
          <Route key={module.path} path={module.path} element={<PlaceholderPage module={module} />} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
