import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './app/App'
import './styles/index.css'
import { AuthGate } from './platform/auth/AuthGate'
import { WorkspaceRuntime } from './platform/startup/WorkspaceRuntime'

createRoot(document.getElementById('root')!).render(
  <StrictMode><BrowserRouter><AuthGate><WorkspaceRuntime><App /></WorkspaceRuntime></AuthGate></BrowserRouter></StrictMode>,
)
