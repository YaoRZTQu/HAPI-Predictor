from pydantic import BaseModel, Field
from typing import Optional, Any

class SinglePredictionRequest(BaseModel):
    # Based on main2.js formData collection
    # Note: '年龄' field was in the target template/JS but not in EXPECTED_FEATURES
    # Let's include it for now, but it won't be used by the current service logic.
    age: Optional[int] = Field(None, alias="年龄", ge=0, le=120)
    
    住院第几天: float = Field(..., ge=1)
    白细胞计数: float
    血钾浓度: float
    白蛋白计数: float
    吸烟史: str
    # Use alias for fields with slashes or other special characters
    friction_shear: str = Field(..., alias="摩擦力/剪切力") 
    移动能力: str
    感知觉: str
    身体活动度: str
    日常食物获取: str
    水肿: str
    皮肤潮湿: str
    意识障碍: str
    高血压: str
    糖尿病: str
    冠心病: str
    thrombosis: str = Field(..., alias="下肢深静脉血栓")

class PredictionResponseDetail(BaseModel):
    # Structure for individual model predictions
    # Assuming keys are model strings, values are Optional[int/float]
    pass # Define more strictly if needed, e.g., Dict[str, Optional[int]]

class SinglePredictionResponse(BaseModel):
    success: bool
    # predictions: Optional[Dict[str, Optional[int]]] # Using Any temporarily
    # probabilities: Optional[Dict[str, Optional[float]]]
    # feature_contributions: Optional[Dict[str, float]]
    predictions: Optional[Any] = None
    probabilities: Optional[Any] = None
    feature_contributions: Optional[Any] = None
    risk_level: Optional[str] = None
    report_id: Optional[str] = None
    download_report_url: Optional[str] = None
    message: str

class ErrorResponse(BaseModel):
    detail: str