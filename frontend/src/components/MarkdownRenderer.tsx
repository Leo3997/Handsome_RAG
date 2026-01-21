import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Check, Copy } from 'lucide-react'
import { CitationPopover } from './CitationPopover'

interface MarkdownRendererProps {
  content: string
  className?: string
  onReferenceClick?: (index: number) => void
  sources?: any[]  // 新增：用于悬浮预览
}

export function MarkdownRenderer({ content, className = '', onReferenceClick, sources = [] }: MarkdownRendererProps) {
  // 渲染引用标记的逻辑
  const renderContentWithCitations = (text: string) => {
    if (!onReferenceClick) return text;
    
    const parts = text.split(/(\[\d+\])/g);
    return parts.map((part, i) => {
      const match = part.match(/\[(\d+)\]/);
      if (match) {
        const index = parseInt(match[1]);
        const buttonEl = (
          <button
            key={i}
            onClick={() => onReferenceClick(index)}
            className="inline-flex items-center justify-center w-5 h-5 ml-1 mr-0.5 text-[10px] font-bold text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-full hover:bg-cyan-100 transition-colors align-top mt-0.5"
          >
            {index}
          </button>
        );
        
        // 如果有 sources，使用 CitationPopover 包裹
        if (sources.length > 0) {
          return (
            <CitationPopover 
              key={i} 
              index={index} 
              sources={sources}
              onClick={() => onReferenceClick(index)}
            >
              {buttonEl}
            </CitationPopover>
          );
        }
        
        return buttonEl;
      }
      return part;
    });
  };

  return (
    <div className={`prose-chat ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // 处理文本节点以识别引用
          // 注意：react-markdown 会将文本拆分为多个节点
          // 这里我们简单处理段落中的文本
          p({ children }) {
            return (
              <p>
                {React.Children.map(children, child => {
                  if (typeof child === 'string') {
                    return renderContentWithCitations(child);
                  }
                  return child;
                })}
              </p>
            );
          },
          li({ children }) {
            return (
              <li>
                {React.Children.map(children, child => {
                  if (typeof child === 'string') {
                    return renderContentWithCitations(child);
                  }
                  return child;
                })}
              </li>
            );
          },
          // 代码块
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            const codeString = String(children).replace(/\n$/, '')
            
            if (match) {
              return (
                <CodeBlock language={match[1]} code={codeString} />
              )
            }
            
            // 行内代码
            return (
              <code className="inline-code" {...props}>
                {children}
              </code>
            )
          },
          
          // 链接
          a({ href, children, ...props }) {
            const isExternal = href?.startsWith('http')
            return (
              <a
                href={href}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                className="text-cyan-600 hover:text-cyan-700 underline decoration-cyan-300 underline-offset-2 transition-colors"
                {...props}
              >
                {children}
              </a>
            )
          },
          
          // 预格式块包装
          pre({ children }) {
            return <>{children}</>
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

// 代码块组件（带复制按钮）
function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="code-block-wrapper group">
      <div className="code-block-header">
        <span className="code-language">{language}</span>
        <button
          onClick={handleCopy}
          className="copy-button"
          title={copied ? '已复制' : '复制代码'}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: '0 0 8px 8px',
          fontSize: '13px',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}
