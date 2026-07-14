import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { ProductsPage } from '../features/products/ProductsPage'
import { IngredientsPage } from '../features/ingredients/IngredientsPage'
import { LabPage } from '../features/lab/LabPage'
import { ScentHousePage } from '../features/scent-house/ScentHousePage'
import { PlaceholderPage } from '../features/placeholders/PlaceholderPage'
import { placeholderModules } from '../data/mockData'
import { ProductDetailPage } from '../features/products/ProductDetailPage'
import { FormulaLibraryPage } from '../features/formulas/FormulaLibraryPage'
import { FormulaDetailPage } from '../features/formulas/FormulaDetailPage'

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
        <Route path="lab" element={<LabPage />} />
        <Route path="scent-house" element={<ScentHousePage />} />
        {placeholderModules.map((module) => (
          <Route key={module.path} path={module.path} element={<PlaceholderPage module={module} />} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
