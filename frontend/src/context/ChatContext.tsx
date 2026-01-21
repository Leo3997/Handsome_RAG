import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: any[];
}

interface Stats {
  tokenUsage: number;
  retrievalTime: number;
  docCount: number;
}

interface Session {
  id: string;
  title: string;
  messages: Message[];
  stats?: Stats;
  createdAt: number;
}

interface ChatContextType {
  sessions: Session[];
  currentSessionId: string | null;
  currentSession: Session | undefined;
  messages: Message[];
  isLoading: boolean;
  
  addMessage: (msg: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  updateStats: (stats: Stats) => void;
  setLoading: (loading: boolean) => void;
  createNewSession: () => void;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  clearMessages: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

const INITIAL_SESSION_ID = 'default';
const WELCOME_MSG: Message = {
    id: '1',
    role: 'assistant',
    content: '您好！我是得鹿山知识库管家。我已经准备好基于您的企业资料（PPT、PDF、Excel等）为您提供精准的解答了。请问有什么我可以帮您的？',
};

export function ChatProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Session[]>(() => {
      const saved = localStorage.getItem('chat_sessions');
      if (saved) {
          try {
              return JSON.parse(saved);
          } catch (e) {
              console.error("Failed to parse sessions", e);
          }
      }
      return [{
          id: INITIAL_SESSION_ID,
          title: '新建会话',
          messages: [WELCOME_MSG],
          createdAt: Date.now()
      }];
  });

  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
      return localStorage.getItem('current_session_id') || INITIAL_SESSION_ID;
  });

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem('chat_sessions', JSON.stringify(sessions));
    localStorage.setItem('current_session_id', currentSessionId);
  }, [sessions, currentSessionId]);

  // Ensure currentSessionId is always valid
  useEffect(() => {
      if (sessions.length > 0 && !sessions.find(s => s.id === currentSessionId)) {
          console.warn(`Session ${currentSessionId} not found, resetting to ${sessions[0].id}`);
          setCurrentSessionId(sessions[0].id);
      }
  }, [sessions, currentSessionId]);

  const currentSession = sessions.find(s => s.id === currentSessionId);
  const messages = currentSession?.messages || [];

  const addMessage = (msg: Message) => {
      setSessions(prev => prev.map(s => {
          if (s.id === currentSessionId) {
              const newMessages = [...s.messages, msg];
              let newTitle = s.title;
              // Update title on first user message
              if (s.messages.length === 1 && s.messages[0].role === 'assistant' && msg.role === 'user') {
                   newTitle = msg.content.slice(0, 15);
                   if (msg.content.length > 15) newTitle += '...';
              }
              return { ...s, messages: newMessages, title: newTitle };
          }
          return s;
      }));
  };

  const updateMessage = (id: string, updates: Partial<Message>) => {
      setSessions(prev => prev.map(s => {
          if (s.id === currentSessionId) {
              const newMessages = s.messages.map(m => 
                  m.id === id ? { ...m, ...updates } : m
              );
              return { ...s, messages: newMessages };
          }
          return s;
      }));
  };

  const updateStats = (stats: Stats) => {
      setSessions(prev => prev.map(s => {
          if (s.id === currentSessionId) {
              return { ...s, stats };
          }
          return s;
      }));
  };

  const setLoadingState = (loading: boolean) => {
      setIsLoading(loading);
  };

  const createNewSession = () => {
      const newId = Date.now().toString();
      const newSession: Session = {
          id: newId,
          title: '新建会话',
          messages: [WELCOME_MSG],
          createdAt: Date.now()
      };
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(newId);
  };

  const switchSession = (id: string) => {
      setCurrentSessionId(id);
  };

  const handleDeleteSession = (id: string) => {
      const newSessions = sessions.filter(s => s.id !== id);
      let nextId = currentSessionId;
      
      if (newSessions.length === 0) {
          const newId = Date.now().toString();
          const newS = { id: newId, title: '新建会话', messages: [WELCOME_MSG], createdAt: Date.now() };
          setSessions([newS]);
          nextId = newId;
      } else {
          setSessions(newSessions);
          if (currentSessionId === id) {
              nextId = newSessions[0].id;
          }
      }
      setCurrentSessionId(nextId);
  };

  const clearMessages = () => {
      // For compatibility/reset: just reset current session
      setSessions(prev => prev.map(s => {
          if (s.id === currentSessionId) {
              return { ...s, messages: [WELCOME_MSG] };
          }
          return s;
      }));
  };

  return (
    <ChatContext.Provider value={{ 
        sessions, 
        currentSessionId, 
        currentSession, 
        messages, 
        isLoading, 
        addMessage, 
        updateMessage,
        updateStats, 
        setLoading: setLoadingState, 
        createNewSession, 
        switchSession, 
        deleteSession: handleDeleteSession,
        clearMessages
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return context;
}

export type { Message, Session, Stats };
