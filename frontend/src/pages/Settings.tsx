import { useState, useEffect } from "react"
import { DashboardLayout } from "@/components/layout/DashboardLayout"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { api } from "@/lib/api"
import { toast } from "sonner"
import { useAuth } from "@/context/AuthContext"
import { Shield, User, Loader2 } from "lucide-react"

interface UserInfo {
  username: string;
  role: 'admin' | 'user';
  created_at?: string;
}

export default function Settings() {
  const { user: currentUser } = useAuth()
  
  const [config, setConfig] = useState<any>({
      llm_provider: 'dashscope',
      api_key: '',
      model_name: '',
      base_url: '',
      top_k: 60,
      temperature: 0.5
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  
  // User management state
  const [users, setUsers] = useState<UserInfo[]>([])
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)
  const [roleChangeTarget, setRoleChangeTarget] = useState<{username: string, newRole: 'admin' | 'user'} | null>(null)

  useEffect(() => {
      loadConfig()
      loadUsers()
  }, [])

  const loadConfig = async () => {
      setIsLoading(true)
      try {
          const res = await api.getConfig()
          if (res) {
              setConfig((prev: any) => ({ ...prev, ...res }))
          }
      } catch (e) {
          console.error("Failed to load config", e)
      } finally {
          setIsLoading(false)
      }
  }
  
  const loadUsers = async () => {
      setIsLoadingUsers(true)
      try {
          const res = await api.getUsers()
          setUsers(res)
      } catch (e) {
          console.error("Failed to load users", e)
      } finally {
          setIsLoadingUsers(false)
      }
  }

  const saveConfig = async () => {
      setIsSaving(true)
      try {
          await api.updateConfig(config)
          toast.success("配置已保存！")
      } catch (e) {
          toast.error("保存失败：" + e)
      } finally {
          setIsSaving(false)
      }
  }
  
  const handleRoleChange = async () => {
      if (!roleChangeTarget) return
      
      try {
          await api.updateUserRole(roleChangeTarget.username, roleChangeTarget.newRole)
          toast.success(`用户 ${roleChangeTarget.username} 已${roleChangeTarget.newRole === 'admin' ? '设为管理员' : '降为普通用户'}`)
          loadUsers()
      } catch (e: any) {
          toast.error(e?.message || "操作失败")
      } finally {
          setRoleChangeTarget(null)
      }
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">系统设置</h1>
          <p className="text-slate-500 text-sm">配置系统参数与偏好</p>
        </div>
        
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            {isLoading ? (
                <div className="text-center py-12 text-slate-400">Loading settings...</div>
            ) : (
                <Tabs defaultValue="models" className="w-full">
                    <TabsList className="mb-6 w-full justify-start bg-slate-100 p-1 rounded-lg">
                        <TabsTrigger value="models" className="px-4 py-2">模型配置</TabsTrigger>
                        <TabsTrigger value="rag" className="px-4 py-2">RAG参数</TabsTrigger>
                        <TabsTrigger value="users" className="px-4 py-2">用户管理</TabsTrigger>
                    </TabsList>
                    
                    {/* Model Settings */}
                    <TabsContent value="models" className="space-y-6">
                         <div className="grid gap-4">
                             <div className="space-y-2">
                                 <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">LLM 提供商</label>
                                 <div className="flex gap-6 items-center">
                                     <label className="flex items-center gap-2 cursor-pointer">
                                         <input type="radio" name="provider" value="dashscope" 
                                                checked={config.llm_provider === 'dashscope'}
                                                onChange={(e) => setConfig({...config, llm_provider: e.target.value})}
                                                className="w-4 h-4 text-blue-600" />
                                         <span className="text-sm">DashScope (Qwen)</span>
                                     </label>
                                     <label className="flex items-center gap-2 cursor-pointer">
                                         <input type="radio" name="provider" value="deepseek" 
                                                checked={config.llm_provider === 'deepseek'}
                                                onChange={(e) => setConfig({...config, llm_provider: e.target.value})}
                                                className="w-4 h-4 text-blue-600" />
                                         <span className="text-sm">DeepSeek</span>
                                     </label>
                                     <label className="flex items-center gap-2 cursor-pointer">
                                         <input type="radio" name="provider" value="openai" 
                                                checked={config.llm_provider === 'openai'}
                                                onChange={(e) => setConfig({...config, llm_provider: e.target.value})}
                                                className="w-4 h-4 text-blue-600" />
                                         <span className="text-sm">OpenAI Compatible</span>
                                     </label>
                                 </div>
                             </div>

                             <div className="space-y-2">
                                 <label className="text-sm font-medium">Base URL (仅 OpenAI/DeepSeek)</label>
                                 <Input 
                                     value={config.base_url || ""} 
                                     onChange={(e) => setConfig({...config, base_url: e.target.value})}
                                     placeholder={config.llm_provider === 'deepseek' ? "https://api.deepseek.com" : "https://api.openai.com/v1"}
                                     disabled={config.llm_provider === 'dashscope'}
                                 />
                                 <p className="text-xs text-slate-500">如果使用 DeepSeek 官方API，通常为 https://api.deepseek.com</p>
                             </div>

                             <div className="space-y-2">
                                 <label className="text-sm font-medium">API Key</label>
                                 <Input 
                                     type="password"
                                     value={config.api_key || ""} 
                                     onChange={(e) => setConfig({...config, api_key: e.target.value})}
                                     placeholder="sk-..."
                                 />
                             </div>

                             <div className="space-y-2">
                                 <label className="text-sm font-medium">模型名称</label>
                                 <Input 
                                     value={config.model_name || ""} 
                                     onChange={(e) => setConfig({...config, model_name: e.target.value})}
                                     placeholder="e.g. deepseek-chat, qwen-plus"
                                 />
                                 <p className="text-xs text-slate-500">DeepSeek常用: deepseek-chat; Qwen常用: qwen-plus, qwen-max</p>
                             </div>
                         </div>
                         
                         <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
                             <Button onClick={saveConfig} disabled={isSaving}>
                                 {isSaving ? "Saving..." : "保存配置"}
                             </Button>
                         </div>
                    </TabsContent>

                    {/* RAG Parameters */}
                    <TabsContent value="rag" className="space-y-6">
                         <div className="grid gap-6">
                             <div className="space-y-4">
                                 <div className="flex justify-between">
                                     <label className="text-sm font-medium">Top K (检索片段数)</label>
                                     <span className="text-sm font-mono text-slate-500">{config.top_k}</span>
                                 </div>
                                 <input 
                                     type="range"
                                     value={config.top_k || 60} 
                                     max={200} min={10} step={5}
                                     onChange={(e) => setConfig({...config, top_k: parseInt(e.target.value)})}
                                     className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
                                 />
                                 <p className="text-xs text-slate-500">每次回答问题时引用的最大片段数量。太少可能漏掉信息，太多可能干扰模型。</p>
                             </div>

                             <div className="space-y-4">
                                 <div className="flex justify-between">
                                     <label className="text-sm font-medium">Temperature (随机度)</label>
                                     <span className="text-sm font-mono text-slate-500">{config.temperature}</span>
                                 </div>
                                 <input 
                                     type="range"
                                     value={config.temperature !== undefined ? config.temperature : 0.5} 
                                     max={2} min={0} step={0.1}
                                     onChange={(e) => setConfig({...config, temperature: parseFloat(e.target.value)})}
                                     className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
                                 />
                                 <p className="text-xs text-slate-500">0.0 最严谨，1.0 最发散。RAG 任务建议 0.3-0.7。</p>
                             </div>

                             <div className="space-y-4">
                                 <div className="flex justify-between">
                                     <label className="text-sm font-medium">Hybrid Alpha (检索策略)</label>
                                     <span className="text-sm font-mono text-slate-500">{config.hybrid_alpha ?? 0.5}</span>
                                 </div>
                                 <input 
                                     type="range"
                                     value={config.hybrid_alpha ?? 0.5} 
                                     max={1} min={0} step={0.1}
                                     onChange={(e) => setConfig({...config, hybrid_alpha: parseFloat(e.target.value)})}
                                     className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
                                 />
                                 <p className="text-xs text-slate-500">0.0 = 纯关键词(BM25)，1.0 = 纯向量相似度。混合推荐 0.5。</p>
                             </div>
                         </div>
                         
                         <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
                             <Button onClick={saveConfig} disabled={isSaving}>
                                 {isSaving ? "Saving..." : "保存配置"}
                             </Button>
                         </div>
                    </TabsContent>
                    
                    {/* User Management */}
                    <TabsContent value="users" className="space-y-6">
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-slate-500">管理系统用户和权限</p>
                            <Button variant="outline" size="sm" onClick={loadUsers} disabled={isLoadingUsers}>
                                {isLoadingUsers ? <Loader2 className="h-4 w-4 animate-spin" /> : "刷新"}
                            </Button>
                        </div>
                        
                        <div className="border rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 border-b">
                                    <tr>
                                        <th className="text-left px-4 py-3 font-medium text-slate-600">用户名</th>
                                        <th className="text-left px-4 py-3 font-medium text-slate-600">角色</th>
                                        <th className="text-left px-4 py-3 font-medium text-slate-600">创建时间</th>
                                        <th className="text-right px-4 py-3 font-medium text-slate-600">操作</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {users.map((u) => (
                                        <tr key={u.username} className="hover:bg-slate-50/50">
                                            <td className="px-4 py-3 flex items-center gap-2">
                                                {u.role === 'admin' ? (
                                                    <Shield className="h-4 w-4 text-amber-500" />
                                                ) : (
                                                    <User className="h-4 w-4 text-slate-400" />
                                                )}
                                                <span className="font-medium">{u.username}</span>
                                                {u.username === currentUser?.username && (
                                                    <Badge variant="outline" className="text-xs">当前</Badge>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                                                    {u.role === 'admin' ? '管理员' : '普通用户'}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-slate-500">
                                                {u.created_at?.split('T')[0] || '-'}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {u.username !== currentUser?.username && (
                                                    u.role === 'user' ? (
                                                        <Button 
                                                            size="sm" 
                                                            variant="outline"
                                                            onClick={() => setRoleChangeTarget({username: u.username, newRole: 'admin'})}
                                                        >
                                                            设为管理员
                                                        </Button>
                                                    ) : (
                                                        <Button 
                                                            size="sm" 
                                                            variant="ghost"
                                                            className="text-slate-500"
                                                            onClick={() => setRoleChangeTarget({username: u.username, newRole: 'user'})}
                                                        >
                                                            降为普通用户
                                                        </Button>
                                                    )
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {users.length === 0 && !isLoadingUsers && (
                                <div className="text-center py-8 text-slate-400">暂无用户数据</div>
                            )}
                        </div>
                    </TabsContent>
                </Tabs>
            )}
        </div>
      </div>
      
      {/* Role Change Confirmation */}
      <AlertDialog open={!!roleChangeTarget} onOpenChange={(open) => !open && setRoleChangeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认修改权限</AlertDialogTitle>
            <AlertDialogDescription>
              确定要将用户 "{roleChangeTarget?.username}" {roleChangeTarget?.newRole === 'admin' ? '提升为管理员' : '降级为普通用户'} 吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleRoleChange}>
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  )
}

