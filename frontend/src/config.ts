// src/config.ts
const isProd = import.meta.env.PROD

let apiBase: string
let wsUrl: string

if (isProd) {
  // PROD → alles über nginx
  apiBase = ""
  wsUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`
} else {
  // DEV → direktes Backend
  const host = window.location.hostname
  apiBase = `http://${host}:4000`
  wsUrl = `ws://${host}:4000/ws`
}

export const API_BASE = apiBase
export const WS_URL = wsUrl
