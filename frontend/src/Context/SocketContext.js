import { createContext, useContext, useEffect } from 'react';
import io from 'socket.io-client';
import { API_URL } from "../config/api.config";

// Determine Socket URL based on environment
// Use dedicated WebSocket Gateway for production-level architecture
const getSocketURL = () => {
  // Use WebSocket Gateway URL directly (port 5007)
  // This is the production-level approach - separate WebSocket gateway
  if (process.env.REACT_APP_SOCKET_URL) {
    return process.env.REACT_APP_SOCKET_URL;
  }
  
  // Fallback: construct WebSocket gateway URL
  if (process.env.NODE_ENV === 'development') {
    // In development, use WebSocket gateway directly
    return 'http://localhost:5007';
  } else {
    // In production, construct from API URL base
    const baseURL = API_URL.replace('/api', '');
    // Replace API gateway port with WebSocket gateway port
    return baseURL.replace(':8080', ':5007').replace('api-gateway', 'websocket-gateway');
  }
};

const SOCKET_URL = getSocketURL();

console.log('Socket Configuration:', {
  NODE_ENV: process.env.NODE_ENV,
  USE_PROD_API: process.env.REACT_APP_USE_PROD_API,
  SOCKET_URL: SOCKET_URL,
  API_URL: API_URL
});

const socket = io(SOCKET_URL, {
  path: '/socket.io',
  transports: ['polling', 'websocket'], // Try polling first, then upgrade to websocket
  withCredentials: true,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 10000, // Reduced timeout
  autoConnect: false,
  forceNew: false
});

// Add socket event listeners for debugging
socket.on('connect', () => {
  console.log('✅ Socket.IO connected:', socket.id);
});

socket.on('disconnect', (reason) => {
  console.log('❌ Socket.IO disconnected:', reason);
});

socket.on('connect_error', (error) => {
  console.error('❌ Socket.IO connection error:', error.message);
});

socket.on('reconnect', (attemptNumber) => {
  console.log('🔄 Socket.IO reconnected after', attemptNumber, 'attempts');
});

socket.on('reconnect_attempt', (attemptNumber) => {
  console.log('🔄 Socket.IO reconnection attempt:', attemptNumber);
});

socket.on('reconnect_error', (error) => {
  console.error('❌ Socket.IO reconnection error:', error.message);
});

socket.on('reconnect_failed', () => {
  console.error('❌ Socket.IO reconnection failed - max attempts reached');
});

// Create context
const SocketContext = createContext(socket);

// Hook to use socket
export const useSocket = () => {
  return useContext(SocketContext);
};

// Provider component
export const SocketProvider = ({ children }) => {
  useEffect(() => {
    // Handle offline/online events
    const handleOnline = () => {
      console.log('Network online - connecting socket');
      socket.connect();
    };

    const handleOffline = () => {
      console.log('Network offline - disconnecting socket');
      socket.disconnect();
    };

    // Reconnect logic for mobile background state
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('App visible - connecting socket');
        socket.connect();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};

export default socket;