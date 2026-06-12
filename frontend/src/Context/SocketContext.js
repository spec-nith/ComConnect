import { createContext, useContext, useEffect } from "react";
import io from "socket.io-client";
import { SOCKET_URL } from "../config/api.config";

const socket = io(SOCKET_URL, {
  path: "/socket.io",
  transports: ["websocket", "polling"],
  withCredentials: true,
  reconnection: true,
  reconnectionAttempts: 8,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 10000,
  autoConnect: false,
});

const SocketContext = createContext(socket);

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  useEffect(() => {
    const connect = () => {
      const userInfo = JSON.parse(localStorage.getItem("userInfo") || "null");
      if (!userInfo?.token) return;
      socket.auth = { token: userInfo.token };
      socket.connect();
    };
    const disconnect = () => socket.disconnect();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") connect();
    };

    window.addEventListener("online", connect);
    window.addEventListener("offline", disconnect);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("online", connect);
      window.removeEventListener("offline", disconnect);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};

export default socket;
