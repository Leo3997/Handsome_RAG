import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import { Suspense, lazy } from "react"
import { ChatProvider } from "@/context/ChatContext"
import { AuthProvider } from "@/context/AuthContext"
import { UploadProvider } from "@/context/UploadContext"
import { PrivateRoute } from "@/components/PrivateRoute"
import { PageLoading } from "@/components/PageLoading"
import { Toaster } from "sonner"

// Keep Login synchronous for fast initial render
import Login from "@/pages/Login"

// Lazy load heavy page components
const ChatView = lazy(() => import("@/pages/ChatView"))
const KnowledgeBase = lazy(() => import("@/pages/KnowledgeBase"))
const Assets = lazy(() => import("@/pages/Assets"))
const Settings = lazy(() => import("@/pages/Settings"))
const SearchResults = lazy(() => import("@/pages/SearchResults"))

function App() {
  return (
    <AuthProvider>
      <UploadProvider>
        <ChatProvider>
          <Router>
            <Suspense fallback={<PageLoading />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/" element={<Navigate to="/chat" replace />} />
                
                {/* User accessible routes */}
                <Route path="/chat" element={<PrivateRoute><ChatView /></PrivateRoute>} />
                <Route path="/assets" element={<PrivateRoute><Assets /></PrivateRoute>} />
                <Route path="/search" element={<PrivateRoute><SearchResults /></PrivateRoute>} />
                
                {/* Admin only routes */}
                <Route path="/knowledge" element={<PrivateRoute adminOnly><KnowledgeBase /></PrivateRoute>} />
                <Route path="/settings" element={<PrivateRoute adminOnly><Settings /></PrivateRoute>} />
              </Routes>
            </Suspense>
          </Router>
          <Toaster richColors position="top-right" />
        </ChatProvider>
      </UploadProvider>
    </AuthProvider>
  )
}

export default App
