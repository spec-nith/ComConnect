import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const markerIcon = (name, self = false) =>
  L.divIcon({
    className: "",
    html: `<div class="location-marker ${
      self ? "location-marker--self" : ""
    }"><span>${String(name || "?").trim().charAt(0).toUpperCase()}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -34],
  });

const hasCoordinates = (value) =>
  Number.isFinite(Number(value?.latitude)) &&
  Number.isFinite(Number(value?.longitude));

const MapComponent = ({ location, otherUsers }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const accuracyCircleRef = useRef(null);
  const otherMarkersRef = useRef(new Map());
  const hasPositionedRef = useRef(false);
  const visibleUsersRef = useRef("");

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    mapRef.current = L.map(containerRef.current, {
      zoomControl: true,
      minZoom: 2,
      maxZoom: 19,
    }).setView([20, 0], 2);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapRef.current);

    const resizeTimer = window.setTimeout(() => mapRef.current?.invalidateSize(), 0);
    return () => {
      window.clearTimeout(resizeTimer);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (hasCoordinates(location)) {
      const coordinates = [Number(location.latitude), Number(location.longitude)];
      if (markerRef.current) {
        markerRef.current.setLatLng(coordinates);
      } else {
        markerRef.current = L.marker(coordinates, {
          icon: markerIcon("You", true),
        })
          .addTo(map)
          .bindPopup("<strong>You</strong><br/>Live location");
      }

      if (accuracyCircleRef.current) {
        accuracyCircleRef.current
          .setLatLng(coordinates)
          .setRadius(Number(location.accuracy || 0));
      } else {
        accuracyCircleRef.current = L.circle(coordinates, {
          radius: Number(location.accuracy || 0),
          color: "#10b981",
          fillColor: "#34d399",
          fillOpacity: 0.12,
          weight: 1,
        }).addTo(map);
      }

      map.setView(coordinates, Math.max(map.getZoom(), 16), { animate: true });
      hasPositionedRef.current = true;
    } else {
      markerRef.current?.remove();
      accuracyCircleRef.current?.remove();
      markerRef.current = null;
      accuracyCircleRef.current = null;
    }

    const activeUserIds = new Set();
    otherUsers.filter(hasCoordinates).forEach((member) => {
      const coordinates = [Number(member.latitude), Number(member.longitude)];
      activeUserIds.add(member.userId);
      const existing = otherMarkersRef.current.get(member.userId);

      if (existing) {
        existing.setLatLng(coordinates);
      } else {
        const safeName = String(member.userName || "Workspace member").replace(
          /[<>&"']/g,
          ""
        );
        const marker = L.marker(coordinates, {
          icon: markerIcon(safeName),
        })
          .addTo(map)
          .bindPopup(`<strong>${safeName}</strong><br/>Live location`);
        otherMarkersRef.current.set(member.userId, marker);
      }
    });

    otherMarkersRef.current.forEach((marker, userId) => {
      if (!activeUserIds.has(userId)) {
        marker.remove();
        otherMarkersRef.current.delete(userId);
      }
    });

    const visibleUserKey = [
      hasCoordinates(location)
        ? `self:${Number(location.latitude).toFixed(6)},${Number(
            location.longitude
          ).toFixed(6)}`
        : "",
      ...otherUsers
        .filter(hasCoordinates)
        .map(
          (member) =>
            `${member.userId}:${Number(member.latitude).toFixed(6)},${Number(
              member.longitude
            ).toFixed(6)}`
        )
        .sort(),
    ].join(":");
    const visiblePoints = [
      ...(hasCoordinates(location)
        ? [[Number(location.latitude), Number(location.longitude)]]
        : []),
      ...otherUsers
        .filter(hasCoordinates)
        .map((member) => [Number(member.latitude), Number(member.longitude)]),
    ];

    if (
      visiblePoints.length > 1 &&
      visibleUsersRef.current !== visibleUserKey
    ) {
      map.fitBounds(L.latLngBounds(visiblePoints), {
        padding: [56, 56],
        maxZoom: 16,
      });
      hasPositionedRef.current = true;
    } else if (
      visiblePoints.length === 1 &&
      !hasPositionedRef.current
    ) {
      map.setView(visiblePoints[0], 16);
      hasPositionedRef.current = true;
    }
    visibleUsersRef.current = visibleUserKey;
  }, [location, otherUsers]);

  return (
    <div className="location-map">
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
};

export default MapComponent;
