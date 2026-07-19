import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { App } from './app/App'
import './styles/index.css'
import { AuthGate } from './platform/auth/AuthGate'
import { WorkspaceRuntime } from './platform/startup/WorkspaceRuntime'

const router=createBrowserRouter([{path:'*',element:<AuthGate><WorkspaceRuntime><App /></WorkspaceRuntime></AuthGate>}])
createRoot(document.getElementById('root')!).render(<StrictMode><RouterProvider router={router}/></StrictMode>)
