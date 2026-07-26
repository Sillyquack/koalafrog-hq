import { Navigate, useParams } from 'react-router-dom'

export function LegacySupplierDetailRedirect() {
  const { id } = useParams()
  return <Navigate to={id ? `/suppliers?supplier=${encodeURIComponent(id)}` : '/suppliers'} replace />
}
