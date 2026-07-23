import type{ReactElement}from'react'
import{EquipmentDetailPage}from'./EquipmentDetailPage'
import{EquipmentPage}from'./EquipmentPage'
import{ProcurementPage}from'./ProcurementPage'
import{ProcurementRequestPage}from'./ProcurementRequestPage'
import{SupplierDetailPage}from'./SupplierDetailPage'
import{SuppliersPage}from'./SuppliersPage'

export const procurementRoutes:Array<{path:string;element:ReactElement}>=[
 {path:'suppliers',element:<SuppliersPage/>},
 {path:'suppliers/:id',element:<SupplierDetailPage/>},
 {path:'procurement',element:<ProcurementPage/>},
 {path:'procurement/:id',element:<ProcurementRequestPage/>},
 {path:'equipment',element:<EquipmentPage/>},
 {path:'equipment/:id',element:<EquipmentDetailPage/>},
]
