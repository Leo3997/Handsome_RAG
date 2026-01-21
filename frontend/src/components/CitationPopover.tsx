import React, { useState } from 'react'
import * as HoverCard from '@radix-ui/react-hover-card'
import { FileText, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'

interface CitationPopoverProps {
  index: number
  sources: any[]
  children: React.ReactNode
  onClick?: () => void
}

export function CitationPopover({ index, sources, children, onClick }: CitationPopoverProps) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Find the source by index (1-based in display)
  const source = sources?.[index - 1]

  const loadPreview = async () => {
    if (!source || content) return
    
    setLoading(true)
    setError(null)
    
    try {
      const res = await api.getFileContent(source.name)
      // Truncate to ~300 chars for preview
      const truncated = res.content?.slice(0, 300) + (res.content?.length > 300 ? '...' : '')
      setContent(truncated || '暂无预览内容')
    } catch (e: any) {
      setError('加载预览失败')
      console.error('Preview error:', e)
    } finally {
      setLoading(false)
    }
  }

  if (!source) {
    // If no source found, just render the button without hover
    return <span onClick={onClick}>{children}</span>
  }

  return (
    <HoverCard.Root openDelay={300} closeDelay={100}>
      <HoverCard.Trigger asChild>
        <span 
          onClick={onClick} 
          onMouseEnter={loadPreview}
          className="cursor-pointer"
        >
          {children}
        </span>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content 
          className="z-50 w-80 rounded-lg border border-slate-200 bg-white p-4 shadow-lg animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
          sideOffset={5}
        >
          {/* Header */}
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
            <FileText className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-700 truncate">
              {source.name}
            </span>
          </div>
          
          {/* Content */}
          <div className="text-xs text-slate-600 leading-relaxed max-h-40 overflow-y-auto">
            {loading && (
              <div className="flex items-center gap-2 text-slate-400 py-4 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>加载中...</span>
              </div>
            )}
            {error && (
              <div className="text-red-500 py-2">{error}</div>
            )}
            {!loading && !error && content && (
              <p className="whitespace-pre-wrap">{content}</p>
            )}
          </div>
          
          {/* Footer hint */}
          <div className="mt-3 pt-2 border-t border-slate-100 text-[10px] text-slate-400 text-center">
            点击查看完整内容
          </div>
          
          <HoverCard.Arrow className="fill-white" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  )
}
