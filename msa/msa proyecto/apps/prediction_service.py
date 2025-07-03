import requests
import traceback
from typing import Dict, Any, Optional
from models import PredictionRequest, PredictionResponse
from database import db_manager
import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression
import io
import base64
import matplotlib.pyplot as plt

class PredictionService:
    def __init__(self):
        self.sensors_collection = db_manager.get_sensors_collection()
        # URL base para la API de predicciones (configurable)
        self.prediction_api_base_url = "http://localhost:8001"  # Puerto diferente al main
    
    def get_sensor_data(self, limit: int = 100) -> pd.DataFrame:
        """Obtener datos de sensores desde MongoDB"""
        try:
            datos = list(self.sensors_collection.find().limit(limit))
            df = pd.DataFrame(datos)
            
            if "_id" in df.columns:
                df.drop(columns=["_id"], inplace=True)
            
            return df
        except Exception as e:
            print(f"Error obteniendo datos de sensores: {e}")
            return pd.DataFrame()
    
    def predict_humidity(self, hours_to_predict: int, include_graph: bool = False) -> Dict[str, Any]:
        """Predicción de humedad usando el modelo existente"""
        try:
            df = self.get_sensor_data()
            if df.empty:
                return {"error": "No se pudieron obtener datos de sensores"}
            
            if "fecha" not in df.columns or "valor" not in df.columns:
                return {"error": "Columnas 'fecha' o 'valor' no encontradas"}
            
            # Convertir columna fecha a datetime y limpiar filas inválidas
            df["fecha"] = pd.to_datetime(df["fecha"], errors="coerce")
            df = df.dropna(subset=["fecha", "valor"])
            
            # Establecer fecha como índice para usar resample
            df = df.set_index("fecha")
            
            # Resamplear por hora, tomando promedio
            df = df.resample("H").mean()
            
            # Preparar datos para el modelo de regresión
            df = df.dropna(subset=["valor"])
            df["hora"] = np.arange(len(df))
            X = df[["hora"]]
            y = df["valor"]
            
            modelo = LinearRegression()
            modelo.fit(X, y)
            
            if hours_to_predict <= 0:
                return {"error": "horas_a_predecir debe ser mayor que 0"}
            
            horas_futuras = np.arange(len(df), len(df) + hours_to_predict).reshape(-1, 1)
            predicciones = modelo.predict(horas_futuras)
            
            resultados = [
                {"hora_futura": int(hora), "prediccion_valor": float(pred)}
                for hora, pred in zip(horas_futuras.flatten(), predicciones)
            ]
            
            respuesta = {"predicciones": resultados}
            
            if include_graph:
                plt.figure(figsize=(10, 5))
                plt.plot(df.index, y, label="Datos históricos")
                fechas_futuras = pd.date_range(start=df.index[-1], periods=hours_to_predict + 1, freq="H")[1:]
                plt.plot(fechas_futuras, predicciones, label="Predicción", linestyle="--")
                plt.title("Predicción de Humedad")
                plt.xlabel("Fecha")
                plt.ylabel("Humedad (%)")
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
            return {"error": f"Error en la predicción: {str(e)}"}
    
    def predict_temperature(self, days_to_predict: int = 7) -> Dict[str, Any]:
        """Predicción de temperatura (estructura básica para API externa)"""
        try:
            # Aquí se haría la llamada a la API externa de temperatura
            # Por ahora retornamos datos mock
            api_url = f"{self.prediction_api_base_url}/predict/temperature"
            params = {"days": days_to_predict}
            
            # Comentado por ahora hasta que la API esté disponible
            # response = requests.get(api_url, params=params)
            # if response.status_code == 200:
            #     return response.json()
            # else:
            #     return {"error": f"Error en API de temperatura: {response.status_code}"}
            
            # Datos mock por ahora
            return {
                "predictions": [
                    {"day": "Hoy", "predicted": 33.5, "optimal": 28},
                    {"day": "Mañana", "predicted": 35.0, "optimal": 28},
                    {"day": "Mié", "predicted": 36.0, "optimal": 28},
                    {"day": "Jue", "predicted": 34.0, "optimal": 28},
                    {"day": "Vie", "predicted": 32.0, "optimal": 28},
                    {"day": "Sáb", "predicted": 31.0, "optimal": 28},
                    {"day": "Dom", "predicted": 33.0, "optimal": 28},
                ]
            }
            
        except Exception as e:
            return {"error": f"Error en predicción de temperatura: {str(e)}"}
    
    def predict_rainfall(self, days_to_predict: int = 7) -> Dict[str, Any]:
        """Predicción de lluvia (estructura básica para API externa)"""
        try:
            # Aquí se haría la llamada a la API externa de lluvia
            api_url = f"{self.prediction_api_base_url}/predict/rainfall"
            params = {"days": days_to_predict}
            
            # Comentado por ahora hasta que la API esté disponible
            # response = requests.get(api_url, params=params)
            # if response.status_code == 200:
            #     return response.json()
            # else:
            #     return {"error": f"Error en API de lluvia: {response.status_code}"}
            
            # Datos mock por ahora
            return {
                "predictions": [
                    {"day": "Hoy", "predicted": 0, "probability": 5},
                    {"day": "Mañana", "predicted": 2, "probability": 25},
                    {"day": "Mié", "predicted": 8, "probability": 60},
                    {"day": "Jue", "predicted": 15, "probability": 80},
                    {"day": "Vie", "predicted": 12, "probability": 70},
                    {"day": "Sáb", "predicted": 5, "probability": 40},
                    {"day": "Dom", "predicted": 3, "probability": 30},
                ]
            }
            
        except Exception as e:
            return {"error": f"Error en predicción de lluvia: {str(e)}"}
    
    def predict_soil_moisture(self, days_to_predict: int = 7) -> Dict[str, Any]:
        """Predicción de humedad del suelo (estructura básica para API externa)"""
        try:
            # Aquí se haría la llamada a la API externa de humedad del suelo
            api_url = f"{self.prediction_api_base_url}/predict/soil-moisture"
            params = {"days": days_to_predict}
            
            # Comentado por ahora hasta que la API esté disponible
            # response = requests.get(api_url, params=params)
            # if response.status_code == 200:
            #     return response.json()
            # else:
            #     return {"error": f"Error en API de humedad del suelo: {response.status_code}"}
            
            # Datos mock por ahora
            return {
                "predictions": [
                    {"day": "Hoy", "predicted": 5, "optimal": 40},
                    {"day": "Mañana", "predicted": 8, "optimal": 40},
                    {"day": "Mié", "predicted": 20, "optimal": 40},
                    {"day": "Jue", "predicted": 35, "optimal": 40},
                    {"day": "Vie", "predicted": 45, "optimal": 40},
                    {"day": "Sáb", "predicted": 42, "optimal": 40},
                    {"day": "Dom", "predicted": 38, "optimal": 40},
                ]
            }
            
        except Exception as e:
            return {"error": f"Error en predicción de humedad del suelo: {str(e)}"}
    
    def get_weather_alerts(self) -> Dict[str, Any]:
        """Obtener alertas meteorológicas (estructura básica para API externa)"""
        try:
            # Aquí se haría la llamada a la API externa de alertas
            api_url = f"{self.prediction_api_base_url}/alerts/weather"
            
            # Comentado por ahora hasta que la API esté disponible
            # response = requests.get(api_url)
            # if response.status_code == 200:
            #     return response.json()
            # else:
            #     return {"error": f"Error en API de alertas: {response.status_code}"}
            
            # Datos mock por ahora
            return {
                "alerts": [
                    {
                        "type": "temperature",
                        "severity": "warning",
                        "message": "Se prevén temperaturas superiores a 35°C en los próximos 2 días",
                        "recommendation": "Considere aumentar el riego y proporcionar sombra adicional"
                    },
                    {
                        "type": "humidity",
                        "severity": "info",
                        "message": "La humedad del suelo alcanzará niveles óptimos en 4-5 días",
                        "recommendation": "Condiciones favorables para el cacao"
                    }
                ]
            }
            
        except Exception as e:
            return {"error": f"Error obteniendo alertas: {str(e)}"}

# Instancia global del servicio
prediction_service = PredictionService() 