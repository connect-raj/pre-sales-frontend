import { useMemo, useState } from 'react'
import type { Department, EstimateCreateRequest, EstimateCreateResponse } from '../api/types'
import { useApiStatus } from '../state/api-status'
import { useSession } from '../state/session'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Checkbox } from '../components/ui/checkbox'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { useNavigate } from 'react-router-dom'

const ALL_DEPARTMENTS: Department[] = ['React', 'Next', 'Vue', 'Flutter', 'React.Native', 'html/css', 'AI-ML', 'Nest', 'Node', 'DotNet', 'Blockchain']

export function EstimatePage() {
  const { apiFetch } = useApiStatus()
  const { activeSessionId, detectedDepartments } = useSession()
  const navigate = useNavigate()

  const [sessionId, setSessionId] = useState(activeSessionId)
  const [selected, setSelected] = useState<Partial<Record<Department, boolean>>>({})
  const { specialInstructions } = useSession()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<EstimateCreateResponse | null>(null)

  const departmentChoices = useMemo(() => {
    // Show detected first, but allow all.
    const detected = Array.isArray(detectedDepartments) ? detectedDepartments : []
    const rest = ALL_DEPARTMENTS.filter((d) => !detected.includes(d))
    return [...detected, ...rest]
  }, [detectedDepartments])

  function toggleDepartment(d: Department, checked: boolean) {
    setSelected((s) => ({ ...s, [d]: checked }))
  }

  async function startEstimation() {
    setError('')
    setSuccess(null)

    const normalizedSessionId = String(sessionId || '').trim()
    if (!normalizedSessionId) {
      setError('sessionId is required (upload Excel first).')
      return
    }

    const selectedDepts = ALL_DEPARTMENTS.filter((d) => !!selected[d])

    const payload: EstimateCreateRequest = {
      sessionId: normalizedSessionId,
      specialInstructions: Array.isArray(specialInstructions) && specialInstructions.length > 0 ? specialInstructions : undefined,
    }

    if (selectedDepts.length > 0) {
      payload.departments = selectedDepts
    } else if (detectedDepartments.length > 0) {
      payload.departments = detectedDepartments
    }

    setLoading(true)
    try {
      const res = (await apiFetch('/estimate/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })) as EstimateCreateResponse
      setSuccess(res)
      navigate('/status')
    } catch (err: any) {
      setError(err?.message || 'Failed to start estimation')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Start Estimation</h1>
        <p className="mt-1 text-sm text-zinc-600">Use the sessionId from Excel upload. Optionally provide department stake % weights and special instructions.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Estimation Inputs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label>Session ID</Label>
              <Input value={sessionId} onChange={(e) => setSessionId(e.target.value)} placeholder="Paste sessionId" />
              {detectedDepartments.length > 0 ? (
                <div className="text-xs text-zinc-600">Detected departments from Excel: {detectedDepartments.join(', ')}</div>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label>Select Departments</Label>
              <div className="rounded-md border border-zinc-200 bg-white p-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {departmentChoices.map((d) => (
                    <div key={d} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Checkbox checked={!!selected[d]} onCheckedChange={(v) => toggleDepartment(d, Boolean(v))} />
                        <span className="text-sm">{d}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-1 text-xs text-zinc-600">If you don’t select departments, the backend will use departments detected from Excel when available.</div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Special instructions (from Upload)</Label>
              <div className="rounded-md border border-zinc-200 bg-white p-3 text-sm">
                {specialInstructions && specialInstructions.length > 0 ? (
                  <ul className="list-disc pl-5 text-sm text-zinc-700">
                    {specialInstructions.map((ins, idx) => (
                      <li key={`${idx}-${ins}`}>{ins}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-zinc-600">No special instructions provided. Add them on the Upload page.</div>
                )}
              </div>
            </div>

            {error ? (
              <Alert className="border-red-200 bg-red-50">
                <AlertTitle>Cannot start estimation</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {success ? (
              <Alert className="border-green-200 bg-green-50">
                <AlertTitle>Estimation started</AlertTitle>
                <AlertDescription>
                  Job: {success.jobId}. Poll URL: {success.pollUrl}
                </AlertDescription>
              </Alert>
            ) : null}

            <div>
              <Button onClick={startEstimation} disabled={loading}>
                {loading ? 'Starting…' : 'Start Estimation'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
