import {createContext,useContext} from 'react'
export interface ActiveWorkspaceIdentity{workspaceId:string;repository:'supabase'}
const ActiveWorkspaceContext=createContext<ActiveWorkspaceIdentity|undefined>(undefined)
export const ActiveWorkspaceProvider=ActiveWorkspaceContext.Provider
export const useActiveWorkspace=()=>useContext(ActiveWorkspaceContext)
