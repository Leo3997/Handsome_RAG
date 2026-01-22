import { useState, useEffect } from "react"
import { DashboardLayout } from "@/components/layout/DashboardLayout"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { 
  Send, 
  Paperclip, 
  Sparkles, 
  Trash2,
  Presentation as PptIcon,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Database,
  ChevronDown,
  Globe
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Dialog, DialogContent } from "@/components/ui/dialog"

import { api } from "@/lib/api"

import { useChatContext, type Message } from "@/context/ChatContext"
import { MarkdownRenderer } from "@/components/MarkdownRenderer"
import { FilePreviewDialog } from "@/components/FilePreviewDialog"
import { ThinkingAnimation } from "@/components/ThinkingAnimation"

export default function ChatView() {
  const { 
    messages, 
    isLoading, 
    addMessage, 
    updateMessage,
    setLoading,
    updateStats,
    sessions, 
    currentSessionId, 
    currentSession,
    createNewSession, 
    switchSession, 
    deleteSession 
  } = useChatContext()
  
  const [input, setInput] = useState("")
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null)
  
  // PPT Preview State
  const [selectedPPT, setSelectedPPT] = useState<{name: string, slides: string[]} | null>(null)
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
  const [isLoadingSlides, setIsLoadingSlides] = useState(false)

  // Generic File Preview
  const [selectedPreviewFile, setSelectedPreviewFile] = useState<any>(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

  // Thinking animation states
  const [isSearching, setIsSearching] = useState(false)
  const [hasContent, setHasContent] = useState(false)

  // Knowledge Base State
  const [knowledgeBases, setKnowledgeBases] = useState<any[]>([])
  const [selectedKbId, setSelectedKbId] = useState("default")
  const [showKbMenu, setShowKbMenu] = useState(false)
  const [isGlobalSearch, setIsGlobalSearch] = useState(false)

  // Prompt Templates State
  const [showTemplates, setShowTemplates] = useState(false)
  const PROMPT_TEMPLATES = [
    { label: "📄 文档总结", value: "请简要总结一下这篇文档的核心内容，并列出 3-5 个关键点。" },
    { label: "🔍 核心观点", value: "请分析文档，提取出其中最具有代表性的核心观点。" },
    { label: "⚖️ 对比分析", value: "请对比这几份文档的异同点，并给出一份分析报告。" },
    { label: "📝 专业润色", value: "请按照专业、学术的风格，对以下内容进行润色和优化建议：" },
  ]

  useEffect(() => {
    fetchKnowledgeBases()
  }, [])

  const fetchKnowledgeBases = async () => {
    try {
      const kbs = await api.getKnowledgeBases()
      setKnowledgeBases(kbs)
    } catch (error) {
      console.error("Failed to fetch knowledge bases:", error)
    }
  }

  const handleSend = async () => {
    // ... (existing code, unchanged but included for context)
    if (!input.trim() || isLoading) return
    
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input }
    addMessage(userMsg)
    setInput("")
    setLoading(true)
    setIsSearching(true)
    setHasContent(false)
    
    const aiMsgId = (Date.now() + 1).toString()
    let aiMsgCreated = false;
    let cumulativeContent = "";

    try {
        await api.queryStream(
            input,
            (chunk) => {
                cumulativeContent += chunk;
                setHasContent(true);
                if (!aiMsgCreated) {
                    addMessage({ id: aiMsgId, role: 'assistant', content: cumulativeContent })
                    aiMsgCreated = true
                } else {
                    updateMessage(aiMsgId, { content: cumulativeContent })
                }
            },
            (sources) => {
                setIsSearching(false);
                if (!aiMsgCreated) {
                    addMessage({ id: aiMsgId, role: 'assistant', content: "", sources })
                    aiMsgCreated = true
                } else {
                    updateMessage(aiMsgId, { sources })
                }
            },
            (stats) => {
                // Update session stats
                updateStats({
                    tokenUsage: stats.tokens,
                    retrievalTime: stats.time,
                    docCount: stats.doc_count
                })
            },
            selectedKbId,
            // Prepare history: take last 10 messages, keep only role and content
            messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
            isGlobalSearch
        );
    } catch (error) {
        console.error("Chat Error:", error)
        addMessage({
            id: (Date.now() + 2).toString(),
            role: 'assistant',
            content: "抱歉，连接后端服务时出了点问题，请稍后再试。"
        })
    } finally {
        setLoading(false)
    }
  }

  const handleSourceClick = async (source: any) => {
    if (source.type === 'pptx' || source.type === 'ppt') {
        setIsLoadingSlides(true)
        try {
            const res = await api.getPPTSlides(source.name)
            if (res.slides && res.slides.length > 0) {
                setSelectedPPT({
                    name: source.name,
                    slides: res.slides
                })
                setCurrentSlideIndex(source.page ? source.page - 1 : 0)
            }
        } catch (e) {
            console.error("Failed to load slides", e)
        } finally {
            setIsLoadingSlides(false)
        }
    } else {
        // Handle generic preview (PDF, Word, etc. as text)
        setSelectedPreviewFile({
            filename: source.name,
            type: source.type,
            page: source.page,
            highlightContent: source.content
        })
        setIsPreviewOpen(true)
    }
  }

  const handleReferenceClick = (msg: Message, index: number) => {
    if (!msg.sources) return;
    // index is 1-based from [1], [2]
    const source = msg.sources[index - 1];
    if (source) {
        handleSourceClick(source);
    }
  };

  const nextSlide = () => {
    if (!selectedPPT) return
    setCurrentSlideIndex(prev => 
        prev < selectedPPT.slides.length - 1 ? prev + 1 : prev
    )
  }

  const prevSlide = () => {
    if (!selectedPPT) return
    setCurrentSlideIndex(prev => 
        prev > 0 ? prev - 1 : prev
    )
  }

  return (
    <DashboardLayout>
      <div className="flex h-full gap-6">
        {/* Chat Section */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-6 pb-6">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`group relative max-w-[85%] rounded-2xl px-5 py-4 shadow-sm border ${
                    msg.role === 'user' 
                      ? 'bg-slate-900 text-white border-slate-800 rounded-tr-none' 
                      : 'bg-white text-slate-700 border-slate-200 rounded-tl-none'
                  }`}>
                    {msg.role === 'user' ? (
                      <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <MarkdownRenderer 
                        content={msg.content} 
                        sources={msg.sources || []}
                        onReferenceClick={(idx) => handleReferenceClick(msg, idx)} 
                      />
                    )}
                    
                    {msg.sources && (
                        <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-3">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-tighter">参考来源</span>
                            <div className="flex flex-wrap gap-2">
                                {(expandedMessageId === msg.id ? msg.sources : msg.sources.slice(0, 4)).map((s, idx) => {
                                    const isPPT = s.type === 'pptx' || s.type === 'ppt'
                                    const hasImage = !!s.image_url
                                    return (
                                        <div 
                                            key={idx} 
                                            onClick={() => handleSourceClick(s)}
                                            className="group flex items-center gap-2 bg-white border border-slate-100 p-1 pr-3 rounded-lg transition-all cursor-pointer hover:border-cyan-200 hover:bg-cyan-50/10 active:scale-95 shadow-sm"
                                        >
                                            <div className="h-8 w-8 rounded bg-slate-100 overflow-hidden flex items-center justify-center shrink-0 border border-slate-50">
                                                {hasImage ? (
                                                    <img src={s.image_url} alt="" className="h-full w-full object-cover group-hover:scale-110 transition-transform" />
                                                ) : isPPT ? (
                                                    isLoadingSlides ? <Loader2 className="h-4 w-4 text-orange-400 animate-spin" /> : <PptIcon className="h-4 w-4 text-orange-500" />
                                                ) : (
                                                    <Paperclip className="h-3.5 w-3.5 text-slate-400 font-bold" />
                                                )}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-[10px] font-bold text-slate-800 truncate max-w-[120px]">
                                                    {s.name}
                                                </span>
                                                <span className="text-[9px] text-cyan-600 font-mono font-bold uppercase tracking-tight">定位: P{s.page}</span>
                                            </div>
                                        </div>
                                    )
                                })}
                                {msg.sources.length > 4 && expandedMessageId !== msg.id && (
                                     <button 
                                        onClick={() => setExpandedMessageId(msg.id)}
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-100 bg-white hover:bg-slate-50 text-slate-500 transition-all hover:text-cyan-600 text-xs font-medium active:scale-95"
                                     >
                                         +{msg.sources.length - 4} 更多
                                     </button>
                                )}
                                {expandedMessageId === msg.id && msg.sources.length > 4 && (
                                    <button 
                                        onClick={() => setExpandedMessageId(null)}
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-100 bg-white hover:bg-slate-50 text-slate-400 hover:text-slate-600 text-xs font-medium transition-all active:scale-95"
                                     >
                                         收起
                                     </button>
                                )}
                            </div>
                        </div>
                    )}
                  </div>
                </div>
              ))}
              
              {isLoading && !hasContent && (
                <ThinkingAnimation isSearching={isSearching} isGenerating={!hasContent} />
              )}
            </div>
          </ScrollArea>

          <div className="mt-auto pt-4 flex flex-col gap-2">
            {/* Knowledge Base Selector Above Input */}
            <div className="flex px-1">
                <div className="relative">
                    <button 
                        onClick={() => setShowKbMenu(!showKbMenu)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-100 bg-slate-50/50 hover:bg-slate-100/50 text-slate-500 hover:text-slate-700 text-[11px] font-medium transition-all active:scale-95"
                    >
                        <Database className="h-3 w-3 text-cyan-500" />
                        <span>知识库: {knowledgeBases.find(k => k.id === selectedKbId)?.name || "默认知识库"}</span>
                        <ChevronDown className={`h-3 w-3 transition-transform ${showKbMenu ? 'rotate-180' : ''}`} />
                    </button>
                    
                    <button 
                        onClick={() => setIsGlobalSearch(!isGlobalSearch)}
                        className={`ml-2 flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all active:scale-95 text-[11px] font-bold ${
                            isGlobalSearch 
                            ? 'border-indigo-200 bg-indigo-50 text-indigo-600' 
                            : 'border-slate-100 bg-slate-50/50 text-slate-400 hover:text-indigo-400 hover:border-indigo-100'
                        }`}
                        title={isGlobalSearch ? "正在检索所有知识库" : "点击开启全库搜索"}
                    >
                        <Globe className={`h-3 w-3 ${isGlobalSearch ? 'animate-pulse' : ''}`} />
                        <span>全库检索: {isGlobalSearch ? '开启' : '关闭'}</span>
                    </button>

                    {showTemplates && (
                        <div className="absolute bottom-full left-0 ml-32 mb-2 z-30 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 min-w-48 animate-in slide-in-from-bottom-2 duration-200">
                             <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-bottom border-slate-50">常用模板</div>
                             {PROMPT_TEMPLATES.map((tmpl, idx) => (
                                 <button
                                     key={idx}
                                     onClick={() => { setInput(tmpl.value); setShowTemplates(false); }}
                                     className="w-full px-4 py-2.5 text-left text-xs hover:bg-cyan-50 text-slate-600 hover:text-cyan-700 transition-colors"
                                 >
                                     {tmpl.label}
                                 </button>
                             ))}
                        </div>
                    )}

                    {showKbMenu && (
                        <div className="absolute bottom-full left-0 mb-2 z-30 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 min-w-48 animate-in slide-in-from-bottom-2 duration-200">
                            <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-bottom border-slate-50">选择知识库</div>
                            {knowledgeBases.map(kb => (
                                <button
                                    key={kb.id}
                                    onClick={() => { setSelectedKbId(kb.id); setShowKbMenu(false); }}
                                    className={`w-full px-4 py-2.5 text-left text-xs hover:bg-slate-50 flex justify-between items-center transition-colors ${selectedKbId === kb.id ? 'text-cyan-600 font-bold bg-cyan-50/50' : 'text-slate-600'}`}
                                >
                                    <span>{kb.name}</span>
                                    {selectedKbId === kb.id && <div className="h-1.5 w-1.5 rounded-full bg-cyan-500" />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <Card className="border-slate-200 p-2 shadow-sm bg-white focus-within:ring-2 focus-within:ring-slate-100 transition-all">
              <div className="flex items-end gap-2 px-2">
                <Button variant="ghost" size="icon" className="h-10 w-10 text-slate-400 hover:text-slate-600">
                  <Paperclip className="h-5 w-5" />
                </Button>
                <textarea 
                  rows={1}
                  value={input}
                  disabled={isLoading}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder={isLoading ? "正在思考中..." : "询问任何关于您的企业资料的问题..."} 
                  className="flex-1 bg-transparent border-none focus:outline-none py-3 text-[15px] resize-none disabled:opacity-50"
                />
                <div className="flex items-center gap-1">
                    <Button 
                        size="icon" 
                        onClick={handleSend}
                        disabled={isLoading || !input.trim()}
                        className="h-10 w-10 bg-slate-900 hover:bg-slate-800 text-white shrink-0 rounded-xl disabled:opacity-50"
                    >
                        <Send className={`h-4 w-4 ${isLoading ? 'animate-pulse' : ''}`} />
                    </Button>
                </div>
              </div>
            </Card>
            <div className="mt-2 text-center">
                <p className="text-[10px] text-slate-400 font-medium tracking-wide">由 Qwen Plus 驱动的 RAG 知识辅助系统</p>
            </div>
          </div>
        </div>

        {/* Side Panel: Preview / Context (Optional) */}
        {/* Side Panel */}
        <div className="hidden xl:flex w-80 flex-col gap-4 border-l border-slate-100 pl-6">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest">会话统计</h3>
                <Sparkles className="h-4 w-4 text-cyan-500" />
            </div>
            <Card className="p-4 border-slate-100 bg-slate-50/50 shadow-none">
                <div className="space-y-4">
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">消耗 Token</span>
                        <span className="font-mono font-bold">{currentSession?.stats?.tokenUsage || 0}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">检索耗时</span>
                        <span className="font-mono font-bold text-cyan-600">{currentSession?.stats?.retrievalTime || 0}s</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">引用文档</span>
                        <span className="font-mono font-bold">{currentSession?.stats?.docCount || 0}</span>
                    </div>
                </div>
            </Card>
            
            <div className="mt-4 flex flex-col gap-3 flex-1 min-h-0">
                <div className="flex items-center justify-between">
                     <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest">近期会话</h3>
                     <Button variant="ghost" size="sm" onClick={createNewSession} className="h-6 text-xs text-cyan-600 hover:bg-cyan-50">
                        + 新建
                     </Button>
                </div>
                <div className="space-y-2 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200">
                    {sessions.map((s) => (
                        <div 
                            key={s.id} 
                            onClick={() => switchSession(s.id)}
                            className={`group flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                                currentSessionId === s.id 
                                ? 'bg-white shadow-sm border-slate-200' 
                                : 'border-transparent hover:bg-white hover:shadow-sm hover:border-slate-100'
                            }`}
                        >
                            <span className={`text-sm line-clamp-1 ${currentSessionId === s.id ? 'text-slate-900 font-medium' : 'text-slate-600'}`}>
                                {s.title}
                            </span>
                            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-6 w-6 text-slate-300 hover:text-red-500 hover:bg-red-50"
                                    onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      </div>

      {/* PPT Fullscreen Preview Modal */}
      <Dialog open={!!selectedPPT} onOpenChange={(open) => !open && setSelectedPPT(null)}>
        <DialogContent className="max-w-4xl w-full p-0 overflow-hidden bg-black/90 border-slate-800">
            {selectedPPT && (
                <div className="relative flex flex-col items-center justify-center min-h-[60vh] max-h-[85vh]">
                    {/* Header */}
                    <div className="absolute top-0 left-0 right-0 z-20 flex justify-between items-center p-4 bg-gradient-to-b from-black/60 to-transparent">
                        <h3 className="text-white font-medium text-sm truncate px-2">{selectedPPT.name}</h3>
                        <div className="text-white/70 text-xs font-mono bg-black/40 px-2 py-1 rounded">
                            {currentSlideIndex + 1} / {selectedPPT.slides.length}
                        </div>
                    </div>

                    {/* Main Image */}
                    <div className="relative w-full h-full flex items-center justify-center p-4">
                        {selectedPPT.slides.length > 0 && selectedPPT.slides[currentSlideIndex] ? (
                           <img 
                             src={selectedPPT.slides[currentSlideIndex].startsWith('http') 
                                 ? selectedPPT.slides[currentSlideIndex].replace(/https?:\/\/[^\/]+/, '') 
                                 : `/api/slides/${selectedPPT.slides[currentSlideIndex].split('/').pop()}`} 
                             alt={`Slide ${currentSlideIndex + 1}`}
                             className="max-h-[75vh] w-auto object-contain rounded-sm shadow-2xl"
                          />
                        ) : (
                           <div className="text-white/50">无可用幻灯片</div>
                        )}
                    </div>

                    {/* Controls */}
                    <button 
                        onClick={prevSlide}
                        disabled={currentSlideIndex === 0 || selectedPPT.slides.length === 0}
                        className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                        <ChevronLeft className="h-8 w-8" />
                    </button>

                    <button 
                        onClick={nextSlide}
                        disabled={currentSlideIndex === selectedPPT.slides.length - 1 || selectedPPT.slides.length === 0}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                        <ChevronRight className="h-8 w-8" />
                    </button>

                     {/* Thumbnails (Optional strip at bottom) */}
                     <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 overflow-x-auto px-4 pb-2 scrollbar-hide">
                        {selectedPPT.slides.map((_, idx) => (
                            <div 
                                key={idx}
                                onClick={() => setCurrentSlideIndex(idx)}
                                className={`h-1.5 w-1.5 rounded-full cursor-pointer transition-all ${
                                    idx === currentSlideIndex ? 'bg-cyan-500 w-4' : 'bg-white/30 hover:bg-white/50'
                                }`}
                            />
                        ))}
                     </div>
                </div>
            )}
        </DialogContent>
      </Dialog>
      <FilePreviewDialog 
        isOpen={isPreviewOpen} 
        onClose={() => setIsPreviewOpen(false)} 
        file={selectedPreviewFile ? { name: selectedPreviewFile.filename, type: selectedPreviewFile.type } : null}
      />
    </DashboardLayout>
  )
}
