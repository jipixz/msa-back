from pymongo import MongoClient
from sshtunnel import SSHTunnelForwarder
import os
from dotenv import load_dotenv
from typing import Optional
import traceback

# Cargar variables desde datos.env
load_dotenv("datos.env")

class DatabaseManager:
    def __init__(self):
        self.client: Optional[MongoClient] = None
        self.tunnel: Optional[SSHTunnelForwarder] = None
        
    def connect(self):
        """Conectar a MongoDB a través de SSH tunnel"""
        try:
            ssh_host = os.getenv("SSH_HOST")
            ssh_port = int(os.getenv("SSH_PORT"))
            ssh_user = os.getenv("SSH_USER")
            ssh_password = os.getenv("SSH_PASSWORD")
            remote_bind_host = os.getenv("REMOTE_BIND_HOST")
            remote_bind_port = int(os.getenv("REMOTE_BIND_PORT"))
            local_bind_port = int(os.getenv("LOCAL_BIND_PORT"))
            
            if not all([ssh_host, ssh_user, ssh_password]):
                raise ValueError("Faltan variables de entorno necesarias para la conexión SSH.")

            # Crear SSH tunnel
            self.tunnel = SSHTunnelForwarder(
                (ssh_host, ssh_port),
                ssh_username=ssh_user,
                ssh_password=ssh_password,
                remote_bind_address=(remote_bind_host, remote_bind_port),
                local_bind_address=('localhost', local_bind_port)
            )
            
            self.tunnel.start()
            
            # Conectar a MongoDB
            self.client = MongoClient(f"mongodb://localhost:{local_bind_port}")
            
            return self.client
            
        except Exception as e:
            print("Error al conectarse a MongoDB:")
            traceback.print_exc()
            raise e
    
    def get_database(self, db_name: str = None):
        """Obtener la base de datos"""
        if not self.client:
            self.connect()
        
        if not db_name:
            db_name = os.getenv("MONGO_DB", "humedad-cacao")
            
        return self.client[db_name]
    
    def get_production_collection(self):
        """Obtener la colección de producción"""
        db = self.get_database()
        return db["production"]
    
    def get_parcels_collection(self):
        """Obtener la colección de parcelas"""
        db = self.get_database()
        return db["parcels"]
    
    def get_sensors_collection(self):
        """Obtener la colección de sensores (existente)"""
        db = self.get_database()
        return db[os.getenv("MONGO_COLLECTION", "humedads")]
    
    def close(self):
        """Cerrar conexiones"""
        if self.client:
            self.client.close()
        if self.tunnel:
            self.tunnel.stop()

# Instancia global del manager de base de datos
db_manager = DatabaseManager() 