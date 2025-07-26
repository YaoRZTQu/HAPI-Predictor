#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
FastAPI主应用入口
包含应用初始化、路由配置、中间件设置等
"""

import os
from fastapi import FastAPI, HTTPException, Request, Depends, status, Cookie
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse
from pathlib import Path
from sqlalchemy.orm import Session
from typing import Optional
import datetime
import pandas as pd
import logging
import asyncio

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger("main")

# 获取当前文件的绝对路径
BASE_DIR = Path(__file__).resolve().parent

# 创建FastAPI实例
app = FastAPI(
    title="HAPI预测系统",
    description="基于机器学习的医院获得性压力性损伤（HAPI）预测系统",
    version="1.0.0"
)

# 配置静态文件目录
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

# 配置模板目录
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

# 配置CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允许所有来源，生产环境应该限制
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 导入路由和服务
from Predict.app.api import websocket, auth, medical_qa, dashboard, feedback, predictor
from Predict.app.services.db import create_tables, get_db
from Predict.app.services.auth import get_current_user, SECRET_KEY, ALGORITHM
from Predict.app.models.user import User
from Predict.app.services import predictor_service
from Predict.app.api import data_dashboard  # 导入数据看板API
from Predict.app.services import db  # 导入数据库服务

app.include_router(websocket.router, prefix="/api/ws", tags=["WebSocket"])
app.include_router(auth.router, prefix="/api/auth", tags=["认证"])
app.include_router(medical_qa.router, prefix="/api/medical", tags=["医疗问答"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["仪表盘"])
app.include_router(feedback.router, prefix="/api/feedback", tags=["反馈"])
app.include_router(predictor.router, prefix="/api/predictor", tags=["预测"])
app.include_router(data_dashboard.router)  # 添加数据看板路由器

# 启动事件
@app.on_event("startup")
async def startup_event():
    # 创建必要的目录
    os.makedirs("uploads", exist_ok=True)
    os.makedirs("results", exist_ok=True)
    os.makedirs("reports", exist_ok=True)
    
    # 创建数据库表
    create_tables()
    
    # 初始化预测历史表
    try:
        await db.create_prediction_history_table()
        logger.info("预测历史表初始化成功")
    except Exception as e:
        logger.error(f"预测历史表初始化错误: {e}")

# 自定义异常处理器
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """处理HTTP异常"""
    if exc.status_code == status.HTTP_401_UNAUTHORIZED:
        # 如果是认证失败，重定向到登录页面
        return RedirectResponse(url="/login", status_code=status.HTTP_302_FOUND)
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )

# 根路由 - 重定向到仪表盘或登录页面
@app.get("/")
async def root(request: Request):
    """根路由重定向到仪表盘或登录页面"""
    return RedirectResponse(url="/dashboard")

# 登录页面路由
@app.get("/login")
async def login_page(request: Request):
    """渲染登录页面"""
    try:
        # 如果用户已登录，直接重定向到仪表盘
        await get_current_user(request)
        return RedirectResponse(url="/dashboard")
    except HTTPException:
        # 如果用户未登录，显示登录页面
        return templates.TemplateResponse("login.html", {"request": request})

# 仪表盘页面路由
@app.get("/dashboard")
async def dashboard_page(request: Request, current_user: User = Depends(get_current_user)):
    """渲染仪表盘页面"""
    return templates.TemplateResponse("dashboard.html", {
        "request": request,
        "username": current_user.username
    })

# 登出路由
@app.get("/logout")
async def logout():
    """用户登出"""
    response = RedirectResponse(url="/login")
    response.delete_cookie("access_token")
    response.headers["Clear-Site-Data"] = '"storage"'  # 清除localStorage
    return response

# 注册页面路由
@app.get("/register")
async def register_page(request: Request):
    """渲染注册页面"""
    return templates.TemplateResponse("register.html", {"request": request})

# 单例预测页面路由
@app.get("/predictor/single")
async def single_predict_page(request: Request, current_user: User = Depends(get_current_user)):
    """渲染单例预测页面"""
    return templates.TemplateResponse("predictor/single_predict.html", {
        "request": request, 
        "username": current_user.username,
        "now": datetime.datetime.now() 
    })

# 批量预测页面路由（仅管理员可访问）
@app.get("/predictor/batch")
async def batch_predict_page(request: Request, current_user: User = Depends(get_current_user)):
    """渲染批量预测上传页面（仅管理员可访问）"""
    # 检查用户是否是管理员
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限访问批量预测功能"
        )
    return templates.TemplateResponse("predictor/batch_predict.html", { 
        "request": request, 
        "username": current_user.username,
        "now": datetime.datetime.now()
    })

# 批量预测结果页面路由（仅管理员可访问）
@app.get("/predictor/batch_results/{batch_id}")
async def batch_results_page(
    batch_id: str, 
    request: Request, 
    current_user: User = Depends(get_current_user)
):
    """渲染批量预测结果页面（仅管理员可访问）"""
    # 检查用户是否是管理员
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限访问批量预测结果"
        )
    # 检查结果文件是否存在
    result_filename = f"batch_{batch_id}_results.xlsx"
    result_filepath = predictor_service.BATCH_RESULTS_DIR / result_filename
    
    if not os.path.exists(result_filepath):
        # 结果文件不存在，返回错误
        return templates.TemplateResponse(
            "error.html", 
            {
                "request": request,
                "username": current_user.username,
                "error_message": "找不到指定的批量预测结果文件。"
            }, 
            status_code=404
        )
    
    try:
        # 使用pandas读取结果文件
        df_results = pd.read_excel(result_filepath)
        
        # 创建简单的结果对象
        results = {
            "batch_id": batch_id,
            "file_count": len(df_results),
            "download_url": f"/api/predictor/download_batch_results/{batch_id}"
        }
        
        # 渲染结果页面
        return templates.TemplateResponse(
            "predictor/batch_results.html", 
            {
                "request": request,
                "username": current_user.username,
                "results": results,
                "filename": result_filename,
                "now": datetime.datetime.now()
            }
        )
    except Exception as e:
        logger.error(f"处理批量预测结果页面时出错: {e}", exc_info=True)
        return templates.TemplateResponse(
            "error.html", 
            {
                "request": request,
                "username": current_user.username,
                "error_message": f"处理批量预测结果时出错: {str(e)}"
            }, 
            status_code=500
        )

# 医疗问答页面路由
@app.get("/medical-qa")
async def medical_qa_page(request: Request):
    """渲染医疗问答页面"""
    return templates.TemplateResponse("medical_qa.html", {"request": request})

# 数据看板页面路由（仅管理员可访问）
@app.get("/data-dashboard")
async def data_dashboard_page(request: Request, current_user: User = Depends(get_current_user)):
    """渲染数据看板页面（仅管理员可访问）"""
    # 检查用户是否是管理员
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限访问数据看板功能"
        )
    return templates.TemplateResponse("data_dashboard.html", {
        "request": request,
        "username": current_user.username
    })

# 设置页面路由
@app.get("/settings")
async def settings_page(request: Request, current_user: User = Depends(get_current_user)):
    """渲染设置页面"""
    return templates.TemplateResponse("settings.html", {
        "request": request,
        "username": current_user.username
    })

# 关于页面路由
@app.get("/about")
async def about_page(request: Request):
    """渲染关于页面"""
    return templates.TemplateResponse("about.html", {"request": request})

# 管理员页面路由
@app.get("/admin")
async def admin_page(request: Request, current_user: User = Depends(get_current_user)):
    """渲染管理员页面"""
    # 检查用户是否是管理员
    if not current_user.role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限"
        )
    return templates.TemplateResponse("admin.html", {
        "request": request,
        "username": current_user.username
    })

# 我的反馈页面路由
@app.get("/my-feedback")
async def my_feedback_page(request: Request, current_user: User = Depends(get_current_user)):
    """渲染我的反馈页面"""
    return templates.TemplateResponse("my_feedback.html", {
        "request": request,
        "username": current_user.username
    })

# API根路由
@app.get("/api")
async def api_root():
    """API根路由，返回API文档链接"""
    return {
        "message": "欢迎使用HAPI预测系统API",
        "documentation": "/docs",
        "version": "2.1.0"
    }

# 健康检查路由
@app.get("/health")
async def health_check():
    """健康检查路由"""
    return {"status": "healthy"}

if __name__ == "__main__":
    import sys
    from pathlib import Path
    # 将项目根目录添加到Python路径
    root_dir = str(Path(__file__).resolve().parent.parent.parent)
    if root_dir not in sys.path:
        sys.path.append(root_dir)
    
    import uvicorn
    uvicorn.run("Predict.app.main:app", host="127.0.0.1", port=8000, reload=True)
