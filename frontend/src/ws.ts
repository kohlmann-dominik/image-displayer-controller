// src/ws.ts
import type { MessageFromClient, MessageFromServer, PlayerState } from "./types"
import { WS_URL } from "./config"

type StateListener = (state: PlayerState) => void

let socket: WebSocket | null = null
let currentState: PlayerState | null = null
const listeners: StateListener[] = []

export function connectWs() {
  // wenn schon verbunden oder am Verbinden → nichts tun
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return
  }

  socket = new WebSocket(WS_URL)

  socket.addEventListener("open", () => {
    console.log("[ws] connected")
  })

  socket.addEventListener("message", (event) => {
    try {
      const msg = JSON.parse(event.data) as MessageFromServer

      if (msg.type === "STATE_UPDATE") {
        currentState = msg.payload
        listeners.forEach((cb) => cb(currentState as PlayerState))
      } else if (msg.type === "INFO") {
        console.log("[ws][info]", msg.payload.message)
      }
    } catch (error) {
      console.error("[ws] failed to parse message", error)
    }
  })

  socket.addEventListener("close", () => {
    console.log("[ws] disconnected")
    // Optional: Auto-Reconnect nach kurzer Zeit
    setTimeout(() => {
      connectWs()
    }, 3000)
  })
}

export function onStateChange(cb: StateListener): () => void {
  listeners.push(cb)

  // falls already ein State da ist → direkt liefern
  if (currentState) {
    cb(currentState)
  }

  // unsubscribe-Funktion zurückgeben
  return () => {
    const idx = listeners.indexOf(cb)
    if (idx !== -1) {
      listeners.splice(idx, 1)
    }
  }
}

export function sendMessage(msg: MessageFromClient) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg))
  } else {
    console.warn("[ws] cannot send, socket not open")
  }
}
