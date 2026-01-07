import { useState } from 'react'
import { FileUp, CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react'
import { useApiStatus } from '../state/api-status'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import type { FileUploadResponseBase } from '../api/types'

interface FileStatus {
    file: File
    status: 'pending' | 'uploading' | 'success' | 'error'
    error?: string
    result?: FileUploadResponseBase
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

export function PastFilesPage() {
    const { apiFetch } = useApiStatus()
    const [fileStatuses, setFileStatuses] = useState<FileStatus[]>([])
    const [overallLoading, setOverallLoading] = useState(false)
    const [overallError, setOverallError] = useState<string | null>(null)

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return
        const newFiles = Array.from(e.target.files).map((file) => ({
            file,
            status: 'pending' as const,
        }))
        setFileStatuses((prev) => [...prev, ...newFiles])
        // Clear input so same file can be selected again if removed
        e.target.value = ''
    }

    const removeFile = (index: number) => {
        setFileStatuses((prev) => prev.filter((_, i) => i !== index))
    }

    const uploadAll = async () => {
        const pendingIndexes = fileStatuses
            .map((fs, i) => (fs.status === 'pending' || fs.status === 'error' ? i : -1))
            .filter((i) => i !== -1)

        if (pendingIndexes.length === 0) return

        setOverallLoading(true)
        setOverallError(null)

        try {
            const form = new FormData()
            pendingIndexes.forEach((idx) => {
                form.append('files', fileStatuses[idx].file)
            })

            // Update statuses to uploading
            setFileStatuses((prev) =>
                prev.map((fs, i) =>
                    pendingIndexes.includes(i) ? { ...fs, status: 'uploading' } : fs
                )
            )

            const results = await apiFetch('/file/upload/bulk', {
                method: 'POST',
                body: form,
                timeoutMs: 300_000, // 5 minutes for bulk upload
            })

            // Map results back to file statuses
            // Note: Backend returns results in same order as files sent
            setFileStatuses((prev) => {
                const next = [...prev]
                pendingIndexes.forEach((originalIdx, resultIdx) => {
                    const res = results[resultIdx]
                    if (res) {
                        next[originalIdx] = { ...next[originalIdx], status: 'success', result: res }
                    } else {
                        next[originalIdx] = { ...next[originalIdx], status: 'error', error: 'Upload failed' }
                    }
                })
                return next
            })
        } catch (err: any) {
            setOverallError(err?.message || 'Bulk upload failed')
            // Mark all pending as error
            setFileStatuses((prev) =>
                prev.map((fs, i) =>
                    pendingIndexes.includes(i) ? { ...fs, status: 'error', error: err?.message || 'Failed' } : fs
                )
            )
        } finally {
            setOverallLoading(false)
        }
    }

    const clearCompleted = () => {
        setFileStatuses((prev) => prev.filter((fs) => fs.status !== 'success'))
    }

    return (
        <div className="flex flex-col gap-6">
            <div>
                <h1 className="text-xl font-semibold">Past Files Upload</h1>
                <p className="mt-1 text-sm text-zinc-600">
                    Bulk upload historical documents (SOW, FRD, Excel, etc.) for processing and ingestion.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Select Files</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                            <label className="flex h-10 w-full cursor-pointer items-center justify-center rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-600 hover:bg-zinc-100">
                                <FileUp className="mr-2 h-4 w-4" />
                                Choose Files (PDF, DOCX, HTML, TXT, XLSX)
                                <input
                                    type="file"
                                    multiple
                                    accept=".pdf,.doc,.docx,.html,.txt,.xls,.xlsx"
                                    className="hidden"
                                    onChange={handleFileChange}
                                    disabled={overallLoading}
                                />
                            </label>
                            <Button
                                onClick={uploadAll}
                                disabled={overallLoading || !fileStatuses.some((fs) => fs.status === 'pending' || fs.status === 'error')}
                            >
                                {overallLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Upload All
                            </Button>
                        </div>

                        {overallError && (
                            <Alert className="border-red-200 bg-red-50">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>Error</AlertTitle>
                                <AlertDescription>{overallError}</AlertDescription>
                            </Alert>
                        )}

                        {fileStatuses.length > 0 && (
                            <div className="mt-4 flex flex-col gap-2">
                                <div className="flex items-center justify-between text-sm font-medium">
                                    <span>Selected Files ({fileStatuses.length})</span>
                                    <Button variant="ghost" size="sm" onClick={clearCompleted} disabled={overallLoading}>
                                        Clear Completed
                                    </Button>
                                </div>
                                <div className="rounded-md border border-zinc-200 divide-y divide-zinc-200 bg-white overflow-hidden">
                                    {fileStatuses.map((fs, idx) => (
                                        <div key={`${idx}-${fs.file.name}`} className="flex items-center justify-between p-3 text-sm">
                                            <div className="flex items-center gap-3 min-w-0">
                                                {fs.status === 'success' ? (
                                                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                                                ) : fs.status === 'error' ? (
                                                    <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                                                ) : fs.status === 'uploading' ? (
                                                    <Loader2 className="h-4 w-4 animate-spin text-zinc-400 shrink-0" />
                                                ) : (
                                                    <div className="h-4 w-4 rounded-full border border-zinc-300 shrink-0" />
                                                )}
                                                <div className="flex flex-col min-w-0">
                                                    <span className="truncate font-medium">{fs.file.name}</span>
                                                    <span className="text-xs text-zinc-500">{formatBytes(fs.file.size)}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {fs.status === 'error' && (
                                                    <span className="text-xs text-red-500 font-medium truncate max-w-[150px]">
                                                        {fs.error}
                                                    </span>
                                                )}
                                                {fs.status === 'success' && fs.result?.savedName && (
                                                    <span className="text-xs text-zinc-400 font-mono hidden sm:inline">
                                                        {fs.result.savedName}
                                                    </span>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => removeFile(idx)}
                                                    disabled={fs.status === 'uploading' || overallLoading}
                                                >
                                                    {fs.status === 'success' ? 'Dismiss' : 'Remove'}
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
