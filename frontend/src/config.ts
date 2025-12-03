// src/config.ts

const isProd = import.meta.env.PROD

let apiBase: string
let wsUrl: string

if (isProd) {
  // Produktion → gleiche Origin: http://displaycontroller
  apiBase = ""
  wsUrl = `ws://${window.location.host}/ws`
} else {
  // Entwicklung → Backend auf Port 4000, aber Host kann localhost ODER IP sein
  const hostname = window.location.hostname

  let targetHost = hostname
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    targetHost = "localhost"
  }

  apiBase = `http://${targetHost}:4000`
  wsUrl = `ws://${targetHost}:4000/ws`
}

export const API_BASE = apiBase
export const WS_URL = wsUrl
