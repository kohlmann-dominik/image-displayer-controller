// src/config.ts

export const API_BASE =
  import.meta.env.PROD
    ? ""   // Produktion → gleiche Origin: http://displaycontroller
    : "http://localhost:4000" // Entwicklung → Backend direkt

export const WS_URL =
  import.meta.env.PROD
    ? `ws://${window.location.host}/ws` // Produktion → WebSocket via Nginx
    : "ws://localhost:4000/ws" // Entwicklung