import dashscope
from http import HTTPStatus
import os

class LLMService:
    def __init__(self, config):
        self.config = config
        dashscope.api_key = self.config.DASH_SCOPE_API_KEY

    def generate_response(self, query, context_docs, history=None):
        """
        Returns a tuple: (content, usage_dict)
        """
        history = history or []
        context_text = "\n\n".join([f"[{i+1}] 资料片段:\n{doc}" for i, doc in enumerate(context_docs)])
        
        # Format history for prompt
        history_text = ""
        if history:
            history_text = "\n".join([f"{'用户' if m['role']=='user' else '助手'}: {m['content']}" for m in history[-5:]])
            history_text = f"### 最近对话历史：\n{history_text}\n\n"

        prompt = f"""你是一个专业、博学且严谨的企业知识库助手。北京时间现在是{os.getenv("CURRENT_TIME", "2024年")}。
{history_text}请基于以下提供的【参考资料】回答用户最新的问题。如果资料内容丰富，请务必提供详尽、深入且结构化的回答。

### 回答要求：
1. **内容详实**：不要只给出简短的结论。如果资料涉及技术流程、核心原理、具体步骤或背景数据，请尽可能完整地还原并展开说明。
2. **结构化输出**：善用标题、列表（有序或无序）和粗体来组织内容，使回答清晰易读，逻辑性强。
3. **精准推荐与引用**：
   - 识别出最相关的文件名，并说明该文件为何值得参考。
   - 在回答中强制使用 [1]、[2] 等数字标记引用对应的资料片段，例如"该系统的核心算法采用了...[1]"。
4. **诚实与逻辑**：如果资料内容有限，请在回答完已知信息后再说明缺失的部分。严禁凭空捏造。

### 参考资料：
{context_text}

### 用户当前问题：
{query}

### 建议回答（请展开论述）："""

        messages = [
            {'role': 'system', 'content': '你是一个善于分析资料并给出精准建议的AI助手。'},
            {'role': 'user', 'content': prompt}
        ]

        # Determine Provider
        provider = self.config.SETTINGS.get("llm_provider", "dashscope")
        api_key = self.config.SETTINGS.get("api_key")
        model = self.config.SETTINGS.get("model_name")
        temp = self.config.SETTINGS.get("temperature", 0.5)

        if provider == "dashscope":
            # Use original DashScope SDK logic
            dashscope.api_key = api_key
            try:
                response = dashscope.Generation.call(
                    model=model,
                    messages=messages,
                    # DashScope specific parameters? result_format='message' is standard for their SDK
                    result_format='message',
                    temperature=temp
                )

                if response.status_code == HTTPStatus.OK:
                    usage = {
                        "total_tokens": response.usage.total_tokens,
                        "input_tokens": response.usage.input_tokens,
                        "output_tokens": response.usage.output_tokens
                    }
                    return response.output.choices[0].message.content, usage
                else:
                    error_msg = f"Qwen API Error: {response.code} - {response.message}"
                    print(error_msg)
                    return f"抱歉，Qwen 服务遇到问题：{response.message}", {}
            except Exception as e:
                print(f"DashScope Exception: {e}")
                return f"调用模型失败: {str(e)}", {}

        elif provider in ["deepseek", "openai"]:
            # Use generic OpenAI-compatible API via requests
            import requests
            
            base_url = self.config.SETTINGS.get("base_url", "")
            if provider == "deepseek" and not base_url:
                base_url = "https://api.deepseek.com" # Default for DeepSeek
            
            if not base_url:
                 return "配置错误：未填写 Base URL", {}

            endpoint = f"{base_url.rstrip('/')}/chat/completions"
            
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            }
            
            payload = {
                "model": model,
                "messages": messages,
                "temperature": temp,
                "stream": False
            }
            
            try:
                print(f"Calling Generic API: {endpoint} with model {model}")
                resp = requests.post(endpoint, json=payload, headers=headers, timeout=60)
                
                if resp.status_code == 200:
                    data = resp.json()
                    content = data['choices'][0]['message']['content']
                    usage_raw = data.get('usage', {})
                    usage = {
                        "total_tokens": usage_raw.get('total_tokens', 0),
                        "input_tokens": usage_raw.get('prompt_tokens', 0),
                        "output_tokens": usage_raw.get('completion_tokens', 0)
                    }
                    return content, usage
                else:
                    return f"API Error ({resp.status_code}): {resp.text}", {}
            except Exception as e:
                print(f"Generic API Exception: {e}")
                return f"调用外部模型失败: {str(e)}", {}
        
        else:
            return "配置错误：未知的模型提供商", {}

    def get_embedding(self, text_or_list):
        """
        Calls DashScope Text Embedding API.
        text_or_list: str or list of str
        Returns: list of embeddings (each is a list of floats)
        """
        api_key = self.config.SETTINGS.get("api_key")
        if not api_key:
            api_key = self.config.DASH_SCOPE_API_KEY
            
        try:
            from dashscope import TextEmbedding
            model_name = TextEmbedding.Models.text_embedding_v2
            
            # If single string, handle directly
            if isinstance(text_or_list, str):
                print(f"DEBUG: Generating embedding using model: {model_name}")
                resp = TextEmbedding.call(model=model_name, input=text_or_list, api_key=api_key)
                if resp.status_code == HTTPStatus.OK:
                    return resp.output['embeddings'][0]['embedding']
                else:
                    print(f"Embedding Error: {resp.code} - {resp.message}")
                    return None
            
            # If list, implement batching (DashScope limit is 25)
            else:
                batch_size = 25
                all_embeddings = [None] * len(text_or_list)
                
                for i in range(0, len(text_or_list), batch_size):
                    batch = text_or_list[i : i + batch_size]
                    print(f"DEBUG: Generating embedding for batch {i//batch_size + 1} (size {len(batch)}) using model: {model_name}")
                    
                    resp = TextEmbedding.call(
                        model=model_name,
                        input=batch,
                        api_key=api_key
                    )
                    
                    if resp.status_code == HTTPStatus.OK:
                        # Map back using original indices within this batch
                        for item in resp.output['embeddings']:
                            original_index = i + item['text_index']
                            all_embeddings[original_index] = item['embedding']
                    else:
                        print(f"Embedding Error in batch {i//batch_size + 1}: {resp.code} - {resp.message}")
                        return None # Fail fast on batch error
                
                return all_embeddings
        except Exception as e:
            print(f"Embedding Exception: {str(e)}")
            return None

    def rerank(self, query, documents, top_n=5):
        """
        Reranks documents using DashScope Rerank API.
        documents: list of strings (content only)
        Returns: list of indices sorted by relevance
        """
        provider = self.config.SETTINGS.get("llm_provider", "dashscope")
        api_key = self.config.SETTINGS.get("api_key")
        
        if provider != "dashscope":
            # For now, only support DashScope rerank
            # If other provider, return first top_n as fallback
            return list(range(min(len(documents), top_n)))

        try:
            from dashscope import TextReRank
            resp = TextReRank.call(
                model='gte-rerank',
                query=query,
                documents=documents,
                top_n=top_n,
                api_key=api_key
            )

            if resp.status_code == HTTPStatus.OK:
                # resp.output.results is a list of results with index and relevance_score
                return [r.index for r in resp.output.results]
            else:
                print(f"Rerank Error: {resp.code} - {resp.message}. Falling back to original order.")
                return list(range(min(len(documents), top_n)))
        except Exception as e:
            print(f"Rerank Exception: {str(e)}. Falling back.")
            return list(range(min(len(documents), top_n)))

    def fuzzy_correct_query(self, query):
        """
        使用拼音进行模糊纠错，容忍用户输入错别字。
        例如："AI温书" -> 可能匹配 "AI问数"
        """
        try:
            from pypinyin import lazy_pinyin
            # 返回拼音版本供后续匹配
            pinyin_query = ''.join(lazy_pinyin(query))
            return query, pinyin_query
        except ImportError:
            return query, query
    
    def rewrite_query(self, query, history):
        """
        Rewrites the user query to be standalone based on conversation history.
        Also performs fuzzy correction for typos.
        """
        # 先进行拼音纠错
        original_query, pinyin_query = self.fuzzy_correct_query(query)
        
        if not history:
            return query
            
        history_text = "\n".join([f"{'User' if m['role']=='user' else 'Assistant'}: {m['content']}" for m in history[-5:]])
        
        prompt = f"""你是一个查询纠错和关键词提取器。请完成以下任务：

1. **纠错**：如果用户输入包含错别字或拼音相近的词，请纠正为正确的专业术语。
   - 例如："AI温书" → "AI问数"，"数据仑库" → "数据仓库"
2. **提取关键词**：从对话历史中提取核心搜索实体。

# 对话历史：
{history_text}

# 用户原始输入：{query}
# 拼音参考：{pinyin_query}

# 输出纠正后的独立查询（仅输出关键词，不要解释）："""

        messages = [
            {'role': 'system', 'content': 'You are a query corrector and keyword extractor for Chinese RAG system.'},
            {'role': 'user', 'content': prompt}
        ]

        try:
            provider = self.config.SETTINGS.get("llm_provider", "dashscope")
            api_key = self.config.SETTINGS.get("api_key")
            model = self.config.SETTINGS.get("model_name")
            
            if provider == "dashscope":
                dashscope.api_key = api_key
                response = dashscope.Generation.call(
                    model=model,
                    messages=messages,
                    result_format='message',
                    temperature=0.1
                )
                if response.status_code == HTTPStatus.OK:
                    rewritten = response.output.choices[0].message.content.strip()
                    rewritten = rewritten.strip('"').strip("'")
                    print(f"DEBUG: Query rewritten to: {rewritten}")
                    return rewritten
            elif provider in ["deepseek", "openai"]:
                import requests
                base_url = self.config.SETTINGS.get("base_url", "")
                if provider == "deepseek" and not base_url:
                    base_url = "https://api.deepseek.com"
                endpoint = f"{base_url.rstrip('/')}/chat/completions"
                headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
                payload = {"model": model, "messages": messages, "temperature": 0.1, "stream": False}
                resp = requests.post(endpoint, json=payload, headers=headers, timeout=30)
                if resp.status_code == 200:
                    rewritten = resp.json()['choices'][0]['message']['content'].strip()
                    rewritten = rewritten.strip('"').strip("'")
                    print(f"DEBUG: Query rewritten to: {rewritten}")
                    return rewritten
        except Exception as e:
            print(f"ERROR: Query rewriting failed: {e}")
            
        return query

    def detect_intent(self, query):
        """
        Detects user intent: FILE_QUERY, SUMMARY, or FACTOID.
        """
        prompt = f"""Analyze the user's RAG query and classify it into one of these categories:
- FILE_QUERY: User is looking for a specific file, asking what files exist, or wants to see a document list.
- SUMMARY: User wants a broad summary, comparison, or high-level analysis of documents.
- FACTOID: User is asking a specific question, looking for a detail, or needs an explanation of a concept.

Return ONLY the category name.

Query: "{query}"
Category:"""
        
        messages = [
            {'role': 'system', 'content': 'You are a query intent classifier.'},
            {'role': 'user', 'content': prompt}
        ]
        
        try:
            provider = self.config.SETTINGS.get("llm_provider", "dashscope")
            api_key = self.config.SETTINGS.get("api_key")
            model = self.config.SETTINGS.get("model_name")
            
            if provider == "dashscope":
                dashscope.api_key = api_key
                response = dashscope.Generation.call(model=model, messages=messages, result_format='message', temperature=0.1)
                if response.status_code == HTTPStatus.OK:
                    return response.output.choices[0].message.content.strip().upper()
            elif provider in ["deepseek", "openai"]:
                import requests
                base_url = self.config.SETTINGS.get("base_url", "")
                endpoint = f"{base_url.rstrip('/')}/chat/completions"
                headers = {"Authorization": f"Bearer {api_key}"}
                payload = {"model": model, "messages": messages, "temperature": 0.1}
                resp = requests.post(endpoint, json=payload, headers=headers, timeout=10)
                if resp.status_code == 200:
                    return resp.json()['choices'][0]['message']['content'].strip().upper()
        except Exception as e:
            print(f"Intent detection failed: {e}")
            
        return "FACTOID"

    def generate_stream(self, query, context_docs, history=None):
        """
        Yields chunks of content (strings).
        """
        history = history or []
        context_text = "\n\n".join([f"[{i+1}] 资料片段:\n{doc}" for i, doc in enumerate(context_docs)])
        
        history_text = ""
        if history:
            history_text = "\n".join([f"{'用户' if m['role']=='user' else '助手'}: {m['content']}" for m in history[-5:]])
            history_text = f"### 最近对话历史：\n{history_text}\n\n"

        prompt = f"""你是一个简洁高效的企业知识库助手。
{history_text}请基于以下【参考资料】回答用户问题。

### 回答要求（务必遵守）：
1. **简明扼要**：直接给出答案，避免冗长铺垫和重复内容。
2. **输出结构**：
   - **相关文件**：列出最相关的文件名（1-3个）
   - **关键代码/内容**：如有代码片段，直接展示核心部分
   - **技术栈/要点**：简短列出涉及的技术或核心概念
   - **综合分析**：用2-3句话总结要点
3. **引用标记**：使用 [1]、[2] 标记引用来源
4. **诚实原则**：资料中无相关信息时直接说明

### 参考资料：
{context_text}

### 用户问题：
{query}

### 回答："""

        messages = [
            {'role': 'system', 'content': '你是一个善于分析资料并给出精准建议的AI助手。'},
            {'role': 'user', 'content': prompt}
        ]

        provider = self.config.SETTINGS.get("llm_provider", "dashscope")
        api_key = self.config.SETTINGS.get("api_key")
        model = self.config.SETTINGS.get("model_name")
        temp = self.config.SETTINGS.get("temperature", 0.5)

        if provider == "dashscope":
            dashscope.api_key = api_key
            total_tokens = 0
            try:
                responses = dashscope.Generation.call(
                    model=model,
                    messages=messages,
                    result_format='message',
                    temperature=temp,
                    stream=True,
                    incremental_output=True # DashScope specific for cleaner streaming
                )
                for response in responses:
                    if response.status_code == HTTPStatus.OK:
                        # For dashscope incremental, we get the new part
                        yield response.output.choices[0].message.content
                        # Track usage from last response (DashScope accumulates)
                        if hasattr(response, 'usage') and response.usage:
                            total_tokens = response.usage.total_tokens
                    else:
                        yield f"\n[API Error: {response.message}]"
                # Yield stats as special dict at the end
                yield {"__stats__": {"total_tokens": total_tokens}}
            except Exception as e:
                yield f"\n[Stream Error: {str(e)}]"

        elif provider in ["deepseek", "openai"]:
            import requests
            import json
            
            base_url = self.config.SETTINGS.get("base_url", "")
            if provider == "deepseek" and not base_url:
                base_url = "https://api.deepseek.com"
            
            endpoint = f"{base_url.rstrip('/')}/chat/completions"
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            }
            payload = {
                "model": model,
                "messages": messages,
                "temperature": temp,
                "stream": True
            }

            try:
                resp = requests.post(endpoint, json=payload, headers=headers, stream=True, timeout=60)
                if resp.status_code != 200:
                    yield f"\n[API Error {resp.status_code}: {resp.text}]"
                    return

                for line in resp.iter_lines():
                    if not line:
                        continue
                    line_str = line.decode('utf-8')
                    if line_str.startswith('data: '):
                        data_str = line_str[6:]
                        if data_str == '[DONE]':
                            break
                        try:
                            data = json.loads(data_str)
                            chunk = data['choices'][0]['delta'].get('content', '')
                            if chunk:
                                yield chunk
                        except:
                            continue
            except Exception as e:
                yield f"\n[Stream Error: {str(e)}]"
