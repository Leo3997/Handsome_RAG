import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "./AppSidebar"
import { Search } from "lucide-react"
import { GlobalUploadPanel } from "../GlobalUploadPanel"

import { useNavigate } from "react-router-dom"

export function DashboardLayout({ children, onSearch }: { children: React.ReactNode, onSearch?: (query: string) => void }) {
  const navigate = useNavigate()

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !onSearch) {
      // Only trigger global search navigation if no local search handler
      const query = e.currentTarget.value
      if (query.trim()) {
        navigate(`/search?q=${encodeURIComponent(query)}`)
      }
    }
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-[#F8FAFC]">
        <AppSidebar />
        <main className="flex-1 overflow-hidden">
          {/* Header / Navbar */}
          <header className="sticky top-0 z-10 flex h-16 items-center justify-between px-6 bg-white/50 backdrop-blur-md border-b border-slate-200">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="text-slate-600 hover:text-slate-900" />
              <div className="h-4 w-[1px] bg-slate-200" />
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="search"
                  placeholder="搜索文档或对话..."
                  className="h-9 w-64 rounded-md border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm focus:border-slate-400 focus:outline-none transition-all"
                  onChange={(e) => onSearch?.(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {/* 用户头像区域 - 已删除临时占位符 */}
            </div>
          </header>

          {/* Main Content Area */}
          <div className="p-6">
            <div className="mx-auto max-w-7xl h-[calc(100vh-8rem)] overflow-y-auto">
              {children}
            </div>
          </div>
          <GlobalUploadPanel />
        </main>
      </div>
    </SidebarProvider>
  )
}
