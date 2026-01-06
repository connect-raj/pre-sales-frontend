import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

export class ApiError extends Error {
  status?: number
  body?: unknown

  constructor(message: string, opts?: { status?: number; body?: unknown }) {
    super(message)
    this.name = 'ApiError'
    this.status = opts?.status
    this.body = opts?.body
  }
}

type ApiFetch = (path: string, init?: RequestInit & { timeoutMs?: number }) => Promise<any>

type ApiStatusContextValue = {
  baseUrl: string
  offline: boolean
  apiFetch: ApiFetch
}

const ApiStatusContext = createContext<ApiStatusContextValue | undefined>(undefined)

const DEFAULT_TIMEOUT_MS = 10_000

function joinUrl(baseUrl: string, path: string) {
  if (/^https?:\/\//i.test(path)) return path
  const base = baseUrl.replace(/\/$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}

async function readBodySafe(res: Response) {
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    try {
      return await res.json()
    } catch {
      return undefined
    }
  }
  try {
    return await res.text()
  } catch {
    return undefined
  }
}

export function ApiStatusProvider({ children }: { children: React.ReactNode }) {
  const baseUrl = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:3000'
  const [offline, setOffline] = useState(false)

  const apiFetch: ApiFetch = useCallback(
    async (path, init) => {
      const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), timeoutMs)

      try {
        const res = await fetch(joinUrl(baseUrl, path), {
          ...init,
          cache: 'no-store',
          signal: controller.signal,
        })

        // Backend is reachable if we got an HTTP response.
        setOffline(false)

        if (!res.ok) {
          const body = await readBodySafe(res)
          const msg =
            typeof body === 'object' && body && 'message' in (body as any)
              ? String((body as any).message)
              : `Request failed (${res.status})`
          throw new ApiError(msg, { status: res.status, body })
        }

        const contentType = res.headers.get('content-type') || ''
        if (contentType.includes('application/json')) return res.json()
        return res.text()
      } catch (err: any) {
        const isAbort = err?.name === 'AbortError'
        const isNetwork = err instanceof TypeError
        if (isAbort) {
          // Our AbortController is used for timeouts.
          setOffline(false)
          throw new Error('Request timed out. The server may be busy processing the upload—please try again (or increase the timeout).')
        }
        if (isNetwork) {
          setOffline(true)
          throw new Error('Cannot reach backend. Check server/CORS and try again.')
        }
        throw err
      } finally {
        window.clearTimeout(timer)
      }
    },
    [baseUrl],
  )

  const value = useMemo(() => ({ baseUrl, offline, apiFetch }), [baseUrl, offline, apiFetch])
  return <ApiStatusContext.Provider value={value}>{children}</ApiStatusContext.Provider>
}

export function useApiStatus() {
  const ctx = useContext(ApiStatusContext)
  if (!ctx) throw new Error('useApiStatus must be used within ApiStatusProvider')
  return ctx
}
