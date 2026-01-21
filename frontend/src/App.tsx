import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import { ChatProvider } from "@/context/ChatContext"
import { AuthProvider } from "@/context/AuthContext"
import { PrivateRoute } from "@/components/PrivateRoute"
import { Toaster } from "sonner"

import Login from "@/pages/Login"
import ChatView from "@/pages/ChatView"
import KnowledgeBase from "@/pages/KnowledgeBase"
import Assets from "@/pages/Assets"
import Settings from "@/pages/Settings"
import SearchResults from "@/pages/SearchResults"

function App() {
  return (
    <AuthProvider>
      <ChatProvider>
        <Router>
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
        </Router>
        <Toaster richColors position="top-right" />
      </ChatProvider>
    </AuthProvider>
  )
}

export default App
