import { useEffect, useRef, useState } from 'react'
import type { EstimateStatusResponse } from '../api/types'
import { ApiError, useApiStatus } from '../state/api-status'
import { useSession } from '../state/session'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { useNavigate } from 'react-router-dom'

const BASE_POLL_MS = 10_000
const MAX_BACKOFF_MS = 30_000

export function StatusPage() {
  const { apiFetch } = useApiStatus()
  const { activeSessionId, setActiveSessionId } = useSession()
  const navigate = useNavigate()

  const [sessionId, setSessionIdInput] = useState(activeSessionId)
  const [status, setStatus] = useState<EstimateStatusResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [polling, setPolling] = useState(false)
  const [nextPollMs, setNextPollMs] = useState<number>(BASE_POLL_MS)
  const [backoffMs, setBackoffMs] = useState<number>(BASE_POLL_MS)
  const [error, setError] = useState('')
  const pollTimer = useRef<number | null>(null)

  async function fetchStatusOnce(id: string) {
    const res = (await apiFetch(`/estimate/status/${encodeURIComponent(id)}`, { method: 'GET' })) as EstimateStatusResponse
    setStatus(res)
    return res
  }

  function clearTimer() {
    if (pollTimer.current) window.clearTimeout(pollTimer.current)
    pollTimer.current = null
  }

  function scheduleNextPoll(id: string, delayMs: number) {
    clearTimer()
    const safeDelay = Math.max(1000, delayMs)
    setNextPollMs(safeDelay)
    pollTimer.current = window.setTimeout(() => {
      pollOnceAndReschedule(id).catch((e) => {
        setError(e?.message || 'Failed to poll status')
        setPolling(false)
        clearTimer()
      })
    }, safeDelay)
  }

  async function pollOnceAndReschedule(id: string) {
    try {
      const res = await fetchStatusOnce(id)

      if (res.status === 'COMPLETED' || res.status === 'FAILED') {
        setPolling(false)
        clearTimer()
        return
      }

      // Successful poll: reset backoff.
      setBackoffMs(BASE_POLL_MS)
      scheduleNextPoll(id, BASE_POLL_MS)
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 429) {
        const bumped = Math.min(MAX_BACKOFF_MS, Math.max(BASE_POLL_MS, backoffMs + BASE_POLL_MS))
        setBackoffMs(bumped)
        setError(`Too many requests (429). Backing off to every ${Math.round(bumped / 1000)}s…`)
        scheduleNextPoll(id, bumped)
        return
      }

      // Other errors: stop polling and surface error.
      setPolling(false)
      clearTimer()
      setError(err?.message || 'Failed to poll status')
    }
  }

  async function startPolling() {
    setError('')
    const id = String(sessionId || '').trim()
    if (!id) {
      setError('sessionId is required.')
      return
    }
    setActiveSessionId(id)

    clearTimer()
    setLoading(true)
    setPolling(true)
    setBackoffMs(BASE_POLL_MS)
    try {
      const first = await fetchStatusOnce(id)
      if (first.status === 'COMPLETED' || first.status === 'FAILED') {
        setPolling(false)
        clearTimer()
        return
      }

      scheduleNextPoll(id, BASE_POLL_MS)
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch status')
      setPolling(false)
      clearTimer()
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    return () => {
      clearTimer()
    }
  }, [])

  useEffect(() => {
    if (!status) return
    if (status.status === 'COMPLETED' || status.status === 'FAILED') {
      clearTimer()
      setPolling(false)
    }
  }, [status])

  function parseProgress(progress?: string | null) {
    if (!progress) return null
    // Expect strings like: "Processing batch 2 of 5: Batch Name"
    const m = progress.match(/batch\s*(\d+)\s*of\s*(\d+)(?::\s*(.*))?/i)
    if (!m) return { raw: progress }
    const current = Number(m[1]) || 0
    const total = Number(m[2]) || 0
    const name = m[3] ? String(m[3]).trim() : undefined
    const percent = total > 0 ? Math.round((current / total) * 100) : 0
    return { current, total, name, percent, raw: progress }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Estimation Status</h1>
        <p className="mt-1 text-sm text-zinc-600">Poll the in-memory session status until it completes.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Poll Session</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Session ID</Label>
              <div className="flex items-center gap-2">
                <Input value={sessionId} onChange={(e) => setSessionIdInput(e.target.value)} disabled={polling || loading} />
                <Button onClick={startPolling} disabled={loading || polling}>
                  {loading ? 'Starting…' : polling ? `Polling (every ${Math.round(nextPollMs / 1000)}s)` : 'Start polling'}
                </Button>
              </div>
            </div>

            {error ? (
              <Alert className="border-red-200 bg-red-50">
                <AlertTitle>Status error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {status ? (
              <div className="rounded-md border border-zinc-200 bg-white p-4 text-sm">
                <div>
                  <span className="text-zinc-600">Status:</span> <span className="font-medium">{status.status}</span>
                </div>
                {status.progress ? (
                  <div className="mt-2">
                    <span className="text-zinc-600">Progress:</span>
                    <div className="mt-1">
                      <div className="text-sm font-medium">{status.progress}</div>
                      {parseProgress(status.progress) ? (
                        <div className="text-xs text-zinc-600 mt-1">
                          {(() => {
                            const p = parseProgress(status.progress)
                            if (!p) return null
                            if (p.current && p.total) return `Batch ${p.current} of ${p.total}`
                            return p.raw
                          })()}
                          {parseProgress(status.progress)?.name ? ` — ${parseProgress(status.progress)?.name}` : ''}
                        </div>
                      ) : null}
                      {/* Progress bar */}
                      <div className="w-full bg-zinc-100 rounded h-3 mt-2">
                        <div
                          className="bg-emerald-500 h-3 rounded"
                          style={{ width: `${parseProgress(status.progress)?.percent ?? 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
                {status.error ? (
                  <div className="mt-2 text-red-700">
                    <span className="font-medium">Error:</span> {status.error}
                  </div>
                ) : null}
                {status.status === 'COMPLETED' ? (
                  <div className="mt-3">
                    <Button onClick={() => navigate('/results')}>View results</Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
