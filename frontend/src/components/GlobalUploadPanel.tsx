import React, { useState } from 'react';
import { useUpload } from '@/context/UploadContext';
import { 
  X, 
  ChevronUp, 
  ChevronDown, 
  FileUp, 
  CheckCircle2, 
  AlertCircle, 
  Loader2
} from 'lucide-react';
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

export const GlobalUploadPanel: React.FC = () => {
  const { tasks, removeTask, clearCompleted, activeCount } = useUpload();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHidden, setIsHidden] = useState(false);

  if (tasks.length === 0 || isHidden) return null;

  return (
    <div className={`fixed bottom-6 right-6 z-[100] transition-all duration-300 transform ${isExpanded ? 'w-80' : 'w-64'}`}>
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div 
          className="bg-slate-900 text-white px-4 py-3 flex justify-between items-center cursor-pointer select-none"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <FileUp className={`h-4 w-4 ${activeCount > 0 ? 'animate-bounce' : ''}`} />
            <span className="text-xs font-bold uppercase tracking-wider">
              {activeCount > 0 ? `正在处理 (${activeCount})` : '处理完成'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 text-slate-400 hover:text-white hover:bg-slate-800"
                onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
            <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 text-slate-400 hover:text-red-400 hover:bg-slate-800"
                onClick={(e) => { e.stopPropagation(); clearCompleted(); if (tasks.length === 0) setIsHidden(true); }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Task List */}
        {isExpanded && (
          <div className="max-h-96 overflow-y-auto bg-slate-50/50">
            <div className="p-2 space-y-2">
              {tasks.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">暂无上传任务</div>
              ) : (
                tasks.slice().reverse().map((task) => (
                  <div key={task.id} className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm transition-all hover:border-cyan-100">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[11px] font-bold text-slate-700 truncate block" title={task.filename}>
                          {task.filename}
                        </span>
                        <span className="text-[9px] text-slate-400 font-medium">KB: {task.kbId}</span>
                      </div>
                      <div className="ml-2 shrink-0">
                        {task.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                        {task.status === 'failed' && <AlertCircle className="h-4 w-4 text-red-500" />}
                        {(task.status === 'uploading' || task.status === 'processing') && <Loader2 className="h-4 w-4 text-cyan-500 animate-spin" />}
                        {task.status === 'queue' && <div className="h-4 w-4 rounded-full border-2 border-slate-200 border-t-slate-400 animate-spin" />}
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-5 w-5 ml-1 text-slate-300 hover:text-slate-500"
                        onClick={() => removeTask(task.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Progress value={task.progress} className={`h-1 flex-1 ${task.status === 'failed' ? 'bg-red-100' : ''}`} />
                      <span className="text-[9px] font-mono font-bold text-slate-500 w-6 text-right">{task.progress}%</span>
                    </div>

                    {task.error && (
                      <div className="mt-1.5 text-[9px] text-red-500 font-medium bg-red-50 px-1.5 py-0.5 rounded border border-red-100/50 italic">
                        {task.error}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Footer (Simplified progress when collapsed) */}
        {!isExpanded && activeCount > 0 && (
          <div className="px-4 py-2 bg-white border-t border-slate-100">
             <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse" />
                <span className="text-[10px] text-slate-400 font-medium">任务进行中...</span>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};
