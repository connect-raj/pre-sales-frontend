import { useMemo, useState, useEffect } from 'react'
import { AlertCircle } from 'lucide-react'
import type { ExcelUploadResponse } from '../api/types'
import { useApiStatus } from '../state/api-status'
import { useSession } from '../state/session'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'

type UploadKind = 'document' | 'excel'

const UPLOAD_TIMEOUT_MS: Record<UploadKind, number> = {
  document: 60_000,
  // Excel upload includes parse + Cloudinary upload; allow longer.
  excel: 180_000,
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function UploadPage() {
  const { apiFetch } = useApiStatus()
  const {
    setActiveSessionId,
    setDetectedDepartments,
    setFeatureDescriptions,
    setUploadedExcelFile,
    setUploadedExcelSessionId,
    setSpecialInstructions,
    specialInstructions: sessionSpecialInstructions,
    clearSessionMeta,
  } = useSession()

  const [ingesting, setIngesting] = useState(false)
  const [ingestError, setIngestError] = useState<string | null>(null)

  async function handleIngestHistory() {
    setIngesting(true)
    setIngestError(null)
    try {
      await apiFetch('/history/ingest', { method: 'POST' })
    } catch (err: any) {
      setIngestError(err?.message || 'Ingestion failed')
    } finally {
      setIngesting(false)
    }
  }

  const [files, setFiles] = useState<Record<UploadKind, File | null>>({
    document: null,
    excel: null,
  })

  const [loading, setLoading] = useState<Record<UploadKind, boolean>>({
    document: false,
    excel: false,
  })

  const [error, setError] = useState<Record<UploadKind, string>>({
    document: '',
    excel: '',
  })

  const [response, setResponse] = useState<Record<UploadKind, any>>({
    document: null,
    excel: null,
  })

  const [specialInstructions, setSpecialInstructionsLocal] = useState<string[]>(Array.isArray(sessionSpecialInstructions) ? sessionSpecialInstructions : [])
  const [newInstruction, setNewInstruction] = useState('')

  const excelBatchSummary = useMemo(() => {
    const excel = response.excel as ExcelUploadResponse | null
    const batches: any[] = Array.isArray(excel?.batches) ? (excel!.batches as any[]) : []
    return batches.map((b) => {
      const name = String(b?.batchName || 'Unnamed')
      const count = Array.isArray(b?.features)
        ? b.features.length
        : Array.isArray(b?.featureIds)
          ? b.featureIds.length
          : 0
      return { name, count }
    })
  }, [response.excel])

  async function handleUpload(kind: UploadKind) {
    setError((e) => ({ ...e, [kind]: '' }))
    const file = files[kind]
    if (!file) {
      setError((e) => ({ ...e, [kind]: 'Please choose a file first.' }))
      return
    }

    setLoading((l) => ({ ...l, [kind]: true }))
    try {
      const form = new FormData()
      form.append('file', file)
      // If this is a document upload, include special instructions text for embedding
      if (kind === 'document') {
        const text = Array.isArray(specialInstructions) ? specialInstructions.join('\n') : String(specialInstructions || '')
        form.append('text', text)
      }
      const route = kind === 'excel' ? '/file/upload/excel' : '/file/upload/document'
      const res = await apiFetch(route, {
        method: 'POST',
        body: form,
        timeoutMs: UPLOAD_TIMEOUT_MS[kind],
      })
      setResponse((r) => ({ ...r, [kind]: res }))

      if (kind === 'excel') {
        const excel = res as ExcelUploadResponse
        const sessionId = String(excel.sessionId || '').trim()
        if (sessionId) setActiveSessionId(sessionId)

        setUploadedExcelFile(file)
        setUploadedExcelSessionId(sessionId)

        clearSessionMeta()
        if (Array.isArray(excel.detectedDepartments)) setDetectedDepartments(excel.detectedDepartments)
        if (excel.featureDescriptions && typeof excel.featureDescriptions === 'object')
          setFeatureDescriptions(excel.featureDescriptions)
      }
    } catch (err: any) {
      setError((e) => ({ ...e, [kind]: err?.message || 'Upload failed' }))
    } finally {
      setLoading((l) => ({ ...l, [kind]: false }))
    }
  }

  // Keep session in sync whenever local specialInstructions change
  useEffect(() => {
    setSpecialInstructions(specialInstructions)
  }, [specialInstructions, setSpecialInstructions])

  function UploadCard(props: {
    kind: UploadKind
    title: string
    accept: string
    note: string
    disabled?: boolean
  }) {
    const res = response[props.kind]
    return (
      <Card>
        <CardHeader>
          <CardTitle>{props.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="text-sm text-zinc-600">{props.note}</div>
            <div className="flex items-center gap-3">
              <Input
                type="file"
                accept={props.accept}
                disabled={ingesting}
                onChange={(e) =>
                  setFiles((f) => ({
                    ...f,
                    [props.kind]: e.target.files?.[0] ?? null,
                  }))
                }
              />
              <Button onClick={() => handleUpload(props.kind)} disabled={loading[props.kind] || ingesting}>
                {loading[props.kind] ? 'Uploading…' : 'Upload'}
              </Button>
            </div>
            {error[props.kind] ? (
              <Alert className="border-red-200 bg-red-50">
                <AlertTitle>Upload error</AlertTitle>
                <AlertDescription>{error[props.kind]}</AlertDescription>
              </Alert>
            ) : null}

            {res ? (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
                <div className="font-medium">Uploaded</div>
                <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                  <div>
                    <span className="text-zinc-600">File:</span> {String(res.fileName || '')}
                  </div>
                  <div>
                    <span className="text-zinc-600">Saved as:</span> {String(res.savedName || '')}
                  </div>
                  <div>
                    <span className="text-zinc-600">Size:</span> {formatBytes(Number(res.size || 0))}
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-zinc-600">Path:</span> {String(res.path || '')}
                  </div>
                  {res.url ? (
                    <div className="sm:col-span-2">
                      <span className="text-zinc-600">URL:</span> {String(res.url)}
                    </div>
                  ) : null}
                  {props.kind === 'excel' && res.sessionId ? (
                    <div className="sm:col-span-2">
                      <span className="text-zinc-600">Session ID:</span> {String(res.sessionId)}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {props.kind === 'excel' && (response.excel as any)?.detectedDepartments?.length ? (
              <div className="rounded-md border border-zinc-200 bg-white p-3 text-sm">
                <div className="font-medium">Detected departments</div>
                <div className="mt-1 text-zinc-700">
                  {(response.excel as any).detectedDepartments.join(', ')}
                </div>
              </div>
            ) : null}

            {props.kind === 'excel' && excelBatchSummary.length > 0 ? (
              <div className="rounded-md border border-zinc-200 bg-white p-3 text-sm">
                <div className="font-medium">Batches</div>
                <ul className="mt-2 list-disc pl-5 text-zinc-700">
                  {excelBatchSummary.map((b) => (
                    <li key={b.name}>
                      {b.name} ({b.count} features)
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Upload Files</h1>
        <p className="mt-1 text-sm text-zinc-600">Upload documents (PDF / DOCX / HTML / TXT) and the Excel feature sheet. Document upload will store text as embeddings and use provided special instructions.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Special Instructions (moved from Start Estimation)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Input value={newInstruction} onChange={(e) => setNewInstruction(e.target.value)} placeholder="Add an instruction" />
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  const t = newInstruction.trim()
                  if (!t) return
                  setSpecialInstructionsLocal((x) => [...x, t])
                  setNewInstruction('')
                }}
              >
                Add
              </Button>
            </div>
            {specialInstructions.length > 0 ? (
              <ul className="list-disc pl-5 text-sm text-zinc-700">
                {specialInstructions.map((ins, idx) => (
                  <li key={`${idx}-${ins}`} className="flex items-center justify-between gap-3">
                    <span className="break-words">{ins}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setSpecialInstructionsLocal((x) => x.filter((_, i) => i !== idx))}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Ingest History Button */}
      <div className="mb-4">
        <Button
          onClick={handleIngestHistory}
          disabled={ingesting}
          className="w-full lg:w-auto"
        >
          {ingesting ? 'Ingesting History…' : 'Ingest History'}
        </Button>
        {ingestError && (
          <Alert className="border-red-200 bg-red-50 mt-2 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <AlertTitle>Ingestion error</AlertTitle>
            <AlertDescription>{ingestError}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <UploadCard
          kind="document"
          title="Upload Document's Like SOW, RFD and other"
          accept=".pdf,.doc,.docx,.html,.txt"
          note="Allowed: .pdf/.docx/.html/.txt (max 5MB). Text is stored as embeddings."
          disabled={ingesting}
        />
        <UploadCard
          kind="excel"
          title="Upload Excel"
          accept=".xls,.xlsx"
          note="Allowed: .xls/.xlsx (max 5MB). Returns sessionId + detected departments."
          disabled={ingesting}
        />
      </div>
    </div>
  )
}
