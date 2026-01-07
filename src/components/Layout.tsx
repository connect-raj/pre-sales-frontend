import React from 'react'
import { NavLink } from 'react-router-dom'
import { useApiStatus } from '../state/api-status'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { cn } from '../lib/utils'

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'rounded-md px-3 py-2 text-sm font-medium hover:bg-zinc-100',
          isActive ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700',
        )
      }
    >
      {children}
    </NavLink>
  )
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { offline, baseUrl } = useApiStatus()

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      {offline ? (
        <div className="sticky top-0 z-50 border-b border-zinc-200 bg-zinc-50/95 backdrop-blur">
          <div className="mx-auto max-w-7xl px-4 py-3">
            <Alert className="border-red-200 bg-red-50">
              <AlertTitle>Cannot reach backend</AlertTitle>
              <AlertDescription>
                Cannot reach backend at <span className="font-medium">{baseUrl}</span>. Check server/CORS.
              </AlertDescription>
            </Alert>
          </div>
        </div>
      ) : null}

      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="text-sm font-semibold">Pre-Sales Estimator</div>
          <nav className="flex items-center gap-1">
            <NavItem to="/upload">Upload</NavItem>
            <NavItem to="/past-files">Past Files</NavItem>
            <NavItem to="/estimate">Estimate</NavItem>
            <NavItem to="/status">Status</NavItem>
            <NavItem to="/results">Results</NavItem>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  )
}
