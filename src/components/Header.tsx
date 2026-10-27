import { Link } from 'react-router-dom'

export default function Header({ title, back = false }: { title?: string; back?: boolean }) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
      <Link to="/" aria-label="Home" style={{ display: 'flex' }}>
        <img src="/logo.svg" alt="" width={40} height={40} style={{ borderRadius: 10 }} />
      </Link>
      <h1 style={{ margin: 0, fontSize: '1.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{title ?? 'mgolf league'}</h1>
      {back && (
        <Link to="/" className="muted" style={{ marginLeft: 'auto', fontSize: '0.9rem' }}>
          Home
        </Link>
      )}
    </header>
  )
}