import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import type { UploadTask, TaskStatus } from '@/types';
import { toast } from 'sonner';

interface UploadContextType {
  tasks: UploadTask[];
  uploadFiles: (files: File[], kbId: string) => void;
  removeTask: (id: string) => void;
  clearCompleted: () => void;
  activeCount: number;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

const STORAGE_KEY = 'dls_rag_upload_tasks';

export const UploadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const tasksRef = useRef<UploadTask[]>([]);

  // Update ref whenever tasks change
  useEffect(() => {
    tasksRef.current = tasks;
    // Persist tasks to localStorage (exclude File object)
    const persistableTasks = tasks.map(({ file, ...rest }) => rest);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistableTasks));
  }, [tasks]);

  // Load tasks from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Only recover tasks that have a taskId (processing) or were completed/failed
        // Tasks that were 'uploading' but lost their File object are marked as failed
        const recovered = parsed.map((t: any) => ({
          ...t,
          file: null as any, // File handle lost on refresh
          status: (t.status === 'uploading' || t.status === 'queue') ? 'failed' : t.status,
          error: (t.status === 'uploading' || t.status === 'queue') ? '页面刷新导致上传中断' : t.error
        }));
        setTasks(recovered);
      } catch (e) {
        console.error("Failed to parse saved tasks", e);
      }
    }
  }, []);

  const updateTask = useCallback((id: string, updates: Partial<UploadTask>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  const uploadFiles = useCallback((files: File[], kbId: string) => {
    const newTasks: UploadTask[] = files.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      filename: file.name,
      kbId,
      status: 'queue',
      progress: 0,
      createdAt: Date.now()
    }));

    setTasks(prev => [...prev, ...newTasks]);
    toast.info(`已加入上传队列 (${files.length} 个文件)`);
  }, []);

  // Process queue
  useEffect(() => {
    const processQueue = async () => {
      const pendingTask = tasksRef.current.find(t => t.status === 'queue' && t.file);
      if (!pendingTask) return;

      const id = pendingTask.id;
      updateTask(id, { status: 'uploading', progress: 10 });

      try {
        const res = await api.uploadFile(pendingTask.file, pendingTask.kbId);
        if (res.task_id) {
          updateTask(id, { 
            status: 'processing', 
            taskId: res.task_id, 
            progress: 50 
          });
        } else {
          updateTask(id, { status: 'completed', progress: 100 });
        }
      } catch (error: any) {
        updateTask(id, { status: 'failed', error: error.message || '上传失败', progress: 0 });
        toast.error(`${pendingTask.filename} 上传失败`);
      }
    };

    const activeUploads = tasksRef.current.filter(t => t.status === 'uploading').length;
    if (activeUploads < 2) { // Max 2 concurrent uploads
      processQueue();
    }
  }, [tasks, updateTask]);

  // Poll for background task status (Celery)
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      const processingTasks = tasksRef.current.filter(t => t.status === 'processing' && t.taskId);
      
      for (const task of processingTasks) {
        try {
          const statusRes: TaskStatus = await api.getTaskStatus(task.taskId!);
          
          // Celery statuses: PENDING, STARTED, SUCCESS, FAILURE, RETRY, REVOKED
          if (statusRes.status === 'success') {
            updateTask(task.id, { status: 'completed', progress: 100 });
            toast.success(`${task.filename} 处理完成`);
          } else if (statusRes.status === 'failure' || statusRes.status === 'failed') {
            updateTask(task.id, { status: 'failed', error: statusRes.error || '解析失败', progress: 0 });
            toast.error(`${task.filename} 解析失败`);
          } else if (statusRes.status === 'processing' || statusRes.status === 'started' || statusRes.status === 'pending') {
            // Keep polling
            updateTask(task.id, { progress: 75 }); // Simple progress indicator for processing
          }
        } catch (e) {
          console.error(`Error polling task ${task.taskId}:`, e);
        }
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [updateTask]);

  const removeTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const clearCompleted = () => {
    setTasks(prev => prev.filter(t => t.status !== 'completed' && t.status !== 'failed'));
  };

  const activeCount = tasks.filter(t => t.status === 'queue' || t.status === 'uploading' || t.status === 'processing').length;

  return (
    <UploadContext.Provider value={{ tasks, uploadFiles, removeTask, clearCompleted, activeCount }}>
      {children}
    </UploadContext.Provider>
  );
};

export const useUpload = () => {
  const context = useContext(UploadContext);
  if (context === undefined) {
    throw new Error('useUpload must be used within an UploadProvider');
  }
  return context;
};
