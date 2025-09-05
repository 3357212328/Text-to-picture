import webview
import json
import os
from PIL import Image, ImageDraw, ImageFont
import base64
from io import BytesIO
import logging
import textwrap

# 设置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

CONFIG_FILE = 'config.json'

class Api:
    def __init__(self):
        self.config = self.load_config()

    def load_config(self):
        try:
            if os.path.exists(CONFIG_FILE):
                with open(CONFIG_FILE, 'r') as f:
                    return json.load(f)
            logger.info("Config file not found, using default config")
            return {'theme': 'light', 'default_format': 'png', 'font_size': 24, 'bg_color': '#FFFFFF', 'font_color': '#000000', 'image_width': 800, 'history': []}
        except Exception as e:
            logger.error(f"Error loading config: {e}")
            return {'theme': 'light', 'default_format': 'png', 'font_size': 24, 'bg_color': '#FFFFFF', 'font_color': '#000000', 'image_width': 800, 'history': []}

    def save_config(self, config_data):
        try:
            self.config = config_data
            with open(CONFIG_FILE, 'w') as f:
                json.dump(self.config, f)
            logger.info("Config saved successfully")
            return {'success': True, 'message': '配置保存成功！'}
        except Exception as e:
            logger.error(f"Error saving config: {e}")
            return {'success': False, 'message': f'配置保存失败：{str(e)}'}

    def generate_image(self, text, format_type, font_size, bg_color, font_color, image_width):
        try:
            bg_color_tuple = tuple(int(bg_color.lstrip('#')[i:i+2], 16) for i in (0, 2, 4))
            font_color_tuple = tuple(int(font_color.lstrip('#')[i:i+2], 16) for i in (0, 2, 4))
            font_size = int(font_size)
            image_width = int(image_width)
            
            try:
                font = ImageFont.truetype("simsun.ttc", font_size * 2)  # 2倍字体大小，用于超采样
            except:
                try:
                    font = ImageFont.truetype("arial.ttf", font_size * 2)
                except:
                    font = ImageFont.load_default()

            # 固定边距 (2倍超采样值)
            left_margin = 20
            top_margin = 20
            right_margin = 20
            bottom_margin = 40

            # 按段落(\n)分割，保留原始段落布局
            paragraphs = text.split('\n')
            line_height = font.getbbox('A')[3] + 20  # 2倍行高 + 间距
            temp_width = image_width * 2
            wrap_width = (temp_width - (left_margin + right_margin) * 2) // (font_size)  # 2倍有效宽度估算
            total_height = (top_margin + bottom_margin) * 2 + 40  # 初始边距 + 底边距
            
            # 计算每段的行数和总高度
            wrapped_lines = []
            for paragraph in paragraphs:
                if not paragraph.strip():
                    wrapped_lines.append("")  # 空段
                    total_height += line_height + bottom_margin * 2  # 段间底边距
                    continue
                wrapper = textwrap.TextWrapper(width=wrap_width)
                lines = wrapper.wrap(text=paragraph)
                wrapped_lines.append(lines)
                total_height += len(lines) * line_height + bottom_margin * 2  # 段内行数 + 底边距
            
            temp_height = max(total_height, 400)  # 最小高度400px
            final_height = max(temp_height // 2, 200)

            # 创建2倍大小临时图片
            temp_img = Image.new('RGB', (temp_width, temp_height), color=bg_color_tuple)
            draw = ImageDraw.Draw(temp_img)
            
            y = top_margin * 2 + 20  # 起始Y（2倍 + 上边距）
            for lines in wrapped_lines:
                if not lines:  # 空段
                    y += line_height + bottom_margin * 2
                    continue
                for line in lines:
                    draw.text((left_margin * 2 + 20, y), line, fill=font_color_tuple, font=font)
                    y += line_height
                y += bottom_margin * 2  # 段间底边距
            
            # 缩放回原尺寸，使用高质量滤镜
            img = temp_img.resize((image_width, final_height), Image.LANCZOS)
            
            buffered = BytesIO()
            format_map = {'png': 'PNG', 'jpeg': 'JPEG', 'bmp': 'BMP'}
            img.save(buffered, format=format_map.get(format_type, 'PNG'))
            img_str = base64.b64encode(buffered.getvalue()).decode()
            logger.info("Image generated successfully")
            return {'success': True, 'image_data': f'data:image/{format_type};base64,{img_str}'}
        except Exception as e:
            logger.error(f"Error generating image: {e}")
            return {'success': False, 'message': f'图片生成失败：{str(e)}'}

    def choose_save_path(self, filename):
        try:
            if not webview.windows:
                logger.error("No active webview window")
                return {'success': False, 'message': '没有活动的窗口'}
            window = webview.windows[0]
            file_extension = filename.split(".")[-1]
            path = window.create_file_dialog(
                webview.SAVE_DIALOG,
                save_filename=filename,
                file_types=(f'Image Files (*.{file_extension})', 'All Files (*.*)')
            )
            logger.info(f"Save path selected: {path}")
            return {'success': True, 'path': path[0] if path else None}
        except Exception as e:
            logger.error(f"Error choosing save path: {e}")
            return {'success': False, 'message': f'选择保存路径失败：{str(e)}'}

if __name__ == '__main__':
    try:
        api = Api()
        window = webview.create_window('Text to Image Converter', 'index.html', js_api=api, width=800, height=800)
        logger.info("Starting pywebview window")
        webview.start(debug=False)
    except Exception as e:
        logger.error(f"Error starting application: {e}")