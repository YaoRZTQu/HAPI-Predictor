"""
HAPI预测系统API模块
包含以下路由：
- model_management: 模型管理API
- upload: 文件上传API
- websocket: WebSocket API
- auth: 用户认证API
- medical_analysis: 医学图像分析API
"""

from . import model_management, upload, websocket, auth