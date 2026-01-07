import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ApiStatusProvider } from './state/api-status'
import { SessionProvider } from './state/session'
import { UploadPage } from './pages/UploadPage'
import { EstimatePage } from './pages/EstimatePage'
import { StatusPage } from './pages/StatusPage'
import { ResultsPage } from './pages/ResultsPage'
import { PastFilesPage } from './pages/PastFilesPage'

export default function App() {
  return (
    <ApiStatusProvider>
      <SessionProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/upload" replace />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/estimate" element={<EstimatePage />} />
            <Route path="/status" element={<StatusPage />} />
            <Route path="/results" element={<ResultsPage />} />
            <Route path="/past-files" element={<PastFilesPage />} />
            <Route path="*" element={<Navigate to="/upload" replace />} />
          </Routes>
        </Layout>
      </SessionProvider>
    </ApiStatusProvider>
  )
}
