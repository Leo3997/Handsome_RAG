import dashscope
from http import HTTPStatus
import os

class LLMService:
    def __init__(self, config):
        self.config = config
        dashscope.api_key = self.config.DASH_SCOPE_API_KEY

    def generate_response(self, query, context_docs):
        """
        Returns a tuple: (content, usage_dict)
        usage_dict example: {'total_tokens': 150, 'input_tokens': 100, 'output_tokens': 50}
        """
        context_text = "\n\n".join([f"[{i+1}] 资料片段:\n{doc}" for i, doc in enumerate(context_docs)])
        
        prompt = f"""你是一个专业的企业智能助手。北京时间现在是{os.getenv("CURRENT_TIME", "2024年")}。
请基于以下提供的【参考资料】回答用户问题。

### 要求：
1. **精准推荐**：如果用户要求推荐PPT或资料，请根据资料内容识别出最相关的文件名，并说明推荐理由。
2. **行内引用**：在回答中使用 [1]、[2] 等数字标记引用对应的资料片段，例如"根据相关数据[1]显示..."。
3. **诚实原则**：如果资料中完全没有相关信息，请直接告知，不要编造。

### 参考资料：
{context_text}

### 用户问题：
{query}

### 建议回答："""

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
            resp = TextEmbedding.call(
                model=TextEmbedding.Models.text_embedding_v2,
                input=text_or_list,
                api_key=api_key
            )
            if resp.status_code == HTTPStatus.OK:
                # If single string, return the vector. If list, return list of vectors.
                # But to stay consistent, let's always return a list of vectors if input was a list.
                # If input was string, wrap it.
                if isinstance(text_or_list, str):
                    return resp.output['embeddings'][0]['embedding']
                else:
                    # Return list in original order
                    embeddings = [None] * len(text_or_list)
                    for item in resp.output['embeddings']:
                        embeddings[item['text_index']] = item['embedding']
                    return embeddings
            else:
                print(f"Embedding Error: {resp.code} - {resp.message}")
                return None
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

    def generate_stream(self, query, context_docs):
        """
        Yields chunks of content (strings).
        """
        context_text = "\n\n".join([f"[{i+1}] 资料片段:\n{doc}" for i, doc in enumerate(context_docs)])
        
        prompt = f"""你是一个专业的企业智能助手。
请基于以下提供的【参考资料】回答用户问题。

### 要求：
1. **精准推荐**：如果用户要求推荐PPT或资料，请根据资料内容识别出最相关的文件名，并说明推荐理由。
2. **行内引用**：在回答中使用 [1]、[2] 等数字标记引用对应的资料片段，例如"根据相关数据[1]显示..."。
3. **诚实原则**：如果资料中完全没有相关信息，请直接告知，不要编造。

### 参考资料：
{context_text}

### 用户问题：
{query}

### 建议回答："""

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
