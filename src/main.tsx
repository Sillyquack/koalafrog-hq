import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './app/App'
import './styles/index.css'
import { FormulaDataProvider } from './features/formulas/state/FormulaDataContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode><BrowserRouter><FormulaDataProvider><App /></FormulaDataProvider></BrowserRouter></StrictMode>,
)
