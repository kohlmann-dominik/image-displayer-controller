// src/config.ts

// Basis-URL deines Backends im DEV
const HOST = window.location.hostname // nimmt 127.0.0.1, 192.168.x.y, etc.

export const API_BASE = `http://${HOST}:4000`
export const WS_URL = `ws://${HOST}:4000`

// Später für dein Heimnetz z.B.:
// export const API_BASE = "http://192.168.0.50:4000"
// export const WS_URL = "ws://192.168.0.50:4000"
