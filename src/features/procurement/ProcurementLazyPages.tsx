import { lazy } from 'react'

export const EquipmentDetailPage=lazy(()=>import('./EquipmentDetailPage').then(m=>({default:m.EquipmentDetailPage})))
export const EquipmentPage=lazy(()=>import('./EquipmentPage').then(m=>({default:m.EquipmentPage})))
export const LegacySupplierDetailRedirect=lazy(()=>import('./LegacySupplierDetailRedirect').then(m=>({default:m.LegacySupplierDetailRedirect})))
export const ProcurementPage=lazy(()=>import('./ProcurementPage').then(m=>({default:m.ProcurementPage})))
export const ProcurementRequestPage=lazy(()=>import('./ProcurementRequestPage').then(m=>({default:m.ProcurementRequestPage})))
export const SuppliersPage=lazy(()=>import('./SuppliersPage').then(m=>({default:m.SuppliersPage})))
export const ProductionReadinessPage=lazy(()=>import('./production-readiness/ProductionReadinessPage').then(m=>({default:m.ProductionReadinessPage})))
