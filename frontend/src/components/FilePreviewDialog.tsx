import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react"
import { api } from "@/lib/api"

interface FilePreviewDialogProps {
    file: { name: string; type?: string } | null
    isOpen: boolean
    onClose: () => void
}

export function FilePreviewDialog({ file, isOpen, onClose }: FilePreviewDialogProps) {
    const [pptSlides, setPptSlides] = useState<string[]>([])
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
    const [isLoading, setIsLoading] = useState(false)
    const [textContent, setTextContent] = useState<string>("")
    const [previewType, setPreviewType] = useState<'ppt' | 'image' | 'pdf' | 'text' | 'unknown'>('unknown')

    useEffect(() => {
        if (isOpen && file) {
            loadPreview(file)
        } else {
            // Reset state on close
            setPptSlides([])
            setCurrentSlideIndex(0)
            setTextContent("")
        }
    }, [isOpen, file])

    const loadPreview = async (f: { name: string; type?: string }) => {
        setIsLoading(true)
        const ext = f.name.split('.').pop()?.toLowerCase() || ""
        
        if (['ppt', 'pptx'].includes(ext)) {
            setPreviewType('ppt')
            try {
                const res = await api.getPPTSlides(f.name)
                setPptSlides(res.slides || [])
            } catch (e) {
                console.error(e)
            }
        } else if (['jpg', 'png', 'jpeg', 'svg'].includes(ext)) {
            setPreviewType('image')
        } else if (['pdf'].includes(ext)) {
            setPreviewType('pdf')
        } else {
            setPreviewType('text')
            // Fetch text content
            try {
                const res = await api.getFileContent(f.name)
                // If it's HTML or huge text, might need handling. For now assume raw string.
                // The API returns { content: "..." }
                setTextContent(res.content || "无法预览此文件内容")
            } catch (e) {
                setTextContent("读取文件失败")
            }
        }
        setIsLoading(false)
    }

    const nextSlide = () => {
        if (currentSlideIndex < pptSlides.length - 1) setCurrentSlideIndex(p => p + 1)
    }
    const prevSlide = () => {
        if (currentSlideIndex > 0) setCurrentSlideIndex(p => p - 1)
    }

    if (!file) return null

    return (
        <Dialog open={isOpen} onOpenChange={(val) => !val && onClose()}>
            <DialogContent className="max-w-5xl w-[90vw] h-[85vh] p-0 overflow-hidden bg-slate-900 border-slate-800 flex flex-col">
                <div className="sr-only">
                    <DialogTitle>文件预览: {file.name}</DialogTitle>
                    <DialogDescription>正在预览文件 {file.name}</DialogDescription>
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800 text-white shrink-0">
                    <span className="font-medium truncate">{file.name}</span>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden relative flex items-center justify-center bg-slate-900">
                    {isLoading ? (
                        <div className="flex flex-col items-center gap-2 text-slate-400">
                            <Loader2 className="h-8 w-8 animate-spin" />
                            <span>Loading preview...</span>
                        </div>
                    ) : (
                        <>
                            {previewType === 'ppt' && pptSlides.length > 0 && (
                                <div className="relative w-full h-full flex items-center justify-center">
                                    <img 
                                        src={`http://localhost:5000${pptSlides[currentSlideIndex]}`}
                                        className="max-w-full max-h-full object-contain"
                                    />
                                    {/* Controls */}
                                    <button onClick={prevSlide} disabled={currentSlideIndex===0} 
                                        className="absolute left-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 disabled:opacity-30">
                                        <ChevronLeft />
                                    </button>
                                    <button onClick={nextSlide} disabled={currentSlideIndex===pptSlides.length-1}
                                        className="absolute right-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 disabled:opacity-30">
                                        <ChevronRight />
                                    </button>
                                    <div className="absolute bottom-4 bg-black/50 px-3 py-1 rounded text-white text-sm">
                                        {currentSlideIndex + 1} / {pptSlides.length}
                                    </div>
                                </div>
                            )}

                            {previewType === 'image' && (
                                <img 
                                    src={`http://localhost:5000/api/files/${encodeURIComponent(file.name)}`}
                                    className="max-w-full max-h-full object-contain"
                                />
                            )}

                            {previewType === 'pdf' && (
                                <iframe 
                                    src={`http://localhost:5000/api/files/${encodeURIComponent(file.name)}`}
                                    className="w-full h-full border-none bg-white"
                                />
                            )}

                            {previewType === 'text' && (
                                <div className="w-full h-full bg-white text-slate-900 p-8 overflow-auto font-mono text-sm whitespace-pre-wrap">
                                    {textContent}
                                </div>
                            )}
                            
                            {previewType === 'ppt' && pptSlides.length === 0 && (
                                <div className="text-slate-400">No slides found or processing failed.</div>
                            )}
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
