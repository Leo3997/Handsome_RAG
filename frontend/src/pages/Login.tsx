import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import logoImg from "@/assets/logo.png"

export default function Login() {
  const navigate = useNavigate()
  const { login, register } = useAuth()
  
  const [isLoading, setIsLoading] = useState(false)
  
  // Login form
  const [loginUsername, setLoginUsername] = useState("")
  const [loginPassword, setLoginPassword] = useState("")
  
  // Register form
  const [regUsername, setRegUsername] = useState("")
  const [regPassword, setRegPassword] = useState("")
  const [regConfirm, setRegConfirm] = useState("")

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!loginUsername || !loginPassword) {
      toast.error("请填写用户名和密码")
      return
    }
    
    setIsLoading(true)
    try {
      await login(loginUsername, loginPassword)
      toast.success("登录成功")
      navigate("/chat")
    } catch (err: any) {
      toast.error(err?.message || "登录失败")
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!regUsername || !regPassword) {
      toast.error("请填写所有字段")
      return
    }
    if (regPassword !== regConfirm) {
      toast.error("两次密码不一致")
      return
    }
    if (regPassword.length < 6) {
      toast.error("密码至少6个字符")
      return
    }
    
    setIsLoading(true)
    try {
      await register(regUsername, regPassword)
      toast.success("注册成功")
      navigate("/chat")
    } catch (err: any) {
      toast.error(err?.message || "注册失败")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4">
      <Card className="w-full max-w-md shadow-xl border-slate-200">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <img src={logoImg} alt="得鹿山" className="h-20 w-20 object-contain" />
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900">得鹿山 RAG</CardTitle>
          <CardDescription>企业知识库智能问答系统</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login">登录</TabsTrigger>
              <TabsTrigger value="register">注册</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">用户名</label>
                  <Input 
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder="请输入用户名"
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">密码</label>
                  <Input 
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="请输入密码"
                    disabled={isLoading}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  登录
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">用户名</label>
                  <Input 
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    placeholder="至少2个字符"
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">密码</label>
                  <Input 
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="至少6个字符"
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">确认密码</label>
                  <Input 
                    type="password"
                    value={regConfirm}
                    onChange={(e) => setRegConfirm(e.target.value)}
                    placeholder="再次输入密码"
                    disabled={isLoading}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  注册
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
