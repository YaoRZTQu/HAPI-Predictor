from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from typing import List, Dict, Any, Optional
import datetime
import random
import os
import psutil
from sqlalchemy import func, distinct
from sqlalchemy.orm import Session
from datetime import timedelta

from Predict.app.services import auth
from Predict.app.schemas.user import TokenData
from Predict.app.services import db
from Predict.app.services import predictor_service
from Predict.app.services.db import get_db
from Predict.app.models.user import User
from Predict.app.models.chat_history import ChatHistory, ChatMessage

router = APIRouter(prefix="/api/data-dashboard", tags=["data_dashboard"])

@router.get("/stats")
async def get_dashboard_stats(current_user: TokenData = Depends(auth.get_current_user)):
    """获取数据看板统计数据"""
    try:
        # 获取预测总次数
        prediction_count = await db.get_prediction_count()
        
        # 获取可用模型数量
        available_models = predictor_service.get_available_models()
        models_count = len(available_models)
        
        # 获取问答统计
        # 这里需要直接使用数据库查询获取问答总数
        db_session = next(get_db())
        qa_count = db_session.query(func.count(distinct(ChatHistory.id))).scalar() or 0
        
        # 获取活跃用户数
        users_count = db_session.query(func.count(distinct(User.id))).scalar() or 0
        
        # 获取真实系统性能指标
        try:
            process = psutil.Process(os.getpid())
            
            # CPU使用率 - 保留两位小数
            cpu_usage = round(psutil.cpu_percent(interval=0.1), 2)
            
            # 内存使用率 - 保留两位小数
            # 使用系统全局内存使用率，而不是单个进程
            memory = psutil.virtual_memory()
            memory_usage = round(memory.percent, 2)
            
            # 磁盘使用率 - 保留两位小数
            # 使用应用程序所在目录的磁盘使用情况
            app_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
            disk_usage = round(psutil.disk_usage(app_dir).percent, 2)
            
            # 响应时间 - 模拟值，实际应该通过监控系统获取
            # 单位为毫秒，保留整数
            response_time = 120  # 120ms，一个合理的默认值
        except Exception as e:
            # 如果获取系统指标出错，使用默认值
            cpu_usage = 0.0
            memory_usage = 0.0
            disk_usage = 0.0
            response_time = 0
            print(f"获取系统性能指标时出错: {str(e)}")
        
        # 返回结果
        return {
            "predictions_count": prediction_count,
            "models_count": models_count,
            "qa_count": qa_count,
            "users_count": users_count,
            
            # 系统性能指标
            "system_performance": {
                "cpu_usage": cpu_usage,
                "memory_usage": memory_usage,
                "disk_usage": disk_usage,
                "response_time": response_time
            }
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取统计数据时出错: {str(e)}"
        )

@router.get("/prediction-trend")
async def get_prediction_trend(days: int = 7, current_user: TokenData = Depends(auth.get_current_user)):
    """获取预测趋势数据"""
    try:
        # 获取数据库中的预测趋势
        db_trend = await db.get_prediction_trend(days)
        
        # 准备日期列表（过去days天）
        today = datetime.datetime.now().date()
        date_list = [(today - datetime.timedelta(days=i)).strftime("%Y-%m-%d") for i in range(days-1, -1, -1)]
        
        # 整理数据
        single_prediction_data = {date: 0 for date in date_list}
        batch_prediction_data = {date: 0 for date in date_list}
        
        # 填充实际数据
        for record in db_trend:
            date_str = record.date.strftime("%Y-%m-%d") if hasattr(record.date, "strftime") else str(record.date)
            if date_str in date_list:
                if record.prediction_type == "single":
                    single_prediction_data[date_str] = record.count
                elif record.prediction_type == "batch":
                    batch_prediction_data[date_str] = record.count
        
        # 返回结果
        return {
            "dates": date_list,
            "single_prediction": list(single_prediction_data.values()),
            "batch_prediction": list(batch_prediction_data.values())
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取预测趋势数据时出错: {str(e)}"
        )

@router.get("/recent-predictions")
async def get_recent_predictions(limit: int = 5, current_user: TokenData = Depends(auth.get_current_user)):
    """获取最近的预测记录"""
    try:
        # 获取最近的预测记录
        recent_predictions = await db.get_prediction_history(limit=limit)
        
        # 格式化结果
        result = []
        for prediction in recent_predictions:
            prediction_dict = {
                "id": prediction.id,
                "username": prediction.username,
                "prediction_type": prediction.prediction_type,
                "risk_level": prediction.risk_level,
                "created_at": prediction.created_at.strftime("%Y-%m-%d %H:%M:%S") if hasattr(prediction.created_at, "strftime") else str(prediction.created_at)
            }
            result.append(prediction_dict)
        
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取最近预测记录时出错: {str(e)}"
        )

@router.get("/qa-trend")
async def get_qa_trend(days: int = 7, current_user: TokenData = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    """获取问答趋势数据"""
    try:
        # 准备日期列表（过去days天）
        today = datetime.datetime.now().date()
        date_list = [(today - datetime.timedelta(days=i)).strftime("%Y-%m-%d") for i in range(days-1, -1, -1)]
        
        # 整理数据
        qa_trend = []
        
        # 获取每天的问答数据
        for date_str in date_list:
            date_obj = datetime.datetime.strptime(date_str, "%Y-%m-%d")
            day_start = date_obj.replace(hour=0, minute=0, second=0, microsecond=0)
            day_end = day_start + datetime.timedelta(days=1)
            
            # 计算当天的问答记录数
            daily_count = db.query(func.count(distinct(ChatHistory.id))).filter(
                ChatHistory.created_at >= day_start,
                ChatHistory.created_at < day_end
            ).scalar() or 0
            
            qa_trend.append({"date": date_str, "count": daily_count})
        
        # 提取日期和计数
        dates = [item["date"] for item in qa_trend]
        counts = [item["count"] for item in qa_trend]
        
        # 返回结果
        return {
            "dates": dates,
            "counts": counts
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取问答趋势数据时出错: {str(e)}"
        )

@router.get("/recent-qa")
async def get_recent_qa(limit: int = 5, current_user: TokenData = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    """获取最近的问答记录"""
    try:
        # 从数据库中查询最近的问答记录
        # 先查询用户问题消息
        user_messages = db.query(ChatMessage).filter(
            ChatMessage.is_user == True
        ).order_by(
            ChatMessage.created_at.desc()
        ).limit(limit).all()
        
        qa_records = []
        for msg in user_messages:
            # 获取此消息所属的ChatHistory
            chat_history = db.query(ChatHistory).filter(
                ChatHistory.id == msg.chat_history_id
            ).first()
            
            if chat_history:
                # 获取用户信息
                user = db.query(User).filter(
                    User.id == chat_history.user_id
                ).first()
                
                username = user.username if user else "未知用户"
                
                qa_records.append({
                    "conversation_id": msg.chat_history_id,
                    "id": msg.id,
                    "user": username,
                    "question": msg.content,
                    "timestamp": msg.created_at.isoformat() if hasattr(msg.created_at, 'isoformat') else str(msg.created_at)
                })
        
        return {
            "qa_records": qa_records
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取最近问答记录时出错: {str(e)}"
        )

@router.get("/prediction/{prediction_id}")
async def get_prediction_detail(prediction_id: str, current_user: TokenData = Depends(auth.get_current_user)):
    """获取预测详情"""
    try:
        # 尝试获取所有预测历史记录
        all_predictions = await db.get_prediction_history(limit=1000)
        
        # 从历史记录中查找匹配ID的预测
        prediction = None
        for p in all_predictions:
            if str(p.id) == prediction_id:
                prediction = p
                break
        
        if prediction:
            # 使用实际预测记录的数据
            return {
                "id": str(prediction.id),
                "user": prediction.username,
                "model": prediction.model_used if hasattr(prediction, 'model_used') else "Unknown",
                "timestamp": prediction.created_at.isoformat() if hasattr(prediction.created_at, 'isoformat') else str(prediction.created_at),
                "risk_level": prediction.risk_level,
                "input_data": prediction.input_data if hasattr(prediction, 'input_data') else {},
                "results": prediction.results if hasattr(prediction, 'results') else {
                    "unknown_model": {
                        "prediction": "未知",
                        "probability": 0.0
                    }
                }
            }
        else:
            # 注意: 目前数据库服务没有实现通过ID查询单个预测记录的方法
            # 这里返回一个空对象表示找不到记录
            return {
                "id": prediction_id,
                "user": "",
                "model": "",
                "timestamp": "",
                "risk_level": "",
                "input_data": {},
                "results": {}
            }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取预测详情时出错: {str(e)}"
        )

@router.get("/conversation/{conversation_id}")
async def get_conversation_detail(conversation_id: str, current_user: TokenData = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    """获取对话详情"""
    try:
        # 将conversation_id转换为整数
        try:
            chat_history_id = int(conversation_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="对话ID必须是整数")
        
        # 查询聊天历史
        chat_history = db.query(ChatHistory).filter(
            ChatHistory.id == chat_history_id
        ).first()
        
        if not chat_history:
            raise HTTPException(status_code=404, detail="未找到指定的对话记录")
        
        # 获取用户信息
        user = db.query(User).filter(User.id == chat_history.user_id).first()
        username = user.username if user else "未知用户"
        
        # 获取对话消息
        messages = db.query(ChatMessage).filter(
            ChatMessage.chat_history_id == chat_history_id
        ).order_by(
            ChatMessage.sequence
        ).all()
        
        # 格式化消息
        formatted_messages = []
        for msg in messages:
            formatted_messages.append({
                "role": "user" if msg.is_user else "system",
                "content": msg.content,
                "timestamp": msg.created_at.isoformat() if hasattr(msg.created_at, 'isoformat') else str(msg.created_at)
            })
        
        return {
            "id": chat_history_id,
            "user": username,
            "timestamp": chat_history.created_at.isoformat() if hasattr(chat_history.created_at, 'isoformat') else str(chat_history.created_at),
            "messages": formatted_messages
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取对话详情时出错: {str(e)}"
        ) 