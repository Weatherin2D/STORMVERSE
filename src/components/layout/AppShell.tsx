import type { ReactNode } from 'react'
import { APP_NAME } from '../../config/app'

interface AppShellProps {
  brandNote: string
  statusMessage: string
  children: ReactNode
  overlay: ReactNode
}

export function AppShell({ brandNote, statusMessage, children, overlay }: AppShellProps) {
  return (
    <div className="app-shell">
      <div className="viewport">{children}</div>
      <div className="hud" id="hud">
        <header className="brand-lockup">
          <h1>{APP_NAME}</h1>
          <p>{brandNote}</p>
        </header>
        <p className="status-line" aria-live="polite">
          {statusMessage}
        </p>
        {overlay}
      </div>
    </div>
  )
}
