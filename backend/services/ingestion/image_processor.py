import dashscope
from http import HTTPStatus
import os

class ImageProcessor:
    def __init__(self, config):
        self.config = config
        dashscope.api_key = getattr(self.config, 'DASH_SCOPE_API_KEY', os.getenv("DASH_SCOPE_API_KEY"))

    def process(self, image_path):
        """
        Unified process method for IngestionService.
        """
        description = self.describe_image(image_path)
        return [{
            'text_content': description,
            'page_number': 1
        }]

    def describe_image(self, image_path):
        content = [
            {'image': f'file://{os.path.abspath(image_path)}'},
            {'text': '请详细描述这张图片的内容、风格和可能的用途。如果是图表，请提取其中的关键文字和数据。'}
        ]
        messages = [{'role': 'user', 'content': content}]
        try:
            # Use the model from config if available, otherwise default to qwen-vl-plus
            model = getattr(self.config, 'QWEN_VL_MODEL', 'qwen-vl-plus')
            response = dashscope.MultiModalConversation.call(model=model, messages=messages)
            if response.status_code == HTTPStatus.OK:
                return response.output.choices[0].message.content[0]['text']
            else:
                return f"无法描述图片内容: {response.message}"
        except Exception as e:
            return f"图片解析异常: {e}"
