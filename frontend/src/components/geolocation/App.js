import React, { useState, useEffect, useRef, useCallback } from "react";
import io from "socket.io-client";
import MapComponent from "./Map";
import { indexedDBService } from "../../services/indexedDBService";
import { ChatState } from "../../Context/ChatProvider";
import { API_URL } from "../../config/api.config";
import { Modal } from "@chakra-ui/react";

const Geo = () => {
  const { user } = ChatState();
  const [isLoading, setIsLoading] = useState(true);
  const [location, setLocation] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [otherUsers, setOtherUsers] = useState(new Map());
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const socketRef = useRef(null);
  const watchIdRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  // Handle location updates
  const handleLocationUpdate = useCallback(
    async (position) => {
      if (!user?._id) return;

      const { latitude, longitude, accuracy } = position.coords;
      const locationData = {
        latitude,
        longitude,
        accuracy,
        userId: user._id,
        timestamp: Date.now(),
      };

      // Update local state
      setLocation(locationData);
      setAccuracy(accuracy);

      try {
        // Store in IndexedDB
        await indexedDBService.storeLocation(locationData);

        // If online, send to server
        if (socketRef.current?.connected) {
          socketRef.current.emit("location-update", locationData);
        }
      } catch (error) {
        console.error("Error handling location update:", error);
      }
    },
    [user]
  );

  // Sync unsynced locations when coming online
  const syncLocations = useCallback(async () => {
    try {
      const unsynedLocations = await indexedDBService.getUnsynedLocations();
      if (unsynedLocations.length > 0 && socketRef.current?.connected) {
        // Send locations in batches
        const batchSize = 10;
        for (let i = 0; i < unsynedLocations.length; i += batchSize) {
          const batch = unsynedLocations.slice(i, i + batchSize);
          socketRef.current.emit("bulk-location-update", batch);

          // Mark these locations as synced
          const timestamps = batch.map((loc) => loc.timestamp);
          await indexedDBService.markLocationsAsSynced(timestamps);
        }
      }
    } catch (error) {
      console.error("Error syncing locations:", error);
    }
  }, []);

  // Initialize socket connection with user token
  const initializeSocket = useCallback(() => {
    if (!user?.token) return;

    // Use API Gateway for Socket.IO connection
    const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || API_URL.replace("/api", "");

    const socket = io(SOCKET_URL, {
      reconnection: true,
      reconnectionAttempts: maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      auth: {
        token: user.token,
      },
    });

    socket.on("connect", () => {
      console.log("Socket connected");
      setConnectionStatus("connected");
      reconnectAttempts.current = 0;
      syncLocations(); // Sync any stored locations
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected");
      setConnectionStatus("disconnected");
    });

    socket.on("other-users-location", (users) => {
      setOtherUsers(new Map(users.map((user) => [user.userId, user])));
    });

    socketRef.current = socket;
  }, [user?.token, syncLocations]);

  // Start location watching
  const startLocationWatch = useCallback(() => {
    if ("serviceWorker" in navigator && "SyncManager" in window) {
      navigator.serviceWorker.ready.then((registration) => {
        if (navigator.geolocation) {
          watchIdRef.current = navigator.geolocation.watchPosition(
            handleLocationUpdate,
            (error) => console.error("Location error:", error),
            {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 0,
            }
          );
        }
      });
    }
  }, [handleLocationUpdate]);

  useEffect(() => {
    if (user) {
      setIsLoading(false);
      initializeSocket();
      startLocationWatch();

      // Clean up old locations every hour
      const cleanupInterval = setInterval(() => {
        indexedDBService.clearOldLocations(1);
      }, 60 * 60 * 1000);

      return () => {
        if (watchIdRef.current) {
          navigator.geolocation.clearWatch(watchIdRef.current);
        }
        if (socketRef.current) {
          socketRef.current.disconnect();
        }
        clearInterval(cleanupInterval);
      };
    }
  }, [user, initializeSocket, startLocationWatch]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <div>Please log in to access the map.</div>;
  }

  return (
    <div className="relative w-full h-screen">
      <div className="absolute text-black top-5 left-16 z-[1000] backdrop-blur-md p-4 rounded-lg shadow-lg">
        <h1 className="text-2xl font-bold mb-2">Real-Time Map</h1>
        <div className="text-sm">Status: <span className={connectionStatus === 'connected' ? 'text-green-600' : 'text-red-600'}>{connectionStatus}</span></div>
        {accuracy && <div className="text-sm">Current Accuracy: {Math.round(accuracy)} meters</div>}
      </div>
      <MapComponent
        location={location}
        accuracy={accuracy}
        otherUsers={Array.from(otherUsers.values())}
      />
    </div>
  );
};

export default Geo;
