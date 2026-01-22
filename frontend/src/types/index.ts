// Common interfaces for the DLS_RAG application

/**
 * Represents a document/file in the knowledge base
 */
export interface FileItem {
  id: number | string;
  name: string;
  type: string;
  size: string;
  status?: 'indexed' | 'processing' | 'failed';
  date: string;
}

/**
 * Search result item from global search API
 */
export interface SearchResult {
  filename: string;
  content: string;
  page: number;
  score: number;
  type: string;
}

/**
 * Source reference for RAG responses
 */
export interface Source {
  name: string;
  page: number;
  type: string;
  image_url?: string;
}

/**
 * Statistics returned from query API
 */
export interface QueryStats {
  time: number;
  tokens: number;
  doc_count: number;
}

/**
 * Response from the query API
 */
export interface QueryResponse {
  answer: string;
  sources: Source[];
  stats?: QueryStats;
}

/**
 * Backend statistics
 */
export interface BackendStats {
  total_files: number;
  indexed_chunks: number;
  total_size_mb?: number;
  db_active: boolean;
}

/**
 * System configuration settings
 */
export interface ConfigSettings {
  llm_provider: 'dashscope' | 'deepseek' | 'openai';
  api_key: string;
  model_name: string;
  base_url: string;
  top_k: number;
  temperature: number;
}

/**
 * Task status for async operations
 */
export interface TaskStatus {
  id: string;
  filename?: string;
  status: 'pending' | 'started' | 'processing' | 'completed' | 'failed' | 'success' | 'failure';
  startTime?: number;
  result?: any;
  error?: string;
}

export interface UploadTask {
  id: string; // Internal UUID or Task ID from backend
  file: File;
  filename: string;
  kbId: string;
  status: 'queue' | 'uploading' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  taskId?: string; // Celery task ID
  error?: string;
  createdAt: number;
}

/**
 * PPT slides response
 */
export interface PPTSlidesResponse {
  source: string;
  slides: string[];
}
