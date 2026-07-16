import type { ReactNode } from 'react'
import { ContextualGuideLink } from './ContextualGuideLink'

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div><div className="page-actions"><ContextualGuideLink />{action}</div></header>
}
