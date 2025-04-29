from fastapi import APIRouter, Request, Depends, Form, HTTPException, status, UploadFile, File
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse, RedirectResponse, HTMLResponse
from typing import Dict, Any, Optional, List, Union
import datetime # 引入datetime
import os # for checking file existence
import uuid # For generating report ID
import json
import pandas as pd
import tempfile
import csv
from io import BytesIO
import logging
from sqlalchemy.orm import Session

# 导入服务和认证依赖
from Predict.app.services import predictor_service
from Predict.app.services.auth import get_current_user
from Predict.app.models.user import User  # 导入 User 模型用于类型提示
from Predict.app.services import auth
from Predict.app.services import db
from Predict.app.schemas.user import TokenData  # 修改导入路径，从schemas.user导入TokenData

# 导入模板引擎 (如果需要渲染页面)
from fastapi.templating import Jinja2Templates
from pathlib import Path
# 确保模板路径正确指向 app/templates
templates = Jinja2Templates(directory=str(Path(__file__).resolve().parent.parent / "templates"))

# Import schemas
from Predict.app.schemas import SinglePredictionRequest, SinglePredictionResponse, ErrorResponse
from pydantic import BaseModel  # 添加这行导入，供PredictionHistoryResponse使用

router = APIRouter()

# 获取可用模型列表的端点 (方便前端选择)
@router.get("/models", response_model=Dict[str, str])
async def get_models_list():
    """获取可用的预测模型列表。
    
    此接口不需要认证，允许任何用户获取可用的预测模型列表。
    """
    try:
        predictor_service.logger.info("接收到获取模型列表请求")
        available_models = predictor_service.get_available_models()
        
        if not available_models:
            predictor_service.logger.warning("没有可用的预测模型，请确认模型文件是否正确加载")
            # 返回空字典而不是抛出404错误，让前端能正确处理
            return {}
        
        # 记录找到的模型数量
        predictor_service.logger.info(f"找到可用模型：{available_models}")
        return available_models
    except Exception as e:
        predictor_service.logger.error(f"获取模型列表出错: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="获取模型列表时发生内部错误。")

# Single prediction API endpoint - MODIFIED to accept JSON payload
@router.post("/predict", 
             response_model=SinglePredictionResponse, 
             responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}})
async def run_single_prediction(
    payload: SinglePredictionRequest, # Accept Pydantic model as request body
    current_user: User = Depends(get_current_user)
):
    """Receives JSON data, executes single prediction, generates report, and returns results.

    Uses Pydantic model `SinglePredictionRequest` for input validation.
    """
    try:
        # Convert Pydantic model to dict, respecting aliases for field names
        # This format is expected by prepare_single_input
        form_data_raw = payload.dict(by_alias=True)  # 使用 dict() 而不是 model_dump() 兼容 Pydantic v1

        # 1. Prepare input data (applies mapping, encoding, sorting)
        input_df = predictor_service.prepare_single_input(form_data_raw)
        
        # 2. Execute prediction (gets all model results)
        prediction_result = predictor_service.predict_single(input_df)
        
        # 3. Generate PDF report and get path
        report_id = str(uuid.uuid4())
        # Pass the original raw form data (before encoding) to the report function for display
        report_filepath = predictor_service.generate_single_report(form_data_raw, prediction_result, report_id)

        # 保存预测记录到数据库
        try:
            # 转换当前用户为TokenData格式
            user_data = TokenData(
                sub=str(current_user.id), 
                username=current_user.username
            )
            
            # 调用保存预测历史的函数
            await save_single_prediction_history(
                user_data=user_data,
                input_data=form_data_raw,
                prediction_result=prediction_result,
                risk_level=prediction_result.get('risk_level', '未知')
            )
        except Exception as save_error:
            # 记录错误但不中断预测流程
            predictor_service.logger.error(f"保存预测历史记录时出错: {save_error}")

        # 4. Combine and return results (including report ID)
        return SinglePredictionResponse(
            success=True,
            predictions=prediction_result.get('predictions'),
            probabilities=prediction_result.get('probabilities'),
            risk_level=prediction_result.get('risk_level'),
            feature_contributions=prediction_result.get('feature_contributions'),
            report_id=report_id,
            download_report_url=f"/api/predictor/download_report/{report_id}",
            message="预测成功完成，报告已生成。"
        )

    except ValueError as ve:
        # Handle data validation/preparation errors
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except RuntimeError as re:
        # Handle prediction execution or report generation errors
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(re))
    except Exception as e:
        # Handle other unexpected errors
        predictor_service.logger.error(f"单例预测 API 出错: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="预测过程中发生内部错误。")

# 新增：下载单例预测报告的 API 端点
@router.get("/download_report/{report_id}")
async def download_single_report(report_id: str, current_user: User = Depends(get_current_user)):
    """根据报告 ID 下载对应的单例预测 PDF 报告。"""
    report_filename = f"report_{report_id}.pdf"
    report_filepath = predictor_service.REPORTS_DIR / report_filename

    if not os.path.exists(report_filepath):
        predictor_service.logger.warning(f"尝试下载不存在的报告: {report_filepath}")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="找不到指定的预测报告文件。")

    return FileResponse(
        path=report_filepath,
        filename=report_filename,
        media_type='application/pdf'
    )

# --- 批量预测 API --- 
@router.post("/batch_predict")
async def run_batch_prediction(
    request: Request,
    current_user: User = Depends(get_current_user),
    file: UploadFile = File(...)
):
    """接收上传的批量预测文件 (CSV/Excel)，使用所有可用模型执行预测并返回综合结果。"""
    predictor_service.logger.info(f"接收到批量预测请求，文件：{file.filename}, 文件大小：{file.size if hasattr(file, 'size') else '未知'}")
    predictor_service.logger.info(f"请求头：{dict(request.headers)}")
    
    if not file.filename.endswith(('.csv', '.xlsx', '.xls')):
        predictor_service.logger.warning(f"文件格式错误：{file.filename}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="文件格式错误，请上传 CSV 或 Excel 文件。")
            
    try:
        # 使用所有可用模型进行批量预测 (不再需要特定的model_key)
        predictor_service.logger.info("开始处理批量预测文件")
        batch_id, result_filepath = await predictor_service.process_batch_file_with_all_models(file)
        predictor_service.logger.info(f"批量预测处理完成，批次ID：{batch_id}, 结果路径：{result_filepath}")
        
        # 保存批量预测记录到数据库
        try:
            # 转换当前用户为TokenData格式
            user_data = TokenData(
                sub=str(current_user.id), 
                username=current_user.username
            )
            
            # 读取结果文件的内容
            if result_filepath.endswith('.xlsx'):
                results_df = pd.read_excel(result_filepath)
            else:
                results_df = pd.read_csv(result_filepath)
            
            # 保存每条预测记录
            for index, row in results_df.iterrows():
                row_dict = row.to_dict()
                # 分离输入数据和预测结果
                input_data = {k: v for k, v in row_dict.items() if k not in ['prediction', 'risk_level', 'probability']}
                prediction_result = {
                    "prediction": row_dict.get('prediction', None),
                    "risk_level": row_dict.get('risk_level', '未知'),
                    "probability": row_dict.get('probability', None)
                }
                
                # 保存到数据库
                await save_batch_prediction_history(
                    user_data=user_data,
                    batch_id=batch_id,
                    input_data=input_data,
                    prediction_result=prediction_result,
                    risk_level=row_dict.get('risk_level', '未知')
                )
        except Exception as save_error:
            # 记录错误但不中断预测流程
            predictor_service.logger.error(f"保存批量预测历史记录时出错: {save_error}")
        
        # 检查Accept头
        accept_header = request.headers.get("accept", "").lower()
        predictor_service.logger.info(f"客户端接受的响应类型：{accept_header}")
        
        # 根据接受类型返回不同的响应
        if "text/html" in accept_header:
            # 如果客户端接受HTML响应，重定向到批量预测结果页面
            redirect_url = f"/predictor/batch_results/{batch_id}"
            predictor_service.logger.info(f"客户端请求HTML响应，重定向到：{redirect_url}")
            return RedirectResponse(
                url=redirect_url,
                status_code=status.HTTP_303_SEE_OTHER
            )
        else:
            # 如果客户端接受JSON，或没有指定，返回JSON响应
            predictor_service.logger.info(f"客户端请求JSON响应或未指定，返回JSON结果")
            json_response = {
                "success": True,
                "message": f"批量预测任务 {batch_id} 处理完成。",
                "batch_id": batch_id,
                "download_url": f"/api/predictor/download_batch_results/{batch_id}"
            }
            predictor_service.logger.info(f"返回JSON响应：{json_response}")
            return JSONResponse(
                content=json_response,
                media_type="application/json; charset=utf-8"
            )
    except ValueError as ve:
        predictor_service.logger.error(f"处理批量预测文件时发生值错误: {ve}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"处理文件失败: {str(ve)}")
    except RuntimeError as re:
        predictor_service.logger.error(f"批量预测执行失败: {re}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"预测执行失败: {str(re)}")
    except Exception as e:
        predictor_service.logger.error(f"批量预测 API 出错: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="处理批量预测时发生内部错误。")

@router.get("/download_batch_results/{batch_id}")
async def download_batch_results(batch_id: str, current_user: User = Depends(get_current_user)):
    """根据批处理 ID 下载对应的结果文件。"""
    result_filename = f"batch_{batch_id}_results.xlsx"
    result_filepath = predictor_service.BATCH_RESULTS_DIR / result_filename

    if not os.path.exists(result_filepath):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="找不到指定的批量预测结果文件。")

    return FileResponse(
        path=result_filepath,
        filename=result_filename,
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )

@router.get("/download_template")
async def download_template(current_user: User = Depends(get_current_user)):
    """下载批量预测的 CSV 模板文件。"""
    try:
        template_bytes = predictor_service.generate_template_file()
        return StreamingResponse(
            content=template_bytes,
            media_type="text/csv; charset=utf-8-sig",  # 添加UTF-8 BOM确保Excel正确识别中文
            headers={
                "Content-Disposition": "attachment; filename=batch_prediction_template.csv",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        predictor_service.logger.error(f"生成模板文件时出错: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="生成模板文件时发生错误。")

# --- 页面路由 (REMOVED FROM HERE) ---
# @router.get("/single") ... 
# @router.get("/single-form") ...
# @router.get("/batch") ...

# --- PDF 报告下载路由 (待实现) ---
# @router.get("/download_report/{some_identifier}")
# async def download_single_report(some_identifier: str, current_user: User = Depends(get_current_user)):
#    # 需要确定如何标识报告，可能基于预测 ID 或临时文件名
#    # 调用 predictor_service.generate_single_report(...)
#    # 返回 StreamingResponse 或 FileResponse
#    pass 

# 添加保存预测历史记录的函数
async def save_single_prediction_history(user_data: TokenData, input_data: dict, prediction_result: dict, risk_level: str):
    """保存单例预测历史记录"""
    try:
        if user_data:
            await db.save_prediction_history(
                user_id=user_data.sub,
                username=user_data.username,
                prediction_type="single",
                input_data=input_data,
                prediction_result=prediction_result,
                risk_level=risk_level
            )
    except Exception as e:
        print(f"保存预测历史记录时出错: {e}")
        # 不抛出异常，继续处理预测结果

async def save_batch_prediction_history(user_data: TokenData, batch_id: str, input_data: dict, prediction_result: dict, risk_level: str):
    """保存批量预测历史记录"""
    try:
        if user_data:
            await db.save_prediction_history(
                user_id=user_data.sub,
                username=user_data.username,
                prediction_type="batch",
                batch_id=batch_id,
                input_data=input_data,
                prediction_result=prediction_result,
                risk_level=risk_level
            )
    except Exception as e:
        print(f"保存批量预测历史记录时出错: {e}")
        # 不抛出异常，继续处理预测结果

# 添加获取预测历史记录的接口
class PredictionHistoryResponse(BaseModel):
    id: int
    prediction_type: str
    input_data: dict
    prediction_result: dict
    risk_level: str
    created_at: str
    batch_id: Optional[str] = None

@router.get("/history", response_model=List[PredictionHistoryResponse])
async def get_prediction_history(current_user: TokenData = Depends(auth.get_current_user), limit: int = 10):
    """获取用户的预测历史记录"""
    try:
        history_results = await db.get_prediction_history(user_id=current_user.sub, limit=limit)
        
        # 处理结果格式
        history_list = []
        for history in history_results:
            history_dict = {
                "id": history.id,
                "prediction_type": history.prediction_type,
                "input_data": json.loads(history.input_data) if isinstance(history.input_data, str) else history.input_data,
                "prediction_result": json.loads(history.prediction_result) if isinstance(history.prediction_result, str) else history.prediction_result,
                "risk_level": history.risk_level,
                "created_at": history.created_at.strftime("%Y-%m-%d %H:%M:%S") if hasattr(history.created_at, "strftime") else str(history.created_at),
                "batch_id": history.batch_id
            }
            history_list.append(history_dict)
        
        return history_list
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取预测历史记录时出错: {str(e)}"
        )

# 修改现有的单例预测API，添加保存历史记录的功能
@router.post("/predict")
async def run_prediction(request: Request, current_user: Optional[TokenData] = Depends(auth.get_current_user_optional)):
    """运行单例预测"""
    try:
        form_data = await request.form()
        input_data = {key: value for key, value in form_data.items()}
        
        # 调用预测服务
        result = predictor_service.run_prediction(input_data)
        
        # 保存预测历史记录
        if current_user:
            await save_single_prediction_history(
                user_data=current_user,
                input_data=input_data,
                prediction_result=result,
                risk_level=result.get("risk_level", "未知")
            )
        
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"预测过程中出错: {str(e)}"
        )

# 修改现有的批量预测API，添加保存历史记录的功能
@router.post("/batch_predict")
async def run_batch_prediction(file: UploadFile = File(...), current_user: Optional[TokenData] = Depends(auth.get_current_user_optional)):
    """运行批量预测"""
    try:
        # 保存上传的文件到临时目录
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as temp_file:
            temp_file.write(await file.read())
            temp_file_path = temp_file.name
        
        # 生成批次ID
        batch_id = f"batch_{uuid.uuid4().hex[:8]}_{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        # 调用批量预测服务
        result = predictor_service.process_batch_file(temp_file_path, batch_id)
        
        # 保存预测历史记录
        if current_user and result.get("success") and result.get("data"):
            # 对于批量预测，我们保存每条记录的预测结果
            for idx, row in enumerate(result["data"]):
                input_data = {k: v for k, v in row.items() if k not in ["prediction", "risk_level", "probability"]}
                prediction_result = {
                    "prediction": row.get("prediction", None),
                    "risk_level": row.get("risk_level", "未知"),
                    "probability": row.get("probability", None)
                }
                
                await save_batch_prediction_history(
                    user_data=current_user,
                    batch_id=batch_id,
                    input_data=input_data,
                    prediction_result=prediction_result,
                    risk_level=row.get("risk_level", "未知")
                )
        
        # 清理临时文件
        if os.path.exists(temp_file_path):
            os.unlink(temp_file_path)
        
        return {
            "success": result.get("success", False),
            "batch_id": batch_id,
            "message": result.get("message", ""),
            "download_url": f"/api/predictor/download_batch_results/{batch_id}" if result.get("success") else None
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"批量预测过程中出错: {str(e)}"
        ) 