export function StatusPill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'green' | 'amber' | 'blue' | 'red' }) {
  return <span className={`status-pill ${tone}`}>{children}</span>
}
