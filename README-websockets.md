# Integración de WebSockets con React

He agregado soporte de WebSockets en el backend para actualizaciones en tiempo real. Ahora debes integrar socket.io-client en tu frontend de React.

## Instalación

En tu proyecto de React, instala socket.io-client:

```bash
npm install socket.io-client --save
```

## Uso Básico

Aquí hay un ejemplo de cómo puedes integrar los WebSockets en tu componente React:

```jsx
import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

// Componente para mostrar los datos de humedad en tiempo real
function HumedadRealTime() {
  const [lecturas, setLecturas] = useState([]);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // Conectar al servidor WebSocket
    const socketInstance = io('http://localhost:5000');
    setSocket(socketInstance);

    // Cargar datos iniciales
    fetch('/api/humedad')
      .then(response => response.json())
      .then(data => setLecturas(data))
      .catch(error => console.error('Error al cargar datos:', error));

    // Escuchar nuevas lecturas
    socketInstance.on('nueva-lectura', (nuevaLectura) => {
      setLecturas(prevLecturas => [nuevaLectura, ...prevLecturas.slice(0, 99)]);
    });

    // Limpiar conexión al desmontar
    return () => {
      if (socketInstance) socketInstance.disconnect();
    };
  }, []);

  return (
    <div>
      <h2>Lecturas de Humedad en Tiempo Real</h2>
      <ul>
        {lecturas.map((lectura, index) => (
          <li key={index}>
            {lectura.valor}% - {new Date(lectura.fecha).toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default HumedadRealTime;
```

## Consideraciones Importantes

1. **URL del Servidor**: Asegúrate de usar la URL correcta en la conexión (`io('http://localhost:5000')`). Si tu aplicación está en producción, deberías usar la URL base de tu aplicación.

2. **Manejo de Reconexiones**: Socket.io maneja reconexiones automáticamente, pero puedes personalizar este comportamiento si es necesario.

3. **Eventos Personalizados**: El servidor emite eventos `'nueva-lectura'`. Si agregas más eventos en el servidor, asegúrate de escucharlos en el cliente.

4. **Optimización**: Para aplicaciones con muchas actualizaciones, considera implementar debouncing o throttling para evitar demasiadas re-renderizaciones.

## Ejemplo Completo de Integración

Para una integración más completa, puedes crear un contexto de WebSocket:

```jsx
// WebSocketContext.js
import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [lecturas, setLecturas] = useState([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socketInstance = io('http://localhost:5000');
    
    socketInstance.on('connect', () => {
      setIsConnected(true);
    });
    
    socketInstance.on('disconnect', () => {
      setIsConnected(false);
    });
    
    socketInstance.on('nueva-lectura', (nuevaLectura) => {
      setLecturas(prevLecturas => [nuevaLectura, ...prevLecturas.slice(0, 99)]);
    });
    
    setSocket(socketInstance);
    
    // Cargar datos iniciales
    fetch('/api/humedad')
      .then(response => response.json())
      .then(data => setLecturas(data))
      .catch(error => console.error('Error al cargar datos:', error));
    
    return () => {
      socketInstance.disconnect();
    };
  }, []);
  
  return (
    <WebSocketContext.Provider value={{ socket, lecturas, isConnected }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket debe usarse dentro de un WebSocketProvider');
  }
  return context;
}
```

Luego, puedes usar este contexto en tu aplicación:

```jsx
// App.js
import { WebSocketProvider } from './WebSocketContext';
import HumedadDashboard from './HumedadDashboard';

function App() {
  return (
    <WebSocketProvider>
      <div className="App">
        <HumedadDashboard />
      </div>
    </WebSocketProvider>
  );
}

// HumedadDashboard.js
import { useWebSocket } from './WebSocketContext';

function HumedadDashboard() {
  const { lecturas, isConnected } = useWebSocket();
  
  return (
    <div>
      <div className="connection-status">
        Estado: {isConnected ? 'Conectado' : 'Desconectado'}
      </div>
      
      <h2>Lecturas de Humedad</h2>
      <ul>
        {lecturas.map((lectura, index) => (
          <li key={index}>
            {lectura.valor}% - {new Date(lectura.fecha).toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Esta implementación te permitirá recibir actualizaciones en tiempo real de las lecturas de humedad sin necesidad de recargar la página o hacer polling al servidor. 