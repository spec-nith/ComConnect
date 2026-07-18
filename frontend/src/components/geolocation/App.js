import React, { useCallback, useEffect, useRef, useState } from "react";
import { FiArrowLeft, FiMapPin } from "react-icons/fi";
import { useNavigate, useParams } from "react-router-dom";
import { ChatState } from "../../Context/ChatProvider";
import socket from "../../Context/SocketContext";
import MapComponent from "./Map";
import "./geolocation.css";

const normalizeUsers = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") return Object.values(payload);
  return [];
};
const LOCATION_FRESH_MS = 30000;
const SHARED_LOCATION_FRESH_MS = 120000;

const Geo = () => {
  const { user } = ChatState();
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const [location, setLocation] = useState(null);
  const [otherUsers, setOtherUsers] = useState(new Map());
  const [connectionStatus, setConnectionStatus] = useState(
    socket.connected ? "connected" : "connecting"
  );
  const [isSharing, setIsSharing] = useState(false);
  const [locationError, setLocationError] = useState("");
  const watchIdRef = useRef(null);
  const refreshTimerRef = useRef(null);
  const latestLocationRef = useRef(null);
  const isSharingRef = useRef(false);

  const emitLatestLocation = useCallback(() => {
    if (!socket.connected || !isSharingRef.current || !latestLocationRef.current) {
      return;
    }
    socket.emit("location-update", latestLocationRef.current);
  }, []);

  const publishLocation = useCallback(
    (position) => {
      if (!user?._id) return;
      const positionTimestamp = Number(position.timestamp || 0);
      const ageMs = positionTimestamp ? Date.now() - positionTimestamp : 0;
      if (ageMs > LOCATION_FRESH_MS) {
        setLocationError("Waiting for a fresh GPS update...");
        return;
      }

      const locationData = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        userId: user._id,
        userName: user.name,
        userPic: user.pic,
        workspaceId,
        timestamp: Date.now(),
        sourceTimestamp: positionTimestamp || Date.now(),
      };

      setLocation(locationData);
      latestLocationRef.current = locationData;
      setLocationError("");
      emitLatestLocation();
    },
    [emitLatestLocation, user, workspaceId]
  );

  const stopSharing = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (refreshTimerRef.current) {
      window.clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    setLocation(null);
    latestLocationRef.current = null;
    isSharingRef.current = false;
    setIsSharing(false);
    if (socket.connected) {
      socket.emit("location-sharing-stopped", {
        userId: user?._id,
        workspaceId,
      });
    }
  }, [user?._id, workspaceId]);

  const startSharing = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError("Location is not supported by this browser.");
      return;
    }

    setLocationError("");
    isSharingRef.current = true;
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (refreshTimerRef.current) {
      window.clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    navigator.geolocation.getCurrentPosition(
      publishLocation,
      (error) => {
        isSharingRef.current = false;
        setIsSharing(false);
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. Enable it in your browser settings."
            : "Your current location could not be determined. Waiting for live updates."
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
    watchIdRef.current = navigator.geolocation.watchPosition(
      publishLocation,
      (error) => {
        isSharingRef.current = false;
        setIsSharing(false);
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. Enable it in your browser settings."
            : "Your location could not be determined. Please try again."
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
    refreshTimerRef.current = window.setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        publishLocation,
        () => {},
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }
      );
    }, 10000);
    setIsSharing(true);
    emitLatestLocation();
  }, [emitLatestLocation, publishLocation]);

  useEffect(() => {
    if (!user?.token) return undefined;

    setLocation(null);
    setOtherUsers(new Map());
    socket.auth = { token: user.token };
    if (!socket.connected) socket.connect();

    const joinMap = () => {
      setConnectionStatus("connected");
      socket.emit("setup");
      socket.emit("join-location-workspace", { workspaceId });
    };
    const handleDisconnect = () => setConnectionStatus("disconnected");
    const handleLocations = (payload) => {
      const now = Date.now();
      const users = normalizeUsers(payload).filter((member) => {
        if (!member?.userId || member.userId === user._id) return false;
        if (member.timestamp && now - Number(member.timestamp) > SHARED_LOCATION_FRESH_MS) {
          return false;
        }
        return !member.workspaceId || !workspaceId || member.workspaceId === workspaceId;
      });
      setOtherUsers(new Map(users.map((member) => [member.userId, member])));
      emitLatestLocation();
    };
    const handleLocation = (member) => {
      const timestamp = Number(member?.timestamp || 0);
      if (
        !member?.userId ||
        member.userId === user._id ||
        (timestamp && Date.now() - timestamp > SHARED_LOCATION_FRESH_MS) ||
        (member.workspaceId && workspaceId && member.workspaceId !== workspaceId)
      ) {
        return;
      }
      setOtherUsers((current) => {
        const next = new Map(current);
        next.set(member.userId, member);
        return next;
      });
    };
    const removeLocation = ({ userId }) => {
      setOtherUsers((current) => {
        const next = new Map(current);
        next.delete(userId);
        return next;
      });
    };
    const handleLocationError = ({ message }) => {
      setLocationError(message || "Workspace location sharing is unavailable.");
    };

    socket.on("connect", joinMap);
    socket.on("disconnect", handleDisconnect);
    socket.on("other-users-location", handleLocations);
    socket.on("user-location-updated", handleLocation);
    socket.on("user-location-removed", removeLocation);
    socket.on("location-error", handleLocationError);
    socket.on("location-workspace-joined", emitLatestLocation);
    if (socket.connected) joinMap();

    return () => {
      stopSharing();
      socket.emit("leave-location-workspace", { workspaceId });
      socket.off("connect", joinMap);
      socket.off("disconnect", handleDisconnect);
      socket.off("other-users-location", handleLocations);
      socket.off("user-location-updated", handleLocation);
      socket.off("user-location-removed", removeLocation);
      socket.off("location-error", handleLocationError);
      socket.off("location-workspace-joined", emitLatestLocation);
    };
  }, [emitLatestLocation, stopSharing, user?._id, user?.token, workspaceId]);

  if (!user) return null;

  return (
    <main className="location-page">
      <section className="location-panel" aria-label="Workspace live map controls">
        <div className="location-panel__header">
          <button
            type="button"
            className="location-back"
            aria-label="Back to workspace"
            onClick={() =>
              navigate(workspaceId ? `/workspace/${workspaceId}/chats` : "/workspace")
            }
          >
            <FiArrowLeft />
          </button>
          <FiMapPin color="#34d399" size={24} />
          <div className="location-panel__title">
            <h1>Workspace live map</h1>
            <p>{otherUsers.size + (location ? 1 : 0)} sharing location now</p>
          </div>
        </div>

        <div className="location-status">
          <span
            className={`location-status__dot ${
              connectionStatus === "connected"
                ? "location-status__dot--connected"
                : ""
            }`}
          />
          {connectionStatus === "connected" ? "Live updates connected" : "Reconnecting"}
          {location?.accuracy
            ? ` - accuracy ${Math.round(location.accuracy)} m`
            : ""}
        </div>

        <button
          type="button"
          className={`location-share ${isSharing ? "location-share--stop" : ""}`}
          onClick={isSharing ? stopSharing : startSharing}
        >
          {isSharing ? "Stop sharing my location" : "Share my live location"}
        </button>
        <p className="location-note">
          Only people currently sharing appear on this workspace map. Sharing stops
          when you leave this page.
        </p>
        {locationError && <p className="location-error">{locationError}</p>}
      </section>

      <MapComponent
        location={location}
        otherUsers={Array.from(otherUsers.values())}
      />
    </main>
  );
};

export default Geo;
