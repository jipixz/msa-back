from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from bson import ObjectId
import pandas as pd
from database import db_manager
from models import ProductionRecord, ProductionRecordCreate, ProductionRecordUpdate, Parcel, ParcelCreate, ProductionStats

class ProductionService:
    def __init__(self):
        self.production_collection = db_manager.get_production_collection()
        self.parcels_collection = db_manager.get_parcels_collection()
    
    def create_production_record(self, record: ProductionRecordCreate) -> ProductionRecord:
        """Crear un nuevo registro de producción"""
        record_data = record.dict()
        record_data["created_at"] = datetime.utcnow()
        record_data["updated_at"] = datetime.utcnow()
        
        result = self.production_collection.insert_one(record_data)
        record_data["id"] = str(result.inserted_id)
        
        return ProductionRecord(**record_data)
    
    def get_production_records(
        self, 
        skip: int = 0, 
        limit: int = 100,
        parcel: Optional[str] = None,
        cacao_type: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[ProductionRecord]:
        """Obtener registros de producción con filtros opcionales"""
        filter_query = {}
        
        if parcel:
            filter_query["parcel"] = parcel
        if cacao_type:
            filter_query["cacao_type"] = cacao_type
        if start_date or end_date:
            date_filter = {}
            if start_date:
                date_filter["$gte"] = start_date
            if end_date:
                date_filter["$lte"] = end_date
            filter_query["date"] = date_filter
        
        cursor = self.production_collection.find(filter_query).skip(skip).limit(limit).sort("date", -1)
        records = []
        
        for doc in cursor:
            doc["id"] = str(doc.pop("_id"))
            records.append(ProductionRecord(**doc))
        
        return records
    
    def get_production_record_by_id(self, record_id: str) -> Optional[ProductionRecord]:
        """Obtener un registro de producción por ID"""
        try:
            doc = self.production_collection.find_one({"_id": ObjectId(record_id)})
            if doc:
                doc["id"] = str(doc.pop("_id"))
                return ProductionRecord(**doc)
        except:
            pass
        return None
    
    def update_production_record(self, record_id: str, update_data: ProductionRecordUpdate) -> Optional[ProductionRecord]:
        """Actualizar un registro de producción"""
        update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
        update_dict["updated_at"] = datetime.utcnow()
        
        try:
            result = self.production_collection.update_one(
                {"_id": ObjectId(record_id)},
                {"$set": update_dict}
            )
            
            if result.modified_count > 0:
                return self.get_production_record_by_id(record_id)
        except:
            pass
        return None
    
    def delete_production_record(self, record_id: str) -> bool:
        """Eliminar un registro de producción"""
        try:
            result = self.production_collection.delete_one({"_id": ObjectId(record_id)})
            return result.deleted_count > 0
        except:
            return False
    
    def create_parcel(self, parcel: ParcelCreate) -> Parcel:
        """Crear una nueva parcela"""
        parcel_data = parcel.dict()
        parcel_data["created_at"] = datetime.utcnow()
        parcel_data["updated_at"] = datetime.utcnow()
        
        result = self.parcels_collection.insert_one(parcel_data)
        parcel_data["id"] = str(result.inserted_id)
        
        return Parcel(**parcel_data)
    
    def get_parcels(self) -> List[Parcel]:
        """Obtener todas las parcelas"""
        cursor = self.parcels_collection.find().sort("name")
        parcels = []
        
        for doc in cursor:
            doc["id"] = str(doc.pop("_id"))
            parcels.append(Parcel(**doc))
        
        return parcels
    
    def get_production_stats(self, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None) -> ProductionStats:
        """Obtener estadísticas de producción"""
        # Filtro de fechas
        date_filter = {}
        if start_date or end_date:
            if start_date:
                date_filter["$gte"] = start_date
            if end_date:
                date_filter["$lte"] = end_date
        
        # Obtener registros
        filter_query = {"date": date_filter} if date_filter else {}
        records = list(self.production_collection.find(filter_query))
        
        if not records:
            # Retornar estadísticas vacías
            return ProductionStats(
                total_production=0,
                total_revenue=0,
                average_price=0,
                premium_quality_percentage=0,
                monthly_production=[],
                parcel_production=[],
                cacao_type_distribution=[]
            )
        
        # Convertir a DataFrame para análisis
        df = pd.DataFrame(records)
        df["date"] = pd.to_datetime(df["date"])
        
        # Estadísticas básicas
        total_production = df["quantity"].sum()
        total_revenue = (df["quantity"] * df["price"]).sum()
        average_price = total_revenue / total_production if total_production > 0 else 0
        premium_quality_percentage = (df["quality"] == "Premium").mean() * 100
        
        # Producción mensual
        df_monthly = df.groupby(df["date"].dt.to_period("M")).agg({
            "quantity": "sum",
            "price": "mean"
        }).reset_index()
        
        monthly_production = []
        for _, row in df_monthly.iterrows():
            monthly_production.append({
                "month": row["date"].strftime("%Y-%m"),
                "quantity": float(row["quantity"]),
                "revenue": float(row["quantity"] * row["price"])
            })
        
        # Producción por parcela
        parcel_production = df.groupby("parcel")["quantity"].sum().reset_index()
        parcel_production_list = []
        colors = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"]
        
        for i, (_, row) in enumerate(parcel_production.iterrows()):
            parcel_production_list.append({
                "name": row["parcel"],
                "value": float(row["quantity"]),
                "color": colors[i % len(colors)]
            })
        
        # Distribución por tipo de cacao
        cacao_distribution = df.groupby("cacao_type").size().reset_index(name="count")
        total_records = len(df)
        cacao_distribution_list = []
        colors = ["#8b5cf6", "#06b6d4", "#f97316", "#84cc16"]
        
        for i, (_, row) in enumerate(cacao_distribution.iterrows()):
            percentage = (row["count"] / total_records) * 100
            cacao_distribution_list.append({
                "name": row["cacao_type"],
                "value": float(percentage),
                "color": colors[i % len(colors)]
            })
        
        return ProductionStats(
            total_production=float(total_production),
            total_revenue=float(total_revenue),
            average_price=float(average_price),
            premium_quality_percentage=float(premium_quality_percentage),
            monthly_production=monthly_production,
            parcel_production=parcel_production_list,
            cacao_type_distribution=cacao_distribution_list
        )

# Instancia global del servicio
production_service = ProductionService() 