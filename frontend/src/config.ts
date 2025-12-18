// src/config.ts

// Robust für Prod + PWA + mehrere Devices:
// alles über nginx / gleiche Origin (Port 80/443), inkl. WebSocket-Upgrade via /ws.
export const API_BASE = ""

const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:"
export const WS_URL = `${wsProto}//${window.location.host}/ws`
