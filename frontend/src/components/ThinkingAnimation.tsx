import { useState, useEffect } from 'react'
import { Search, Brain, Sparkles, FileText } from 'lucide-react'

interface ThinkingAnimationProps {
  isSearching?: boolean;  // 是否正在检索（有 sources 后变成 false）
  isGenerating?: boolean; // 是否正在生成（有 content 后变成 false）
}

const THINKING_STEPS = [
  { icon: Search, text: '正在检索知识库...', color: 'text-blue-500' },
  { icon: FileText, text: '分析相关文档...', color: 'text-purple-500' },
  { icon: Brain, text: '整合信息思考中...', color: 'text-orange-500' },
  { icon: Sparkles, text: '生成回答...', color: 'text-cyan-500' },
]

export function ThinkingAnimation({ isSearching = true, isGenerating = true }: ThinkingAnimationProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [dots, setDots] = useState('')

  // Cycle through steps
  useEffect(() => {
    if (!isSearching && !isGenerating) return;
    
    const stepInterval = setInterval(() => {
      setCurrentStep(prev => {
        // If we have sources, skip the first two steps
        if (!isSearching && prev < 2) return 2;
        // Cycle through available steps
        const maxStep = isGenerating ? THINKING_STEPS.length - 1 : 1;
        return prev >= maxStep ? (isSearching ? 0 : 2) : prev + 1;
      })
    }, 2000)

    return () => clearInterval(stepInterval)
  }, [isSearching, isGenerating])

  // Animate dots
  useEffect(() => {
    const dotsInterval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.')
    }, 400)
    return () => clearInterval(dotsInterval)
  }, [])

  const step = THINKING_STEPS[currentStep]
  const Icon = step.icon

  return (
    <div className="flex flex-col gap-2 items-start animate-in fade-in slide-in-from-left-2 duration-300">
      <div className="bg-gradient-to-br from-white to-slate-50 border-slate-200 rounded-2xl rounded-tl-none px-5 py-4 shadow-sm border">
        {/* Main thinking indicator */}
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 ${step.color}`}>
            <Icon className="h-5 w-5 animate-pulse" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-slate-700">
              {step.text.replace('...', '')}<span className="text-slate-400">{dots}</span>
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5">
              AI 正在为您查找最佳答案
            </span>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-slate-100">
          {THINKING_STEPS.map((s, idx) => {
            const StepIcon = s.icon
            const isActive = idx === currentStep
            const isPast = idx < currentStep
            return (
              <div 
                key={idx}
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] transition-all duration-300 ${
                  isActive 
                    ? 'bg-slate-900 text-white scale-105' 
                    : isPast 
                      ? 'bg-slate-200 text-slate-500' 
                      : 'bg-slate-100 text-slate-400'
                }`}
              >
                <StepIcon className={`h-3 w-3 ${isActive ? 'animate-spin' : ''}`} style={{ animationDuration: '2s' }} />
                {isActive && <span className="hidden sm:inline">{s.text.split('...')[0]}</span>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
