from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from sshtunnel import SSHTunnelForwarder
from pymongo import MongoClient
import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression
import os
import traceback
import io
import base64
import matplotlib.pyplot as plt
from datetime import datetime, timedelta
from typing import List, Optional

# Importar nuestros nuevos módulos
from models import (
    ProductionRecord, ProductionRecordCreate, ProductionRecordUpdate,
    Parcel, ParcelCreate, ProductionStats, PredictionRequest
)
from production_service import production_service
from prediction_service import prediction_service

# Cargar variables desde datos.env
load_dotenv("datos.env")

app = FastAPI(title="MSA API", description="API para Monitoreo de Sensores Agrícolas")

# Configurar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción, especificar los dominios permitidos
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Modelo para entrada de predicción (mantener compatibilidad)
class EntradaPrediccion(BaseModel):
    horas_a_predecir: int
    graficar: bool = False

# Función para conectarse y obtener los datos (mantener compatibilidad)
def obtener_datos(eliminar_id=True):
    try:
        ssh_host = os.getenv("SSH_HOST")
        ssh_port = int(os.getenv("SSH_PORT"))
        ssh_user = os.getenv("SSH_USER")
        ssh_password = os.getenv("SSH_PASSWORD")
        remote_bind_host = os.getenv("REMOTE_BIND_HOST")
        remote_bind_port = int(os.getenv("REMOTE_BIND_PORT"))
        local_bind_port = int(os.getenv("LOCAL_BIND_PORT"))
        mongo_db = os.getenv("MONGO_DB")
        mongo_collection = os.getenv("MONGO_COLLECTION")
        limite = int(os.getenv("LIMIT_DOCUMENTOS", 100))

        if not all([ssh_host, ssh_user, ssh_password, mongo_db, mongo_collection]):
            raise ValueError("Faltan variables de entorno necesarias.")

        with SSHTunnelForwarder(
            (ssh_host, ssh_port),
            ssh_username=ssh_user,
            ssh_password=ssh_password,
            remote_bind_address=(remote_bind_host, remote_bind_port),
            local_bind_address=('localhost', local_bind_port)
        ) as tunnel:

            client = MongoClient(f"mongodb://localhost:{local_bind_port}")
            db = client[mongo_db]
            collection = db[mongo_collection]

            datos = list(collection.find().limit(limite))
            df = pd.DataFrame(datos)

            if eliminar_id and "_id" in df.columns:
                df.drop(columns=["_id"], inplace=True)

            return df

    except Exception as e:
        print("Error al conectarse a MongoDB:")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Error de conexión a la base de datos.")

# --- Rutas existentes (mantener compatibilidad) ---
@app.get("/get_datos")
def get_datos():
    try:
        df = obtener_datos(eliminar_id=False)
        if df.empty:
            raise HTTPException(status_code=404, detail="No se encontraron datos.")
        
        if "_id" in df.columns:
            df["_id"] = df["_id"].astype(str)

        return df.to_dict(orient="records")

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error al obtener datos: {str(e)}")

@app.post("/predecir")
def predecir(data: EntradaPrediccion):
    try:
        df = obtener_datos(eliminar_id=True)
        if df.empty:
            raise HTTPException(status_code=500, detail="No se pudieron obtener datos.")

        if "fecha" not in df.columns or "valor" not in df.columns:
            raise HTTPException(status_code=500, detail="Columnas 'fecha' o 'valor' no encontradas.")

        df["fecha"] = pd.to_datetime(df["fecha"], errors="coerce")
        df = df.dropna(subset=["fecha", "valor"])
        df = df.set_index("fecha")
        df = df.resample("H").mean()
        df = df.dropna(subset=["valor"])
        df["hora"] = np.arange(len(df))
        X = df[["hora"]]
        y = df["valor"]

        modelo = LinearRegression()
        modelo.fit(X, y)

        horas_a_predecir = data.horas_a_predecir
        if horas_a_predecir <= 0:
            raise HTTPException(status_code=400, detail="horas_a_predecir debe ser mayor que 0.")

        horas_futuras = np.arange(len(df), len(df) + horas_a_predecir).reshape(-1, 1)
        predicciones = modelo.predict(horas_futuras)

        resultados = [
            {"hora_futura": int(hora), "prediccion_valor": float(pred)}
            for hora, pred in zip(horas_futuras.flatten(), predicciones)
        ]

        respuesta = {"predicciones": resultados}

        if data.graficar:
            plt.figure(figsize=(10, 5))
            plt.plot(df.index, y, label="Datos históricos")
            fechas_futuras = pd.date_range(start=df.index[-1], periods=horas_a_predecir + 1, freq="H")[1:]
            plt.plot(fechas_futuras, predicciones, label="Predicción", linestyle="--")
            plt.title("Predicción de valores")
            plt.xlabel("Fecha")
            plt.ylabel("Valor")
            plt.legend()
            plt.grid(True)

            buffer = io.BytesIO()
            plt.savefig(buffer, format="png")
            buffer.seek(0)
            imagen_base64 = base64.b64encode(buffer.read()).decode("utf-8")
            buffer.close()
            plt.close()

            respuesta["grafica"] = imagen_base64

        return respuesta

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error en la predicción: {str(e)}")

# --- Nuevas rutas de producción ---
@app.post("/production/records", response_model=ProductionRecord)
async def create_production_record(record: ProductionRecordCreate):
    """Crear un nuevo registro de producción"""
    try:
        return production_service.create_production_record(record)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/production/records", response_model=List[ProductionRecord])
async def get_production_records(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    parcel: Optional[str] = None,
    cacao_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """Obtener registros de producción con filtros opcionales"""
    try:
        # Convertir fechas si se proporcionan
        start_dt = None
        end_dt = None
        if start_date:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        if end_date:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
        
        return production_service.get_production_records(
            skip=skip,
            limit=limit,
            parcel=parcel,
            cacao_type=cacao_type,
            start_date=start_dt,
            end_date=end_dt
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/production/records/{record_id}", response_model=ProductionRecord)
async def get_production_record(record_id: str):
    """Obtener un registro de producción por ID"""
    try:
        record = production_service.get_production_record_by_id(record_id)
        if not record:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        return record
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/production/records/{record_id}", response_model=ProductionRecord)
async def update_production_record(record_id: str, update_data: ProductionRecordUpdate):
    """Actualizar un registro de producción"""
    try:
        record = production_service.update_production_record(record_id, update_data)
        if not record:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        return record
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/production/records/{record_id}")
async def delete_production_record(record_id: str):
    """Eliminar un registro de producción"""
    try:
        success = production_service.delete_production_record(record_id)
        if not success:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        return {"message": "Registro eliminado exitosamente"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/production/parcels", response_model=Parcel)
async def create_parcel(parcel: ParcelCreate):
    """Crear una nueva parcela"""
    try:
        return production_service.create_parcel(parcel)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/production/parcels", response_model=List[Parcel])
async def get_parcels():
    """Obtener todas las parcelas"""
    try:
        return production_service.get_parcels()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/production/stats", response_model=ProductionStats)
async def get_production_stats(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """Obtener estadísticas de producción"""
    try:
        # Convertir fechas si se proporcionan
        start_dt = None
        end_dt = None
        if start_date:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        if end_date:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
        
        return production_service.get_production_stats(start_dt, end_dt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Nuevas rutas de predicciones ---
@app.post("/predictions/humidity")
async def predict_humidity(request: PredictionRequest):
    """Predicción de humedad"""
    try:
        result = prediction_service.predict_humidity(
            hours_to_predict=request.hours_to_predict,
            include_graph=request.include_graph
        )
        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/predictions/temperature")
async def predict_temperature(days: int = Query(7, ge=1, le=30)):
    """Predicción de temperatura"""
    try:
        result = prediction_service.predict_temperature(days)
        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/predictions/rainfall")
async def predict_rainfall(days: int = Query(7, ge=1, le=30)):
    """Predicción de lluvia"""
    try:
        result = prediction_service.predict_rainfall(days)
        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/predictions/soil-moisture")
async def predict_soil_moisture(days: int = Query(7, ge=1, le=30)):
    """Predicción de humedad del suelo"""
    try:
        result = prediction_service.predict_soil_moisture(days)
        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/predictions/alerts")
async def get_weather_alerts():
    """Obtener alertas meteorológicas"""
    try:
        result = prediction_service.get_weather_alerts()
        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    """Endpoint raíz con información de la API"""
    return {
        "message": "MSA API - Monitoreo de Sensores Agrícolas",
        "version": "1.0.0",
        "endpoints": {
            "sensors": "/get_datos",
            "predictions": {
                "humidity": "/predictions/humidity",
                "temperature": "/predictions/temperature",
                "rainfall": "/predictions/rainfall",
                "soil_moisture": "/predictions/soil-moisture",
                "alerts": "/predictions/alerts"
            },
            "production": {
                "records": "/production/records",
                "parcels": "/production/parcels",
                "stats": "/production/stats"
            }
        }
    }
