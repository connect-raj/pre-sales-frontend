import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import type {
  Department,
  EstimationResultItem,
  EstimateConfidence,
  EstimateStatusResponse,
  HoursRange,
} from '../api/types'
import { useApiStatus } from '../state/api-status'
import { useSession } from '../state/session'
import { exportUploadedExcelWithEstimates } from '../lib/annotate-uploaded-excel'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'

const DEPARTMENTS: Department[] = ['React', 'Next', 'Vue', 'Flutter', 'React.Native', 'html/css', 'AI-ML', 'Nest', 'Node', 'DotNet', 'Blockchain']

type EditableRange = HoursRange

type EditableRow = {
  featureIndex: number
  batch: string
  featureName: string
  featureDescription: string
  confidence: EstimateConfidence
  complexity: string
  techRemarks: string
  userRemark: string
  ranges: Record<Department, EditableRange>
}

function toRange(maybeRange: any, maybeFlat: any): EditableRange {
  const r = maybeRange as HoursRange | undefined
  if (r && typeof r === 'object') {
    const min = Number((r as any).min ?? 0)
    const mostLikely = Number((r as any).mostLikely ?? 0)
    const max = Number((r as any).max ?? 0)
    return {
      min: Number.isFinite(min) ? min : 0,
      mostLikely: Number.isFinite(mostLikely) ? mostLikely : 0,
      max: Number.isFinite(max) ? max : 0,
    }
  }
  const v = Number(maybeFlat ?? 0)
  const n = Number.isFinite(v) ? v : 0
  return { min: n, mostLikely: n, max: n }
}

function safeFilePart(s: string) {
  return String(s || '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80)
}

function today() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function ResultsPage() {
  const { apiFetch } = useApiStatus()
  const { activeSessionId, featureDescriptions, uploadedExcelFile, uploadedExcelSessionId } = useSession()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [original, setOriginal] = useState<EditableRow[] | null>(null)
  const [draft, setDraft] = useState<EditableRow[] | null>(null)
  const [regenerating, setRegenerating] = useState<Record<number, boolean>>({})

  const totals = useMemo(() => {
    const rows = draft || []
    const sums: Record<Department, number> = {
      React: 0,
      Next: 0,
      Vue: 0,
      Flutter: 0,
      "React.Native": 0,
      "html/css": 0,
      "AI-ML": 0,
      Nest: 0,
      Node: 0,
      DotNet: 0,
      Blockchain: 0,
    }
    for (const row of rows) {
      for (const d of DEPARTMENTS) sums[d] += Number(row.ranges[d]?.mostLikely || 0)
    }
    const total = DEPARTMENTS.reduce((s, d) => s + sums[d], 0)
    return { sums, total }
  }, [draft])

  async function load() {
    setError('')
    const id = String(activeSessionId || '').trim()
    if (!id) {
      setError('No active sessionId. Upload Excel first (Upload page).')
      return
    }
    setLoading(true)
    try {
      const status = (await apiFetch(`/estimate/status/${encodeURIComponent(id)}`, { method: 'GET' })) as EstimateStatusResponse
      const items: EstimationResultItem[] = Array.isArray(status.result) ? status.result : []

      const mapped: EditableRow[] = items.map((it, idx) => {
        const featureIndex = Number((it as any).featureIndex ?? idx)
        const featureDescription = featureDescriptions[String(featureIndex)] || ''
        const confidence = (it as any).confidence || (it as any).batchConfidenceDelta || 'Medium'
        const userRemark = String((it as any).userRemark || '')

        return {
          featureIndex,
          batch: String((it as any).batch || ''),
          featureName: String((it as any).featureName || ''),
          featureDescription,
          confidence,
          complexity: String((it as any).complexity || ''),
          techRemarks: String((it as any).techRemarks || ''),
          userRemark,
          ranges: {
            React: toRange((it as any).reactHoursRange, (it as any).reactHours),
            Next: toRange((it as any).nextHoursRange, (it as any).nextHours),
            Vue: toRange((it as any).vueHoursRange, (it as any).vueHours),
            Flutter: toRange((it as any).flutterHoursRange, (it as any).flutterHours),
            "React.Native": toRange((it as any).reactNativeHoursRange, (it as any).reactNativeHours),
            "html/css": toRange((it as any).htmlCssHoursRange, (it as any).htmlCssHours),
            "AI-ML": toRange((it as any).aiMlHoursRange, (it as any).aiMlHours),
            Nest: toRange((it as any).nestHoursRange, (it as any).nestHours),
            Node: toRange((it as any).nodeHoursRange, (it as any).nodeHours),
            DotNet: toRange((it as any).dotNetHoursRange, (it as any).dotNetHours),
            Blockchain: toRange((it as any).blockchainHoursRange, (it as any).blockchainHours),
          },
        }
      })

      setOriginal(mapped)
      setDraft(mapped)
    } catch (err: any) {
      setError(err?.message || 'Failed to load results')
    } finally {
      setLoading(false)
    }
  }

  async function regenerate(row: EditableRow) {
    setError('')
    const id = String(activeSessionId || '').trim()
    if (!id) {
      setError('No active sessionId. Upload Excel first (Upload page).')
      return
    }

    const featureIndex = Number(row.featureIndex)
    setRegenerating((prev) => ({ ...prev, [featureIndex]: true }))
    try {
      const res = (await apiFetch(`/estimate/regenerate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: id,
          featureIndex,
          userRemark: row.userRemark || '',
        }),
      })) as { estimate?: EstimationResultItem }

      const it = (res as any)?.estimate
      if (!it || typeof it !== 'object') {
        throw new Error('Regenerate succeeded but no estimate returned')
      }

      const confidence = (it as any).confidence || (it as any).batchConfidenceDelta || 'Medium'
      const updatedRow: EditableRow = {
        ...row,
        batch: String((it as any).batch || row.batch || ''),
        featureName: String((it as any).featureName || row.featureName || ''),
        confidence,
        complexity: String((it as any).complexity || row.complexity || ''),
        techRemarks: String((it as any).techRemarks || row.techRemarks || ''),
        userRemark: String((it as any).userRemark ?? row.userRemark ?? ''),
        ranges: {
          React: toRange((it as any).reactHoursRange, (it as any).reactHours),
          Next: toRange((it as any).nextHoursRange, (it as any).nextHours),
          Vue: toRange((it as any).vueHoursRange, (it as any).vueHours),
          Flutter: toRange((it as any).flutterHoursRange, (it as any).flutterHours),
          "React.Native": toRange((it as any).reactNativeHoursRange, (it as any).reactNativeHours),
          "html/css": toRange((it as any).htmlCssHoursRange, (it as any).htmlCssHours),
          "AI-ML": toRange((it as any).aiMlHoursRange, (it as any).aiMlHours),
          Nest: toRange((it as any).nestHoursRange, (it as any).nestHours),
          Node: toRange((it as any).nodeHoursRange, (it as any).nodeHours),
          DotNet: toRange((it as any).dotNetHoursRange, (it as any).dotNetHours),
          Blockchain: toRange((it as any).blockchainHoursRange, (it as any).blockchainHours),
        },
      }

      setOriginal((prev) => {
        if (!prev) return prev
        const next = [...prev]
        const i = next.findIndex((r) => r.featureIndex === featureIndex)
        if (i >= 0) next[i] = updatedRow
        return next
      })

      setDraft((prev) => {
        if (!prev) return prev
        const next = [...prev]
        const i = next.findIndex((r) => r.featureIndex === featureIndex)
        if (i >= 0) next[i] = updatedRow
        return next
      })
    } catch (err: any) {
      setError(err?.message || 'Failed to regenerate estimate')
    } finally {
      setRegenerating((prev) => ({ ...prev, [featureIndex]: false }))
    }
  }

  function reset() {
    if (original) setDraft(original)
  }

  function updateRange(rowIndex: number, dept: Department, key: keyof HoursRange, value: number) {
    setDraft((prev) => {
      if (!prev) return prev
      const next = [...prev]
      const row = { ...next[rowIndex] }
      const ranges = { ...row.ranges, [dept]: { ...row.ranges[dept], [key]: value } }
      row.ranges = ranges
      next[rowIndex] = row
      return next
    })
  }

  function updateField(rowIndex: number, key: 'complexity' | 'techRemarks' | 'userRemark', value: string) {
    setDraft((prev) => {
      if (!prev) return prev
      const next = [...prev]
      next[rowIndex] = { ...next[rowIndex], [key]: value }
      return next
    })
  }

  function exportToExcel() {
    if (!draft || draft.length === 0) {
      setError('No results to export. Load results first.')
      return
    }
    const id = String(activeSessionId || '').trim()
    const rows = draft.map((r) => ({
      sessionId: id,
      batch: r.batch,
      featureName: r.featureName,
      featureDescription: r.featureDescription,
      confidence: r.confidence,
      userRemark: r.userRemark,
      complexity: r.complexity,
      techRemarks: r.techRemarks,

      react_min: r.ranges.React.min,
      react_mostLikely: r.ranges.React.mostLikely,
      react_max: r.ranges.React.max,

      next_min: r.ranges.Next.min,
      next_mostLikely: r.ranges.Next.mostLikely,
      next_max: r.ranges.Next.max,

      vue_min: r.ranges.Vue.min,
      vue_mostLikely: r.ranges.Vue.mostLikely,
      vue_max: r.ranges.Vue.max,

      flutter_min: r.ranges.Flutter.min,
      flutter_mostLikely: r.ranges.Flutter.mostLikely,
      flutter_max: r.ranges.Flutter.max,

      reactNative_min: r.ranges["React.Native"].min,
      reactNative_mostLikely: r.ranges["React.Native"].mostLikely,
      reactNative_max: r.ranges["React.Native"].max,

      htmlCss_min: r.ranges["html/css"].min,
      htmlCss_mostLikely: r.ranges["html/css"].mostLikely,
      htmlCss_max: r.ranges["html/css"].max,

      aiMl_min: r.ranges["AI-ML"].min,
      aiMl_mostLikely: r.ranges["AI-ML"].mostLikely,
      aiMl_max: r.ranges["AI-ML"].max,

      nest_min: r.ranges.Nest.min,
      nest_mostLikely: r.ranges.Nest.mostLikely,
      nest_max: r.ranges.Nest.max,

      node_min: r.ranges.Node.min,
      node_mostLikely: r.ranges.Node.mostLikely,
      node_max: r.ranges.Node.max,

      dotNet_min: r.ranges.DotNet.min,
      dotNet_mostLikely: r.ranges.DotNet.mostLikely,
      dotNet_max: r.ranges.DotNet.max,

      blockchain_min: r.ranges.Blockchain.min,
      blockchain_mostLikely: r.ranges.Blockchain.mostLikely,
      blockchain_max: r.ranges.Blockchain.max,
    }))

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, 'Estimations')

    const array = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([array], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `estimation_${safeFilePart(id)}_${today()}.xlsx`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function exportAnnotatedOriginalExcel() {
    if (!draft || draft.length === 0) {
      setError('No results to export. Load results first.')
      return
    }
    if (!uploadedExcelFile) {
      setError('Original Excel file not found. Re-upload the Excel (Upload page) without refreshing, then try again.')
      return
    }
    const currentSession = String(activeSessionId || '').trim()
    const fileSession = String(uploadedExcelSessionId || '').trim()
    if (!currentSession || !fileSession || currentSession !== fileSession) {
      setError('The uploaded Excel file does not match the current sessionId. Re-upload the Excel for this session, then export again.')
      return
    }
    setError('')
    try {
      await exportUploadedExcelWithEstimates({
        originalFile: uploadedExcelFile,
        rows: draft,
      })
    } catch (err: any) {
      setError(err?.message || 'Failed to export annotated Excel')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Results</h1>
          <p className="mt-1 text-sm text-zinc-600">
            View and edit results locally, then export to Excel. Feature descriptions come from the original uploaded Excel.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Load results'}
          </Button>
          <Button variant="outline" onClick={reset} disabled={!original || loading}>
            Reset changes
          </Button>
          <Button onClick={exportToExcel} disabled={!draft || draft.length === 0}>
            Export to Excel
          </Button>
          <Button
            variant="secondary"
            onClick={exportAnnotatedOriginalExcel}
            disabled={
              !draft ||
              draft.length === 0 ||
              !uploadedExcelFile ||
              !uploadedExcelSessionId ||
              String(uploadedExcelSessionId || '').trim() !== String(activeSessionId || '').trim()
            }
          >
            Download annotated original Excel
          </Button>
        </div>
      </div>

      {error ? (
        <Alert className="border-red-200 bg-red-50">
          <AlertTitle>Results error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Estimations</CardTitle>
        </CardHeader>
        <CardContent>
          {!draft || draft.length === 0 ? (
            <div className="text-sm text-zinc-600">No results loaded yet.</div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="rounded-md border border-zinc-200 bg-white p-4">
                <div className="text-sm font-medium text-zinc-900">Totals (mostLikely)</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
                  <div className="text-zinc-700">
                    <span className="text-zinc-500">Total:</span> <span className="font-semibold">{totals.total}</span>
                  </div>
                  {DEPARTMENTS.map((d) => (
                    <div key={d} className="text-zinc-700">
                      <span className="text-zinc-500">{d}:</span> <span className="font-semibold">{totals.sums[d]}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                {draft.map((row, rowIndex) => {
                  const isLow = row.confidence === 'Low'

                  return (
                    <div
                      key={`${row.featureIndex}-${row.featureName}`}
                      className={`rounded-md border p-4 ${isLow ? 'border-red-200 bg-red-50' : 'border-zinc-200 bg-white'}`}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-base font-semibold text-zinc-900">{row.featureName || '—'}</div>
                            <div
                              className={`rounded px-2 py-0.5 text-xs font-medium ${
                                isLow ? 'bg-red-100 text-red-800' : 'bg-zinc-100 text-zinc-800'
                              }`}
                              aria-label={`Confidence: ${row.confidence}`}
                            >
                              {row.confidence}
                            </div>
                            {row.batch ? (
                              <div className="text-xs text-zinc-600">
                                <span className="text-zinc-500">Batch:</span> {row.batch}
                              </div>
                            ) : null}
                          </div>

                          {row.featureDescription ? (
                            <details className="mt-2">
                              <summary className="cursor-pointer text-sm text-zinc-700">Feature description</summary>
                              <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{row.featureDescription}</div>
                            </details>
                          ) : (
                            <div className="mt-2 text-sm text-zinc-500">No description mapped from Excel.</div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => regenerate(row)}
                            disabled={!!regenerating[row.featureIndex]}
                            aria-disabled={!!regenerating[row.featureIndex]}
                          >
                            {regenerating[row.featureIndex] ? 'Regenerating…' : 'Regenerate'}
                          </Button>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="flex flex-col gap-2">
                          <Label>Complexity</Label>
                          <Input
                            value={row.complexity}
                            onChange={(e) => updateField(rowIndex, 'complexity', e.target.value)}
                            aria-label="Complexity"
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label>Tech remarks</Label>
                          <Input
                            value={row.techRemarks}
                            onChange={(e) => updateField(rowIndex, 'techRemarks', e.target.value)}
                            aria-label="Tech remarks"
                          />
                        </div>
                      </div>

                      <div className="mt-4 flex flex-col gap-2">
                        <Label>User remark (used for regenerating this feature)</Label>
                        <Textarea
                          value={row.userRemark}
                          onChange={(e) => updateField(rowIndex, 'userRemark', e.target.value)}
                          className="min-h-[80px]"
                          placeholder="Add your remark to refine/regenerate this estimate"
                        />
                      </div>

                      <div className="mt-4">
                        <div className="text-sm font-medium text-zinc-900">Hours (min / mostLikely / max)</div>
                        <div className="mt-2 overflow-x-auto">
                          <div className="min-w-[520px] rounded-md border border-zinc-200 bg-white">
                            <div className="grid grid-cols-[160px_repeat(3,minmax(100px,1fr))] gap-0 border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-700">
                              <div>Department</div>
                              <div className="text-center">Min</div>
                              <div className="text-center">Most likely</div>
                              <div className="text-center">Max</div>
                            </div>

                            {DEPARTMENTS.map((dept) => {
                              const r = row.ranges[dept]
                              return (
                                <div
                                  key={dept}
                                  className="grid grid-cols-[160px_repeat(3,minmax(100px,1fr))] items-center gap-2 border-b border-zinc-200 px-3 py-2 last:border-b-0"
                                >
                                  <div className="text-sm font-medium text-zinc-900">{dept}</div>
                                  <Input
                                    type="number"
                                    min={0}
                                    inputMode="numeric"
                                    value={r.min}
                                    onChange={(e) => updateRange(rowIndex, dept, 'min', Number(e.target.value))}
                                    aria-label={`${dept} min hours`}
                                  />
                                  <Input
                                    type="number"
                                    min={0}
                                    inputMode="numeric"
                                    value={r.mostLikely}
                                    onChange={(e) => updateRange(rowIndex, dept, 'mostLikely', Number(e.target.value))}
                                    aria-label={`${dept} most likely hours`}
                                  />
                                  <Input
                                    type="number"
                                    min={0}
                                    inputMode="numeric"
                                    value={r.max}
                                    onChange={(e) => updateRange(rowIndex, dept, 'max', Number(e.target.value))}
                                    aria-label={`${dept} max hours`}
                                  />
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
