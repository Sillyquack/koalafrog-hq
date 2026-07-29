import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { PlaceholderPage } from '../features/placeholders/PlaceholderPage'
import { placeholderModules } from '../data/mockData'
import { StartBatchHandoffPage, StudioLabHandoff } from '../features/lab/components/StartBatchForm'
import { procurementRoutes } from '../features/procurement/procurementRoutes'

const ProductsPage=lazy(()=>import('../features/products/ProductsPage').then(m=>({default:m.ProductsPage})))
const ProductDetailPage=lazy(()=>import('../features/products/ProductDetailPage').then(m=>({default:m.ProductDetailPage})))
const IngredientsPage=lazy(()=>import('../features/ingredients/IngredientsPage').then(m=>({default:m.IngredientsPage})))
const IngredientDetailPage=lazy(()=>import('../features/ingredients/IngredientDetailPage').then(m=>({default:m.IngredientDetailPage})))
const IngredientKnowledgePage=lazy(()=>import('../features/ingredients/IngredientKnowledgePage').then(m=>({default:m.IngredientKnowledgePage})))
const ReferenceLibraryPage=lazy(()=>import('../features/ingredients/reference/ReferenceLibraryPage').then(m=>({default:m.ReferenceLibraryPage})))
const ReferenceEntryPage=lazy(()=>import('../features/ingredients/reference/ReferenceEntryPage').then(m=>({default:m.ReferenceEntryPage})))
const SmartStartPage=lazy(()=>import('../features/ingredients/smart-start/SmartStartPage').then(m=>({default:m.SmartStartPage})))
const FormulaLibraryPage=lazy(()=>import('../features/formulas/FormulaLibraryPage').then(m=>({default:m.FormulaLibraryPage})))
const FormulaDetailPage=lazy(()=>import('../features/formulas/FormulaDetailPage').then(m=>({default:m.FormulaDetailPage})))
const LabPage=lazy(()=>import('../features/lab/LabPage').then(m=>({default:m.LabPage})))
const LabBatchDetailPage=lazy(()=>import('../features/lab/LabBatchDetailPage').then(m=>({default:m.LabBatchDetailPage})))
const InventoryPage=lazy(()=>import('../features/inventory/InventoryPage').then(m=>({default:m.InventoryPage})))
const LotDetailPage=lazy(()=>import('../features/inventory/LotDetailPage').then(m=>({default:m.LotDetailPage})))
const TestingPage=lazy(()=>import('../features/testing/TestingPage').then(m=>({default:m.TestingPage})))
const ProductionPage=lazy(()=>import('../features/production/ProductionPage').then(m=>({default:m.ProductionPage})))
const ProductionRunDetailPage=lazy(()=>import('../features/production/ProductionRunDetailPage').then(m=>({default:m.ProductionRunDetailPage})))
const CostingPage=lazy(()=>import('../features/costing/CostingPage').then(m=>({default:m.CostingPage})))
const PackagingPage=lazy(()=>import('../features/packaging/PackagingPage').then(m=>({default:m.PackagingPage})))
const PackagingComponentDetailPage=lazy(()=>import('../features/packaging/PackagingComponentDetailPage').then(m=>({default:m.PackagingComponentDetailPage})))
const PackagingSpecificationPage=lazy(()=>import('../features/packaging/PackagingSpecificationPage').then(m=>({default:m.PackagingSpecificationPage})))
const FinishedGoodsPage=lazy(()=>import('../features/finished-goods/FinishedGoodsPage').then(m=>({default:m.FinishedGoodsPage})))
const FinishedGoodsDetailPage=lazy(()=>import('../features/finished-goods/FinishedGoodsDetailPage').then(m=>({default:m.FinishedGoodsDetailPage})))
const FinishedGoodsLotPage=lazy(()=>import('../features/finished-goods-control/FinishedGoodsLotPage').then(m=>({default:m.FinishedGoodsLotPage})))
const FinishedGoodsInventoryPage=lazy(()=>import('../features/finished-goods-control/FinishedGoodsInventoryPage').then(m=>({default:m.FinishedGoodsInventoryPage})))
const TraceabilityPage=lazy(()=>import('../features/traceability/TraceabilityPage').then(m=>({default:m.TraceabilityPage})))
const CompliancePage=lazy(()=>import('../features/compliance/CompliancePage').then(m=>({default:m.CompliancePage})))
const ComplianceDossierPage=lazy(()=>import('../features/compliance/ComplianceDossierPage').then(m=>({default:m.ComplianceDossierPage})))
const LaunchPage=lazy(()=>import('../features/launch/LaunchPage').then(m=>({default:m.LaunchPage})))
const LaunchPlanPage=lazy(()=>import('../features/launch/LaunchPlanPage').then(m=>({default:m.LaunchPlanPage})))
const PlatformPage=lazy(()=>import('../platform/PlatformPage').then(m=>({default:m.PlatformPage})))
const ScentHousePage=lazy(()=>import('../features/scent-house/ScentHousePage').then(m=>({default:m.ScentHousePage})))
const ScentStudioPage=lazy(()=>import('../features/scent-house/ScentStudioPage').then(m=>({default:m.ScentStudioPage})))
const KnowledgePage=lazy(()=>import('../features/knowledge/KnowledgePage').then(m=>({default:m.KnowledgePage})))
const IntelligenceThreadPage=lazy(()=>import('../features/knowledge/IntelligenceThreadPage').then(m=>({default:m.IntelligenceThreadPage})))
const ScentMemoryDetailPage=lazy(()=>import('../features/knowledge/ScentMemoryDetailPage').then(m=>({default:m.ScentMemoryDetailPage})))
const BiblePage=lazy(()=>import('../features/knowledge/BiblePage').then(m=>({default:m.BiblePage})))
const DevelopmentPage=lazy(()=>import('../features/development/DevelopmentPage').then(m=>({default:m.DevelopmentPage})))
const ExperimentReviewPage=lazy(()=>import('../features/development/ExperimentReviewPage').then(m=>({default:m.ExperimentReviewPage})))
const DevelopmentExperimentPage=lazy(()=>import('../features/development/DevelopmentExperimentPage').then(m=>({default:m.DevelopmentExperimentPage})))
const ProductStudioPage=lazy(()=>import('../features/product-studio/ProductStudioPage').then(m=>({default:m.ProductStudioPage})))
const BeardOilStudioPage=lazy(()=>import('../features/product-studio/BeardOilStudioPage').then(m=>({default:m.BeardOilStudioPage})))
const BeardButterStudioPage=lazy(()=>import('../features/product-studio/BeardButterStudioPage').then(m=>({default:m.BeardButterStudioPage})))
const NaturalDeodorantStudioPage=lazy(()=>import('../features/product-studio/NaturalDeodorantStudioPage').then(m=>({default:m.NaturalDeodorantStudioPage})))
const BenchmarkLabPage=lazy(()=>import('../features/product-studio/BenchmarkLabPage').then(m=>({default:m.BenchmarkLabPage})))
const BeardStudioShell=lazy(()=>import('../features/beard-studio/components/BeardStudioShell').then(m=>({default:m.BeardStudioShell})))
const BeardLogPage=lazy(()=>import('../features/beard-studio/pages/BeardLogPage').then(m=>({default:m.BeardLogPage})))
const BeardOverviewPage=lazy(()=>import('../features/beard-studio/pages/BeardOverviewPage').then(m=>({default:m.BeardOverviewPage})))
const BeardProfilePage=lazy(()=>import('../features/beard-studio/pages/BeardProfilePage').then(m=>({default:m.BeardProfilePage})))
const GroomingToolsPage=lazy(()=>import('../features/beard-studio/pages/GroomingToolsPage').then(m=>({default:m.GroomingToolsPage})))
const LengthMapPage=lazy(()=>import('../features/beard-studio/pages/LengthMapPage').then(m=>({default:m.LengthMapPage})))
const TrimModePage=lazy(()=>import('../features/beard-studio/pages/TrimModePage').then(m=>({default:m.TrimModePage})))
const TrimRecipesPage=lazy(()=>import('../features/beard-studio/pages/TrimRecipesPage').then(m=>({default:m.TrimRecipesPage})))

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="product-studio" element={<ProductStudioPage />} />
        <Route path="product-studio/beard-oil" element={<BeardOilStudioPage />} />
        <Route path="product-studio/beard-butter" element={<BeardButterStudioPage />} />
        <Route path="product-studio/natural-deodorant" element={<NaturalDeodorantStudioPage />} />
        <Route path="product-studio/benchmark-lab/new" element={<BenchmarkLabPage />} />
        <Route path="product-studio/benchmark-lab/:conceptId" element={<BenchmarkLabPage />} />
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
        <Route path="finished-goods-lots/:finishedGoodsLotId" element={<FinishedGoodsLotPage />} />
        <Route path="finished-goods-inventory/:releasedInventoryLotId" element={<FinishedGoodsInventoryPage />} />
        <Route path="traceability" element={<TraceabilityPage />} />
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
        {procurementRoutes.map(route=><Route key={route.path} {...route}/>)}
        {placeholderModules.map((module) => (
          <Route key={module.path} path={module.path} element={<PlaceholderPage module={module} />} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
