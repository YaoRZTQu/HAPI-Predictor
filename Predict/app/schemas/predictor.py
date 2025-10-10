from pydantic import BaseModel, Field
from typing import Optional, Any

class SinglePredictionRequest(BaseModel):
    # {{ AURA-X: Modify - 将所有字段改为使用alias接收英文字段名，保持内部使用英文字段名 }}
    # Note: Age field is optional, not used in model prediction
    age: Optional[int] = Field(None, alias="Age", ge=0, le=120)
    
    # 数值型字段 - 使用英文字段名作为alias
    length_of_hospitalization: float = Field(..., alias="Length of hospitalization", ge=1)
    white_blood_cells: float = Field(..., alias="White blood cells")
    serum_potassium: float = Field(..., alias="Serum potassium")
    albumin: float = Field(..., alias="Albumin")
    
    # 分类型字段 - 使用英文字段名作为alias
    smoking_history: str = Field(..., alias="Smoking history")
    friction_shear: str = Field(..., alias="Friction or shear")
    mobility: str = Field(..., alias="Mobility")
    sensation: str = Field(..., alias="Sensation")
    physical_activity: str = Field(..., alias="Physical activity")
    daily_food_intake: str = Field(..., alias="Daily food intake")
    edema: str = Field(..., alias="Edema")
    moist_skin: str = Field(..., alias="Moist skin")
    consciousness: str = Field(..., alias="Consciousness")
    
    # 基础疾病字段 - 使用英文字段名作为alias
    hypertension: str = Field(..., alias="Hypertension")
    diabetes_mellitus: str = Field(..., alias="Diabetes mellitus")
    coronary_heart_disease: str = Field(..., alias="Coronary heart disease")
    deep_vein_thrombosis: str = Field(..., alias="Deep vein thrombosis")
    
    # {{ AURA-X: Add - 配置Pydantic v1使用alias进行序列化/反序列化 }}
    class Config:
        # 允许通过alias或字段名填充字段 (Pydantic v1)
        allow_population_by_field_name = True

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