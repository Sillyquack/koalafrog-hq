import type{ReactElement}from'react'
import{DraftPurchasePlanBuilderPage,DraftPurchasePlanDetailPage,EquipmentDetailPage,EquipmentPage,LegacySupplierDetailRedirect,ProcurementPage,ProcurementRequestPage,ProductionReadinessPage,SuppliersPage}from'./ProcurementLazyPages'

export const procurementRoutes:Array<{path:string;element:ReactElement}>=[
 {path:'suppliers',element:<SuppliersPage/>},
 {path:'suppliers/:id',element:<LegacySupplierDetailRedirect/>},
 {path:'procurement',element:<ProcurementPage/>},
 {path:'procurement/production-readiness',element:<ProductionReadinessPage/>},
 {path:'procurement/production-readiness/:roundId',element:<ProductionReadinessPage/>},
 {path:'procurement/draft-plans/new',element:<DraftPurchasePlanBuilderPage/>},
 {path:'procurement/draft-plans/:planId',element:<DraftPurchasePlanDetailPage/>},
 {path:'procurement/:id',element:<ProcurementRequestPage/>},
 {path:'equipment',element:<EquipmentPage/>},
 {path:'equipment/:id',element:<EquipmentDetailPage/>},
]
