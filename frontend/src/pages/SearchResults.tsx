import { useState, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { DashboardLayout } from "@/components/layout/DashboardLayout"
import { Card } from "@/components/ui/card"
import { FilePreviewDialog } from "@/components/FilePreviewDialog"
import { api } from "@/lib/api"
import { FileText, Loader2, Search as SearchIcon } from "lucide-react"

export default function SearchResults() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get("q") || ""
  
  const [results, setResults] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  
  // Preview State
  const [selectedFile, setSelectedFile] = useState<{name: string, type: string} | null>(null)

  useEffect(() => {
    if (query) {
      performSearch(query)
    }
  }, [query])

  const performSearch = async (q: string) => {
    setIsLoading(true)
    try {
      const res = await api.globalSearch(q)
      setResults(res.results || [])
    } catch (e) {
      console.error("Search failed", e)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <DashboardLayout>
       <div className="flex flex-col h-full bg-slate-50/50">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    <SearchIcon className="h-6 w-6 text-cyan-600" />
                    搜索结果
                </h1>
                <p className="text-slate-500 mt-1">
                    关键词 "{query}" 共找到 {results.length} 个相关片段
                </p>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                </div>
            ) : results.length === 0 ? (
                <div className="text-center py-20 text-slate-400">
                    未找到相关内容
                </div>
            ) : (
                <div className="grid gap-4 pb-20">
                    {results.map((item, idx) => (
                        <Card 
                            key={idx} 
                            className="p-5 border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer group bg-white"
                            onClick={() => setSelectedFile({ name: item.filename, type: item.type })}
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2 mb-2">
                                    <FileText className="h-4 w-4 text-slate-400" />
                                    <span className="font-semibold text-slate-700">{item.filename}</span>
                                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">P{item.page}</span>
                                </div>
                                <span className="text-xs font-mono text-slate-300">Score: {item.score.toFixed(2)}</span>
                            </div>
                            
                            <p className="text-sm text-slate-600 leading-relaxed font-serif bg-slate-50/50 p-3 rounded-lg border border-slate-100/50 group-hover:bg-cyan-50/30 group-hover:border-cyan-100 transition-colors">
                                ...{item.content}...
                            </p>
                        </Card>
                    ))}
                </div>
            )}
            
            <FilePreviewDialog 
                isOpen={!!selectedFile}
                onClose={() => setSelectedFile(null)}
                file={selectedFile}
            />
       </div>
    </DashboardLayout>
  )
}
