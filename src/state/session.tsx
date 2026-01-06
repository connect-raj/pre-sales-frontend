import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Department } from '../api/types'

type SessionState = {
  activeSessionId: string
  detectedDepartments: Department[]
  featureDescriptions: Record<string, string>
  uploadedExcelFile: File | null
  uploadedExcelSessionId: string
  specialInstructions: string[]
}

type SessionContextValue = SessionState & {
  setActiveSessionId: (id: string) => void
  setDetectedDepartments: (depts: Department[]) => void
  setFeatureDescriptions: (map: Record<string, string>) => void
  setUploadedExcelFile: (file: File | null) => void
  setUploadedExcelSessionId: (id: string) => void
  setSpecialInstructions: (ins: string[]) => void
  clearSessionMeta: () => void
}

const STORAGE_KEY = 'preSalesEstimator.activeSessionId'

const SessionContext = createContext<SessionContextValue | undefined>(undefined)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [activeSessionId, setActiveSessionIdState] = useState('')
  const [detectedDepartments, setDetectedDepartments] = useState<Department[]>([])
  const [featureDescriptions, setFeatureDescriptions] = useState<Record<string, string>>({})
  const [uploadedExcelFile, setUploadedExcelFile] = useState<File | null>(null)
  const [uploadedExcelSessionId, setUploadedExcelSessionIdState] = useState('')
  const [specialInstructions, setSpecialInstructionsState] = useState<string[]>([])

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved) setActiveSessionIdState(saved)
  }, [])

  const setActiveSessionId = (id: string) => {
    const normalized = String(id || '').trim()
    setActiveSessionIdState(normalized)
    if (normalized) window.localStorage.setItem(STORAGE_KEY, normalized)
    else window.localStorage.removeItem(STORAGE_KEY)
  }

  const setUploadedExcelSessionId = (id: string) => {
    setUploadedExcelSessionIdState(String(id || '').trim())
  }

  const setSpecialInstructions = (ins: string[]) => {
    setSpecialInstructionsState(Array.isArray(ins) ? ins : [])
  }

  const clearSessionMeta = () => {
    setDetectedDepartments([])
    setFeatureDescriptions({})
  }

  const value = useMemo(
    () => ({
      activeSessionId,
      detectedDepartments,
      featureDescriptions,
      uploadedExcelFile,
      uploadedExcelSessionId,
      specialInstructions,
      setActiveSessionId,
      setDetectedDepartments,
      setFeatureDescriptions,
      setUploadedExcelFile,
      setUploadedExcelSessionId,
      setSpecialInstructions,
      clearSessionMeta,
    }),
    [activeSessionId, detectedDepartments, featureDescriptions, uploadedExcelFile, uploadedExcelSessionId, specialInstructions],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}
