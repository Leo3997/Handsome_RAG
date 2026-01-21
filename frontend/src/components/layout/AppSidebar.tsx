import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar"
import { MessageSquare, LayoutGrid, Settings, Database, LogOut, User } from "lucide-react"
import { Button } from "@/components/ui/button"

import { Link, useLocation, useNavigate } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"
import logoImg from "@/assets/logo.png"

const allItems = [
  {
    title: "智能对话",
    url: "/chat",
    icon: MessageSquare,
    adminOnly: false,
  },
  {
    title: "知识库管理",
    url: "/knowledge",
    icon: Database,
    adminOnly: true,
  },
  {
    title: "资源预览",
    url: "/assets",
    icon: LayoutGrid,
    adminOnly: false,
  },
  {
    title: "系统设置",
    url: "/settings",
    icon: Settings,
    adminOnly: true,
  },
]

export function AppSidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, isAdmin, logout } = useAuth()
  
  // Filter menu items based on role
  const items = allItems.filter(item => !item.adminOnly || isAdmin)
  
  const handleLogout = () => {
    logout()
    navigate('/login')
  }
  
  return (
    <Sidebar className="border-r border-slate-200 bg-white/80 backdrop-blur-md">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3 px-2 py-1">
          <img src={logoImg} alt="得鹿山" className="h-20 w-20 object-contain" />
          <span className="text-xl font-bold tracking-tight text-slate-900">得鹿山 RAG</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            主菜单
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const isActive = location.pathname === item.url
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <Link 
                        to={item.url} 
                        className={`flex items-center gap-3 px-5 py-3 transition-colors ${
                          isActive 
                            ? 'bg-slate-100 text-slate-900 font-semibold border-l-2 border-slate-900' 
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        <item.icon className={`h-5 w-5 ${isActive ? 'text-slate-900' : ''}`} />
                        <span className="font-medium">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      
      {/* User Footer */}
      <SidebarFooter className="p-4 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center">
              <User className="h-4 w-4 text-slate-600" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-slate-900">{user?.username}</span>
              <span className="text-xs text-slate-500">
                {isAdmin ? '管理员' : '普通用户'}
              </span>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50"
            onClick={handleLogout}
            title="退出登录"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
