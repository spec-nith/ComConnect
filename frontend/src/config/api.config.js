const configuredOrigin =
  process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV === "production"
    ? window.location.origin
    : `${window.location.protocol}//${window.location.hostname}:5000`);

const alignLocalHostname = (origin) => {
  try {
    const url = new URL(origin, window.location.origin);
    const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    if (
      process.env.NODE_ENV !== "production" &&
      localHosts.has(url.hostname) &&
      localHosts.has(window.location.hostname)
    ) {
      url.hostname = window.location.hostname;
    }
    return url.origin + url.pathname.replace(/\/$/, "");
  } catch {
    return origin;
  }
};

const API_ORIGIN = alignLocalHostname(configuredOrigin)
  .replace(/\/+$/, "")
  .replace(/\/api$/, "");
const API_URL = `${API_ORIGIN}/api`;
const SOCKET_URL = (
  process.env.REACT_APP_SOCKET_URL || API_ORIGIN
).replace(/\/+$/, "");

export { API_ORIGIN, API_URL, SOCKET_URL };
