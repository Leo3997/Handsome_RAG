import { useState, useEffect } from "react"
import { DashboardLayout } from "@/components/layout/DashboardLayout"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CardGridSkeleton } from "@/components/ui/skeleton"
import { useDocuments } from "@/hooks/useApi"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { 
  FileText, 
  FileSpreadsheet, 
  Presentation, 
  Image as ImageIcon,
  Eye,
  Download,
  ChevronLeft,
  ChevronRight,
  Trash2
} from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/context/AuthContext"

import { api } from "@/lib/api"

// Mock Thumbnail generator helper (in real backend this would be a URL)
const getThumbnailBg = (type: string) => {
  switch(type) {
    case 'pptx': return "bg-orange-50 border-orange-100 text-orange-500"
    case 'pdf': return "bg-red-50 border-red-100 text-red-500"
    case 'xlsx': return "bg-green-50 border-green-100 text-green-500"
    case 'docx': return "bg-blue-50 border-blue-100 text-blue-500"
    default: return "bg-slate-50 border-slate-100 text-slate-500"
  }
}

const getIcon = (type: string) => {
  switch(type) {
    case 'pptx': return <Presentation className="h-12 w-12" />
    case 'pdf': return <FileText className="h-12 w-12" />
    case 'xlsx': return <FileSpreadsheet className="h-12 w-12" />
    case 'docx': return <FileText className="h-12 w-12" /> // Use Word icon if available
    default: return <ImageIcon className="h-12 w-12" />
  }
}

export default function Assets() {
  const { isAdmin } = useAuth()
  
  // 使用 SWR hook 进行数据缓存
  const { documents: files, isLoading, refresh: refreshFiles } = useDocuments()
  const [filteredFiles, setFilteredFiles] = useState<any[]>([])
  const [selectedFile, setSelectedFile] = useState<any>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  useEffect(() => {
    setFilteredFiles(files)
  }, [files])

  const handleSearch = (query: string) => {
    if (!query) {
      setFilteredFiles(files)
    } else {
      setFilteredFiles(files.filter(f => f.name.toLowerCase().includes(query.toLowerCase())))
    }
  }

  const [textContent, setTextContent] = useState<string>("")
  const [isLoadingText, setIsLoadingText] = useState(false)
  
  // Restore missing states
  const [selectedPPT, setSelectedPPT] = useState<{name: string, slides: string[]} | null>(null)
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
  const [isLoadingSlides, setIsLoadingSlides] = useState(false)

  const handlePreview = async (file: any) => {
    setSelectedFile(file)
    // PPT Logic
    if (file.type === 'pptx' || file.type === 'ppt') {
         setIsLoadingSlides(true)
         try {
             const res = await api.getPPTSlides(file.name)
             if (res.slides) {
                 setSelectedPPT({ name: file.name, slides: res.slides })
                 setCurrentSlideIndex(0)
             }
         } catch (e) { console.error(e) } finally { setIsLoadingSlides(false) }
    } else { setSelectedPPT(null) }

    // Text Preview Logic (Word/Excel)
    if (['docx', 'doc', 'xlsx', 'xls', 'csv', 'txt'].includes(file.type)) {
        setIsLoadingText(true)
        try {
            const res = await api.getFileContent(file.name)
            setTextContent(res.content || "暂无内容")
        } catch (e) {
            setTextContent("加载失败")
        } finally {
            setIsLoadingText(false)
        }
    } else {
        setTextContent("")
    }
  }

  const nextSlide = () => {
    if (!selectedPPT) return
    setCurrentSlideIndex(prev => prev < selectedPPT.slides.length - 1 ? prev + 1 : prev)
  }

  const prevSlide = () => {
    if (!selectedPPT) return
    setCurrentSlideIndex(prev => prev > 0 ? prev - 1 : prev)
  }

  // RENDER LOGIC INSIDE MODAL
  const renderPreviewContent = () => {
      // ... (keep existing render logic)
      const type = selectedFile?.type || ''
      
      // 1. PPT
      if (['ppt', 'pptx'].includes(type) && selectedPPT) {
          if (isLoadingSlides) {
              return <div className="text-white/50">正在加载幻灯片...</div>
          }
          
          if (!selectedPPT.slides || selectedPPT.slides.length === 0) {
              return (
                  <div className="text-center text-white/70">
                      <Presentation className="h-20 w-20 mx-auto mb-4 opacity-50" />
                      <p>未发现幻灯片图像。该文件可能正在处理中或处理失败。</p>
                      <a href={`/api/files/${selectedFile?.name}`} download target="_blank" className="mt-4 inline-block">
                          <Button variant="secondary">下载原文件</Button>
                      </a>
                  </div>
              )
          }

          const currentSlide = selectedPPT.slides[currentSlideIndex]
          if (!currentSlide) return <div className="text-white/50">幻灯片加载错误</div>

          return (
             <>
                <img 
                src={`/api/slides/${currentSlide.split('/').pop()}`} 
                className="max-h-full max-w-full object-contain shadow-2xl"
                />
                <Button variant="ghost" className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white hover:bg-white/10 h-12 w-12 rounded-full p-0" 
                        onClick={prevSlide} disabled={currentSlideIndex === 0}><ChevronLeft className="h-8 w-8" /></Button>
                <Button variant="ghost" className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white hover:bg-white/10 h-12 w-12 rounded-full p-0" 
                        onClick={nextSlide} disabled={currentSlideIndex === (selectedPPT.slides.length || 0) - 1}><ChevronRight className="h-8 w-8" /></Button>
             </>
          )
      }
      
      // 2. Image
      if (['png', 'jpg', 'jpeg', 'svg'].includes(type)) {
          // Fix: Use absolute URL
          return <img src={`/api/files/${selectedFile.name}`} className="max-h-full max-w-full object-contain" />
      }

      // 3. PDF (Iframe)
      if (type === 'pdf') {
          return <iframe src={`/api/files/${selectedFile.name}`} className="w-full h-full bg-white rounded" />
      }

      // 4. Text/Office (Text Preview)
      if (['docx', 'doc', 'xlsx', 'xls', 'csv', 'txt'].includes(type)) {
          return (
              <div className="w-full h-full max-w-4xl bg-white rounded-lg p-8 overflow-y-auto text-slate-800">
                  <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                      <h2 className="text-lg font-bold">文档内容预览</h2>
                      <a href={`/api/files/${selectedFile.name}`} download target="_blank">
                          <Button size="sm" className="gap-2"><Download className="h-4 w-4"/> 下载原文件</Button>
                      </a>
                  </div>
                  {isLoadingText ? (
                      <div className="flex items-center gap-2 text-slate-400">Loading...</div>
                  ) : (
                      <div className="whitespace-pre-wrap leading-relaxed font-serif text-base">
                          {textContent}
                      </div>
                  )}
              </div>
          )
      }

      // Fallback
      return (
          <div className="text-center text-white/70">
               <FileText className="h-20 w-20 mx-auto mb-4 opacity-50" />
               <p>该格式暂不支持在线预览。</p>
               <a href={`/api/files/${selectedFile?.name}`} download target="_blank" className="mt-4 inline-block">
                   <Button variant="secondary">下载文件</Button>
               </a>
          </div>
      )
  }

  return (
    <DashboardLayout onSearch={handleSearch}>
      <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">资源预览</h1>
              <p className="text-slate-500 text-sm">可视化浏览知识库中的所有素材</p>
            </div>

        {/* Gallery Grid */}
        {isLoading ? (
          <CardGridSkeleton count={10} />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {filteredFiles.map((file) => (
            <div key={file.id} className="group relative">
               <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 border-slate-200 cursor-pointer" onClick={() => handlePreview(file)}>
                  
                  {/* Thumbnail Area */}
                  <div className={`aspect-[4/3] flex items-center justify-center ${getThumbnailBg(file.type)}`}>
                      {/* If it's an image, show thumbnail preview, else show Icon */}
                      {['png', 'jpg', 'jpeg', 'svg'].includes(file.type) ? (
                          <img src={`/api/thumbnails/${file.name}`} alt={file.name} className="w-full h-full object-cover" 
                               onError={(e) => { e.currentTarget.style.display='none' }}/> 
                      ) : (
                          <div className="transform group-hover:scale-110 transition-transform duration-300 opacity-80 group-hover:opacity-100">
                             {getIcon(file.type)}
                          </div>
                      )}
                  </div>

                  {/* Info Area */}
                  <CardContent className="p-3">
                     <div className="flex items-start justify-between gap-2">
                        <h3 className="font-medium text-sm text-slate-800 line-clamp-2 leading-snug" title={file.name}>
                          {file.name}
                        </h3>
                     </div>
                     <div className="mt-2 flex items-center justify-between">
                       <Badge variant="secondary" className="text-[10px] px-1.5 h-5 font-normal uppercase">
                          {file.type}
                       </Badge>
                       <span className="text-[10px] text-slate-400">{file.size}</span>
                     </div>
                  </CardContent>

                  {/* Hover Actions */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                      <Button variant="secondary" size="icon" className="rounded-full shadow-lg h-10 w-10" onClick={(e) => { e.stopPropagation(); handlePreview(file); }}>
                        <Eye className="h-5 w-5" />
                      </Button>
                      {isAdmin && (
                        <>
                          <Button variant="secondary" size="icon" className="rounded-full shadow-lg h-10 w-10" title="下载">
                            <Download className="h-5 w-5" />
                          </Button>
                          <Button variant="destructive" size="icon" className="rounded-full shadow-lg h-10 w-10 hover:bg-red-600" title="删除"
                                  onClick={(e) => { 
                                      e.stopPropagation(); 
                                      setDeleteTarget(file.name);
                                  }}>
                            <Trash2 className="h-5 w-5" />
                          </Button>
                        </>
                      )}
                  </div>
               </Card>
            </div>
          ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要从知识库中删除 "{deleteTarget}" 吗？删除后不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (deleteTarget) {
                  api.deleteFile(deleteTarget).then(() => {
                    refreshFiles();  // 刷新 SWR 缓存
                    toast.success(`文件 "${deleteTarget}" 已删除`);
                    setDeleteTarget(null);
                  }).catch(() => {
                    toast.error("删除失败");
                  });
                }
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* PPT Fullscreen Preview Modal */}
      <Dialog open={!!selectedFile} onOpenChange={(open) => !open && setSelectedFile(null)}>
        <DialogContent className="max-w-6xl w-full h-[90vh] p-0 overflow-hidden bg-black/95 border-slate-800 flex flex-col" aria-describedby="dialog-description">
            <DialogHeader className="flex-shrink-0 p-4 bg-white/5 border-b border-white/10 flex flex-row items-center justify-between">
                <div>
                   <DialogTitle className="text-white text-base font-medium">{selectedFile?.name}</DialogTitle>
                </div>
                {['ppt', 'pptx'].includes(selectedFile?.type || '') && (
                    <div className="text-white/60 text-sm font-mono">
                         {currentSlideIndex + 1} / {selectedPPT?.slides.length || '-'}
                    </div>
                )}
            </DialogHeader>
            
            {/* Fix for Radix UI Warning: Use visually hidden Description with ID */}
            <div id="dialog-description" className="sr-only">
               Preview of file: {selectedFile?.name}. Use arrow keys or buttons to navigate slides if applicable.
            </div>

            <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden group">
                 {/* Content Renderer */}
                 {renderPreviewContent()}
            </div>
            
            {/* Bottom Strip for PPT */}
            {['ppt', 'pptx'].includes(selectedFile?.type || '') && selectedPPT && (
                 <div className="h-20 bg-black/40 border-t border-white/10 flex items-center gap-2 px-4 overflow-x-auto">
                     {selectedPPT.slides.map((slide: any, idx: number) => (
                         <div key={idx} 
                              onClick={() => setCurrentSlideIndex(idx)}
                              className={`h-14 aspect-[4/3] rounded overflow-hidden cursor-pointer border-2 transition-all ${idx === currentSlideIndex ? 'border-cyan-500 opacity-100' : 'border-transparent opacity-50 hover:opacity-100'}`}>
                             {/* Fix: Use absolute URL */}
                             <img src={`/api/slides/${slide.split('/').pop()}`} className="w-full h-full object-cover" />
                         </div>
                     ))}
                 </div>
            )}
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  )
}
