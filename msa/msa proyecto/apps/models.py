from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum

class CacaoType(str, Enum):
    TRINITARIO = "Trinitario"
    FORASTERO = "Forastero"
    CRIOLLO = "Criollo"
    NACIONAL = "Nacional"

class Quality(str, Enum):
    PREMIUM = "Premium"
    ESTANDAR = "Estándar"
    SEGUNDA = "Segunda"

class ProductionRecord(BaseModel):
    id: Optional[str] = None
    date: datetime
    parcel: str
    cacao_type: CacaoType
    quantity: float = Field(..., gt=0, description="Cantidad en kilogramos")
    quality: Quality
    humidity: float = Field(..., ge=0, le=100, description="Humedad en porcentaje")
    price: float = Field(..., gt=0, description="Precio por kilogramo")
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class ProductionRecordCreate(BaseModel):
    date: datetime
    parcel: str
    cacao_type: CacaoType
    quantity: float = Field(..., gt=0)
    quality: Quality
    humidity: float = Field(..., ge=0, le=100)
    price: float = Field(..., gt=0)
    notes: Optional[str] = None

class ProductionRecordUpdate(BaseModel):
    date: Optional[datetime] = None
    parcel: Optional[str] = None
    cacao_type: Optional[CacaoType] = None
    quantity: Optional[float] = Field(None, gt=0)
    quality: Optional[Quality] = None
    humidity: Optional[float] = Field(None, ge=0, le=100)
    price: Optional[float] = Field(None, gt=0)
    notes: Optional[str] = None

class Parcel(BaseModel):
    id: Optional[str] = None
    name: str
    area: float = Field(..., gt=0, description="Área en hectáreas")
    location: Optional[str] = None
    main_variety: CacaoType
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class ParcelCreate(BaseModel):
    name: str
    area: float = Field(..., gt=0)
    location: Optional[str] = None
    main_variety: CacaoType

class ProductionStats(BaseModel):
    total_production: float
    total_revenue: float
    average_price: float
    premium_quality_percentage: float
    monthly_production: List[dict]
    parcel_production: List[dict]
    cacao_type_distribution: List[dict]

class PredictionRequest(BaseModel):
    hours_to_predict: int = Field(..., gt=0, le=168, description="Horas a predecir (máximo 7 días)")
    include_graph: bool = False

class PredictionResponse(BaseModel):
    predictions: List[dict]
    graph_data: Optional[str] = None 