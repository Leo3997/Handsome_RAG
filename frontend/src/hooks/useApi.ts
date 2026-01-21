/**
 * SWR-based API hooks for data fetching with caching
 * 使用 SWR 进行数据缓存，避免重复请求，提升页面切换速度
 */
import useSWR from 'swr'
import { API_BASE_URL } from '@/lib/api'
import type { FileItem, BackendStats } from '@/types'

// 通用 fetcher - 使用已有的 api 方法确保认证
const authFetcher = async (url: string) => {
  const token = localStorage.getItem('auth_token')
  const res = await fetch(url, {
    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

interface KnowledgeBase {
  id: string
  name: string
  description?: string
  created_at: string
  file_count: number
  tags?: string[]
  chunks?: number
}

/**
 * 获取知识库列表（带缓存）
 */
export function useKnowledgeBases() {
  const { data, error, isLoading, mutate } = useSWR<KnowledgeBase[]>(
    `${API_BASE_URL}/knowledge-bases`,
    authFetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000, // 5秒内不重复请求
      revalidateOnReconnect: false,
    }
  )
  
  return {
    knowledgeBases: data || [],
    isLoading,
    error,
    refresh: mutate
  }
}

/**
 * 获取指定知识库的文档列表
 */
export function useKbDocuments(kbId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<FileItem[]>(
    kbId ? `${API_BASE_URL}/knowledge-bases/${kbId}/documents` : null,
    authFetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 3000,
    }
  )
  
  return {
    documents: data || [],
    isLoading,
    error,
    refresh: mutate
  }
}

/**
 * 获取统计信息
 */
export function useStats(kbId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<BackendStats>(
    kbId ? `${API_BASE_URL}/stats?kb_id=${encodeURIComponent(kbId)}` : null,
    authFetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
    }
  )
  
  return {
    stats: data,
    isLoading,
    error,
    refresh: mutate
  }
}

/**
 * 获取所有文档（用于 Assets 页面）
 */
export function useDocuments() {
  const { data, error, isLoading, mutate } = useSWR<FileItem[]>(
    `${API_BASE_URL}/documents`,
    authFetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 3000,
    }
  )
  
  return {
    documents: data || [],
    isLoading,
    error,
    refresh: mutate
  }
}
