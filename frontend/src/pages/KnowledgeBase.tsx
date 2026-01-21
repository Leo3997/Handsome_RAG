import { useState, useEffect } from "react"
import { DashboardLayout } from "@/components/layout/DashboardLayout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { 
  FileUp, 
  FileText, 
  FileSpreadsheet, 
  Presentation, 
  Image as ImageIcon,
  Filter,
  CheckCircle2,
  Clock,
  Trash2,
  Eye,
  Check,
  Loader2,
  Database
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

import { api } from "@/lib/api"
import { FilePreviewDialog } from "@/components/FilePreviewDialog"

export default function KnowledgeBase() {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [files, setFiles] = useState<any[]>([])
  const [stats, setStats] = useState({ totalFiles: 0, indexedChunks: 0, dbSize: "Active" })

  // Knowledge Base State
  const [knowledgeBases, setKnowledgeBases] = useState<any[]>([])
  const [currentKbId, setCurrentKbId] = useState("default")
  const [showKbMenu, setShowKbMenu] = useState(false)
  const [showNewKbDialog, setShowNewKbDialog] = useState(false)
  const [newKbName, setNewKbName] = useState("")

  // Selection & Preview State
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [previewFile, setPreviewFile] = useState<any>(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Filter State
  const [filterType, setFilterType] = useState<string>("all")
  const [showFilterMenu, setShowFilterMenu] = useState(false)

  // Tag Editing State
  const [editingTagsFile, setEditingTagsFile] = useState<string | null>(null)
  const [newTagsString, setNewTagsString] = useState("")
  const [isSavingTags, setIsSavingTags] = useState(false)

  const FILE_TYPES = [
    { value: "all", label: "全部类型" },
    { value: "pptx", label: "PPT" },
    { value: "pdf", label: "PDF" },
    { value: "docx", label: "Word" },
    { value: "xlsx", label: "Excel" },
  ]

  // Filtered files
  const filteredFiles = filterType === "all" 
    ? files 
    : files.filter(f => f.type === filterType)

  const currentKb = knowledgeBases.find(kb => kb.id === currentKbId)

  useEffect(() => {
    fetchKnowledgeBases()
  }, [])

  useEffect(() => {
    if (currentKbId) {
      fetchDocuments(currentKbId)
    }
  }, [currentKbId])

  const fetchKnowledgeBases = async () => {
    try {
      const kbs = await api.getKnowledgeBases()
      setKnowledgeBases(kbs)
    } catch (error) {
      console.error("Failed to fetch knowledge bases:", error)
    }
  }

  const fetchDocuments = async (kbId: string) => {
    try {
      const [docs, backendStats] = await Promise.all([
        api.getKbDocuments(kbId),
        api.getStats()
      ])
      
      setFiles(docs)
      setStats({
        totalFiles: docs.length,
        indexedChunks: backendStats.indexed_chunks,
        dbSize: "Active"
      })
    } catch (error) {
      console.error("Failed to fetch data:", error)
    }
  }

  const handleCreateKb = async () => {
    if (!newKbName.trim()) return
    try {
      await api.createKnowledgeBase(newKbName)
      setNewKbName("")
      setShowNewKbDialog(false)
      fetchKnowledgeBases()
      toast.success(`知识库 "${newKbName}" 创建成功`)
    } catch (error) {
      toast.error("创建失败")
    }
  }

  const handleSaveTags = async () => {
    if (!editingTagsFile) return
    setIsSavingTags(true)
    try {
      const tags = newTagsString.split(',').map(t => t.trim()).filter(t => t !== "")
      await api.updateDocumentTags(editingTagsFile, tags, currentKbId)
      toast.success("标签已更新")
      setEditingTagsFile(null)
      fetchDocuments(currentKbId)
    } catch (error) {
      toast.error("更新标签失败")
    } finally {
      setIsSavingTags(false)
    }
  }

  const toggleSelect = (filename: string) => {
    setSelectedFiles(prev => 
      prev.includes(filename) 
        ? prev.filter(f => f !== filename) 
        : [...prev, filename]
    )
  }

  const toggleSelectAll = () => {
    if (selectedFiles.length === files.length) {
      setSelectedFiles([])
    } else {
      setSelectedFiles(files.map(f => f.name))
    }
  }

  const handleBatchDelete = async () => {
    if (selectedFiles.length === 0) return
    if (!confirm(`确定要删除选中的 ${selectedFiles.length} 个文件吗？此操作不可撤销。`)) return

    setIsDeleting(true)
    try {
      const res = await api.deleteFilesBatch(selectedFiles)
      toast.success(res.message || "批量删除成功")
      setSelectedFiles([])
      fetchDocuments(currentKbId)
    } catch (error) {
      toast.error("批量删除失败")
    } finally {
      setIsDeleting(false)
    }
  }

  const handlePreview = (file: any) => {
    setPreviewFile(file)
    setIsPreviewOpen(true)
  }

  const handleUploadClick = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = ".pptx,.pdf,.docx,.txt,.xlsx"
    input.onchange = async (e: any) => {
      const file = e.target.files[0]
      if (!file) return

      setUploading(true)
      setProgress(10)
      
      try {
        const res = await api.uploadFile(file)
        
        if (res.task_id) {
          setProgress(30)
          toast.info(`文件已上传，正在后台处理中...`)
          
          // Poll for task status
          const taskId = res.task_id
          const pollInterval = setInterval(async () => {
            try {
              const statusRes = await api.getTaskStatus(taskId)
              
              if (statusRes.status === 'processing') {
                setProgress(prev => Math.min(prev + 10, 90))
              } else if (statusRes.status === 'completed') {
                clearInterval(pollInterval)
                setProgress(100)
                toast.success(`文件 ${file.name} 处理完成！`)
                setTimeout(() => {
                  setUploading(false)
                  fetchDocuments(currentKbId)
                }, 500)
              } else if (statusRes.status === 'failed') {
                clearInterval(pollInterval)
                setUploading(false)
                toast.error(`文件处理失败: ${statusRes.error}`)
              }
            } catch (e) {
              clearInterval(pollInterval)
              setUploading(false)
              toast.error("检查任务状态失败")
            }
          }, 1500)
        } else {
          // Fallback for synchronous processing
          setProgress(100)
          setTimeout(() => {
            setUploading(false)
            fetchDocuments(currentKbId)
          }, 500)
        }
      } catch (error) {
        console.error("Upload Error:", error)
        setUploading(false)
        toast.error("上传失败，请重试")
      }
    }
    input.click()
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">知识库管理</h1>
              <p className="text-slate-500 text-sm">上传并管理您的多模态资源文件</p>
            </div>
            {/* Knowledge Base Selector */}
            <div className="relative">
              <Button 
                variant="outline" 
                className="gap-2 min-w-40"
                onClick={() => setShowKbMenu(!showKbMenu)}
              >
                <Database className="h-4 w-4 text-cyan-500" />
                {currentKb?.name || "加载中..."}
              </Button>
              {showKbMenu && (
                <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-48">
                  {knowledgeBases.map(kb => (
                    <button
                      key={kb.id}
                      onClick={() => { setCurrentKbId(kb.id); setShowKbMenu(false); }}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex justify-between items-center ${currentKbId === kb.id ? 'text-cyan-600 font-medium bg-cyan-50' : 'text-slate-600'}`}
                    >
                      <span>{kb.name}</span>
                      <span className="text-[10px] text-slate-400">{kb.file_count} 文件</span>
                    </button>
                  ))}
                  <div className="border-t border-slate-100 mt-1 pt-1">
                    <button
                      onClick={() => { setShowNewKbDialog(true); setShowKbMenu(false); }}
                      className="w-full px-4 py-2 text-left text-sm text-cyan-600 hover:bg-cyan-50 font-medium"
                    >
                      + 新建知识库
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {selectedFiles.length > 0 && (
              <Button 
                variant="destructive" 
                className="gap-2" 
                onClick={handleBatchDelete}
                disabled={isDeleting}
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                批量删除 ({selectedFiles.length})
              </Button>
            )}
            <div className="relative">
              <Button 
                variant="outline" 
                className="gap-2"
                onClick={() => setShowFilterMenu(!showFilterMenu)}
              >
                <Filter className="h-4 w-4" /> 
                {FILE_TYPES.find(t => t.value === filterType)?.label || "筛选"}
              </Button>
              {showFilterMenu && (
                <div className="absolute top-full right-0 mt-1 z-10 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-32">
                  {FILE_TYPES.map(type => (
                    <button
                      key={type.value}
                      onClick={() => { setFilterType(type.value); setShowFilterMenu(false); }}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-slate-50 ${filterType === type.value ? 'text-cyan-600 font-medium' : 'text-slate-600'}`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button className="bg-slate-900 hover:bg-slate-800 gap-2" onClick={handleUploadClick} disabled={uploading}>
              <FileUp className="h-4 w-4" /> 上传文件
            </Button>
          </div>
        </div>

        {uploading && (
          <Card className="border-cyan-200 bg-cyan-50/50">
            <CardContent className="p-4 flex flex-col gap-2">
              <div className="flex justify-between items-center text-sm font-medium text-cyan-900">
                <span>正在上传并索引资源...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2 bg-cyan-100" />
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Stats Cards */}
          <Card className="shadow-sm border-slate-200 bg-white hover:border-slate-300 transition-colors cursor-default">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase tracking-wider font-semibold text-slate-400">总文件数</CardDescription>
              <CardTitle className="text-2xl text-slate-900">{stats.totalFiles}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="shadow-sm border-slate-200 bg-white hover:border-slate-300 transition-colors cursor-default">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase tracking-wider font-semibold text-slate-400">已索引片段</CardDescription>
              <CardTitle className="text-2xl text-slate-900">{stats.indexedChunks}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="shadow-sm border-slate-200 bg-white hover:border-slate-300 transition-colors cursor-default">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase tracking-wider font-semibold text-slate-400">数据库状态</CardDescription>
              <CardTitle className="text-2xl text-cyan-600 flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-cyan-500 animate-pulse" />
                {stats.dbSize}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card className="shadow-sm border-slate-200 overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 w-10">
                    <div 
                      onClick={toggleSelectAll}
                      className={`h-5 w-5 rounded border flex items-center justify-center transition-all cursor-pointer ${
                        selectedFiles.length === files.length && files.length > 0
                        ? 'bg-slate-900 border-slate-900' 
                        : 'bg-white border-slate-300 hover:border-slate-400'
                      }`}
                    >
                      {selectedFiles.length === files.length && files.length > 0 && <Check className="h-3 w-3 text-white" />}
                    </div>
                  </th>
                  <th className="px-6 py-4">文件名</th>
                  <th className="px-6 py-4 w-24 text-center">分块</th>
                  <th className="px-6 py-4 w-24">类型</th>
                  <th className="px-6 py-4 w-24">大小</th>
                  <th className="px-6 py-4 w-32">状态</th>
                  <th className="px-6 py-4 w-40">上传日期</th>
                  <th className="px-6 py-4 w-24">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredFiles.map((file) => (
                  <tr 
                    key={file.id} 
                    className={`hover:bg-slate-50/50 transition-colors group ${selectedFiles.includes(file.name) ? 'bg-slate-50' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <div 
                        onClick={() => toggleSelect(file.name)}
                        className={`h-5 w-5 rounded border flex items-center justify-center transition-all cursor-pointer ${
                          selectedFiles.includes(file.name) 
                          ? 'bg-slate-900 border-slate-900' 
                          : 'bg-white border-slate-200 group-hover:border-slate-300'
                        }`}
                      >
                        {selectedFiles.includes(file.name) && <Check className="h-3 w-3 text-white" />}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-900">
                      <div className="flex items-center gap-3">
                        {file.type === 'pptx' && <Presentation className="h-5 w-5 text-orange-500" />}
                        {file.type === 'pdf' && <FileText className="h-5 w-5 text-red-500" />}
                         {file.type === 'xlsx' && <FileSpreadsheet className="h-5 w-5 text-green-500" />}
                        {(file.type === 'png' || file.type === 'jpg' || file.type === 'svg') && <ImageIcon className="h-5 w-5 text-blue-500" />}
                        <div className="flex flex-col">
                          <span className="truncate max-w-[300px] font-medium" title={file.name}>{file.name}</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {file.tags && file.tags.map((tag: string) => (
                              <Badge key={tag} variant="secondary" className="px-1 py-0 h-4 text-[9px] bg-slate-100 text-slate-500 border-none">
                                {tag}
                              </Badge>
                            ))}
                            <button 
                              onClick={() => { setEditingTagsFile(file.name); setNewTagsString(file.tags?.join(', ') || ""); }}
                              className="text-[9px] text-cyan-600 hover:underline"
                            >
                              {file.tags?.length ? '编辑' : '+ 标签'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500 font-mono text-xs">
                      {file.chunks || 0}
                    </td>
                    <td className="px-6 py-4 uppercase text-[10px] font-bold tracking-tighter text-slate-400">{file.type}</td>
                    <td className="px-6 py-4 text-slate-500 font-mono text-xs">{file.size}</td>
                    <td className="px-6 py-4">
                      {file.status === 'indexed' ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1 font-normal text-xs py-0 h-6">
                          <CheckCircle2 className="h-3 w-3" /> 已入库
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1 font-normal text-xs py-0 h-6 animate-pulse">
                          <Clock className="h-3 w-3" /> 索引中
                        </Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs">{file.date}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50"
                          onClick={() => handlePreview(file)}
                          title="预览"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50"
                          onClick={async () => {
                              if(confirm(`确定删除 ${file.name} 吗？`)) {
                                  await api.deleteFile(file.name)
                                  fetchDocuments(currentKbId)
                              }
                          }}
                          title="删除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {files.length === 0 && (
                <div className="p-16 text-center">
                    <div className="mx-auto w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                        <FileText className="h-6 w-6 text-slate-300" />
                    </div>
                    <p className="text-slate-400 text-sm">知识库为空，请点击上方“上传文件”开始构建。</p>
                </div>
            )}
          </div>
        </Card>
      </div>

      <FilePreviewDialog 
        isOpen={isPreviewOpen} 
        onClose={() => setIsPreviewOpen(false)} 
        file={previewFile}
      />

      {/* New Knowledge Base Dialog */}
      <Dialog open={showNewKbDialog} onOpenChange={setShowNewKbDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建知识库</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input 
              placeholder="输入知识库名称" 
              value={newKbName} 
              onChange={(e) => setNewKbName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateKb()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewKbDialog(false)}>取消</Button>
            <Button onClick={handleCreateKb} disabled={!newKbName.trim()}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tags Edit Dialog */}
      <Dialog open={!!editingTagsFile} onOpenChange={(open) => !open && setEditingTagsFile(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>编辑文档标签</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <p className="text-xs text-slate-500">为 <span className="font-mono text-slate-700">{editingTagsFile}</span> 设置标签，多个标签请用英文逗号分隔。</p>
            <Input 
              placeholder="例如: 财务, 2024, 重要" 
              value={newTagsString} 
              onChange={(e) => setNewTagsString(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveTags()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTagsFile(null)}>取消</Button>
            <Button onClick={handleSaveTags} disabled={isSavingTags}>
              {isSavingTags ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
