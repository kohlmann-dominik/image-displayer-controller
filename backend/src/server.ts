// backend/src/server.ts
import express, { Request, Response, NextFunction } from "express"
import http from "http"
import WebSocket, { WebSocketServer } from "ws"
import path from "path"
import fs from "fs"
import multer from "multer"

import {
  scenes,
  addSceneFromFilename,
  removeScene,
  updateScene,
  Scene as SceneModel,
} from "./scenes"

type StateUpdateReason =
  | "manual"
  | "timer"
  | "video-ended"
  | "sync"

type PlayMode = "sequential" | "random"

interface PlayerState {
  isPlaying: boolean
  currentSceneId: number | null
  mode: PlayMode
  transitionMs: number
  playVideosFullLength: boolean
  sceneStartedAt: number | null
}

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ server })

// ===================
// CORS-MIDDLEWARE
// ===================
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")
  res.header("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    res.sendStatus(200)
    return
  }

  next()
})

// ===================
// BASIS-MIDDLEWARE
// ===================
app.use(express.json())

// Static Files (Bilder + Thumbnails)
const publicDir = path.join(__dirname, "..", "public")
const imagesDir = path.join(publicDir, "images")
const thumbDir = path.join(imagesDir, "thumbnails")

if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true })
}
if (!fs.existsSync(thumbDir)) {
  fs.mkdirSync(thumbDir, { recursive: true })
}

app.use(
  "/images",
  express.static(imagesDir, {
    etag: true,
    lastModified: true,
    maxAge: "30d",
    immutable: true,
    setHeaders: (res, filePath) => {
      // Thumbnails + optimized aggressiver cachen
      if (filePath.includes(`${path.sep}thumbnails${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=2592000, immutable")
      }

      if (filePath.includes(`${path.sep}optimized${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=2592000, immutable")
      }
    },
  }),
)

// ===================
// HILFSFUNKTIONEN
// ===================

function getThumbnailPath(scene: SceneModel): string {
  const baseName = path.parse(scene.filename).name
  return path.join(thumbDir, `${baseName}.jpg`)
}

function getOptimizedPath(scene: SceneModel): string {
  const baseName = path.parse(scene.filename).name

  if (scene.type === "video") {
    return path.join(imagesDir, "optimized", `${baseName}.mp4`)
  }

  return path.join(imagesDir, "optimized", `${baseName}.jpg`)
}

function isRealFile(p: string): boolean {
  try {
    if (!fs.existsSync(p)) {
      return false
    }

    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

// ===================
// MULTER (UPLOAD)
// ===================

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, imagesDir)
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname)
      const base = path.basename(file.originalname, ext)
      const safeBase = base.replace(/[^a-zA-Z0-9_\-]/g, "_")
      const finalName = `${Date.now()}_${safeBase}${ext}`
      cb(null, finalName)
    },
  }),
  limits: {
    // z. B. 2 GB pro Datei – nach Bedarf anpassen
    fileSize: 1024 * 1024 * 1024 * 2,
  },
})

// ===================
// PLAYER STATE + WS
// ===================

let state: PlayerState = {
  isPlaying: false,
  currentSceneId: scenes.length ? scenes[0].id : null,
  mode: "sequential",
  transitionMs: 5000,
  playVideosFullLength: false,
  sceneStartedAt: scenes.length ? Date.now() : null,
}

// Hilfsfunktionen für sichtbare Szenen
function getVisibleScenes(): SceneModel[] {
  return scenes.filter((s) => {
    if (typeof s.visible === "boolean") {
      return s.visible
    }

    return true
  })
}

function computeNextScene(): SceneModel | null {
  const visibleScenes = getVisibleScenes()
  if (visibleScenes.length === 0) {
    return null
  }

  const currentId = state.currentSceneId
  const currentIndex = visibleScenes.findIndex((s) => s.id === currentId)

  if (state.mode === "random") {
    if (visibleScenes.length === 1) {
      return visibleScenes[0]
    }

    let idx = currentIndex
    while (idx === currentIndex || idx === -1) {
      idx = Math.floor(Math.random() * visibleScenes.length)
    }

    if (idx < 0 || idx >= visibleScenes.length) {
      return null
    }

    return visibleScenes[idx]
  }

  // sequential
  if (currentIndex === -1) {
    return visibleScenes[0] ?? null
  }

  const nextIndex =
    currentIndex === visibleScenes.length - 1 ? 0 : currentIndex + 1
  return visibleScenes[nextIndex] ?? null
}

// --- globaler Rotationstimer im Backend ---
let rotationTimer: NodeJS.Timeout | null = null

function clearRotationTimer(): void {
  if (rotationTimer !== null) {
    clearTimeout(rotationTimer)
    rotationTimer = null
  }
}

function scheduleRotation(): void {
  clearRotationTimer()

  // Nur laufen, wenn wirklich "Play" aktiv ist
  if (!state.isPlaying || state.currentSceneId === null) {
    return
  }

  // Wenn aktuelle Szene ein Video ist und "volle Länge" aktiv → kein Timer,
  // der Wechsel kommt dann über NEXT_SCENE vom Frontend (onended)
  const currentScene = scenes.find((s) => s.id === state.currentSceneId) ?? null

  if (
    currentScene !== null &&
    currentScene.type === "video" &&
    state.playVideosFullLength
  ) {
    return
  }

  const baseMs = state.transitionMs ?? 5000
  const ms = Math.min(10000, Math.max(500, baseMs))

  rotationTimer = setTimeout(() => {
    const next = computeNextScene()
    if (next !== null) {
      setCurrentScene(next.id, "timer")
    }

    // danach wieder neu planen, solange isPlaying true ist
    scheduleRotation()
  }, ms)
}

function broadcastStateWithReason(reason: StateUpdateReason): void {
  const payload = JSON.stringify({
    type: "STATE_UPDATE",
    payload: state,
    meta: { reason },
  })

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload)
    }
  })
}

function setCurrentScene(
  id: number | null,
  reason: StateUpdateReason = "manual",
): void {
  state = {
    ...state,
    currentSceneId: id,
    sceneStartedAt: id !== null ? Date.now() : null,
  }

  broadcastStateWithReason(reason)
  scheduleRotation()
}

wss.on("connection", (ws) => {
  ws.send(
    JSON.stringify({
      type: "STATE_UPDATE",
      payload: state,
      meta: { reason: "sync" },
    }),
  )

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString())
      console.log("[ws] message from client:", msg)

      switch (msg.type) {
        case "SET_STATE": {
          const prevIsPlaying = state.isPlaying
          const patch = (msg.payload || {}) as Partial<PlayerState>

          // Wenn ein Client die Szene umstellt, muss sceneStartedAt neu gesetzt werden.
          if (
            typeof patch.currentSceneId === "number" ||
            patch.currentSceneId === null
          ) {
            const nextId = patch.currentSceneId

            // Rest-Patch ohne currentSceneId anwenden
            const { currentSceneId: _ignore, ...rest } = patch
            state = { ...state, ...rest }

            if (nextId !== state.currentSceneId) {
              setCurrentScene(nextId, "manual")
              break
            }

            // keine Scene-Änderung → optional sceneStartedAt setzen, wenn wir von Pause -> Play wechseln
            if (prevIsPlaying === false && state.isPlaying === true && state.currentSceneId !== null) {
              state = { ...state, sceneStartedAt: Date.now() }
            }

            broadcastStateWithReason("manual")
            scheduleRotation()
            break
          }

          state = { ...state, ...patch }

          // wenn wir von Pause -> Play wechseln, soll die Display-View ab diesem Zeitpunkt synchron starten
          if (prevIsPlaying === false && state.isPlaying === true && state.currentSceneId !== null) {
            state = { ...state, sceneStartedAt: Date.now() }
          }

          broadcastStateWithReason("manual")
          scheduleRotation()
          break
        }

        case "SET_SCENE": {
          const sceneId = msg.payload?.sceneId
          if (typeof sceneId === "number") {
            setCurrentScene(sceneId, "manual")
          }
          break
        }

        case "NEXT_SCENE": {
          const nextScene = computeNextScene()
          if (nextScene !== null) {
            setCurrentScene(nextScene.id, "video-ended")
          }
          break
        }
      }
    } catch (err) {
      console.error("[ws] error handling message:", err)
    }
  })

  ws.on("close", () => {
    console.log("[ws] client disconnected")
  })

  console.log("[ws] client connected")
})

// ===================
// HILFSFUNKTION: Scene → API-Response
// ===================

function sceneToResponse(scene: SceneModel) {
  return {
    ...scene,
    // komplette Medien-URL für Frontend (SceneMedia.vue erwartet scene.url)
    url: `/images/${scene.filename}`,
  }
}

// ===================
// API ROUTES
// ===================

// Szenen-Liste
app.get("/api/scenes", (_req: Request, res: Response) => {
  res.json(scenes.map(sceneToResponse))
})

// Upload von Bildern/Videos (mehrere Dateien pro Request)
app.post(
  "/api/scenes/upload",
  upload.array("files"),
  async (req: Request, res: Response) => {
    try {
      console.log("[upload] incoming request…")

      const files = (req as any).files as Express.Multer.File[] | undefined

      if (!files || files.length === 0) {
        console.warn("[upload] keine Dateien erhalten")
        res.status(400).json({ error: "Keine Dateien hochgeladen." })
        return
      }

      console.log("[upload] number of files received:", files.length)

      const created: SceneModel[] = []

      for (const file of files) {
        console.log(
          "[upload] file received:",
          file.originalname,
          "->",
          file.filename,
          "size:",
          file.size,
        )

        // Thumbnail + Scene anlegen (zentral in scenes.ts + thumbnails.ts)
        let scene = await addSceneFromFilename(file.filename)

        // Falls der Titel noch der technische Dateiname ist → auf Originalnamen setzen
        if (!scene.title || scene.title === scene.filename) {
          const updated = updateScene(scene.id, {
            title: file.originalname,
          })

          if (updated !== null) {
            scene = updated
          }
        }

        created.push(scene)

        if (state.currentSceneId === null) {
          setCurrentScene(scene.id, "manual")
        }

        console.log("[upload] scene created with id:", scene.id)
      }

      // Für mehrere Dateien geben wir ein Array von Szenen zurück
      res.status(201).json(created.map(sceneToResponse))
    } catch (err) {
      console.error("[upload] error:", err)
      res.status(500).json({ error: "Upload fehlgeschlagen." })
    }
  },
)

// Szene aktualisieren (z. B. visible)
app.patch("/api/scenes/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!id) {
    return res.status(400).json({ error: "Ungültige ID" })
  }

  const partial = req.body as Partial<SceneModel>
  const updated = updateScene(id, partial)
  if (!updated) {
    return res.status(404).json({ error: "Scene nicht gefunden" })
  }

  // Thumbnails werden zentral in scenes/thumbnails erzeugt,
  // hier müssen wir nichts mehr nachpflegen.
  res.json(sceneToResponse(updated))
})

// Szene löschen
app.delete("/api/scenes/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!id) {
    return res.status(400).json({ error: "Ungültige ID" })
  }

  const removed = removeScene(id)
  if (!removed) {
    return res.status(404).json({ error: "Scene nicht gefunden" })
  }

  const filePath = path.join(imagesDir, removed.filename)
  if (isRealFile(filePath)) {
    fs.unlinkSync(filePath)
  }

  const thumbPath = getThumbnailPath(removed)
  if (isRealFile(thumbPath)) {
    fs.unlinkSync(thumbPath)
  }

  const optimizedPath = getOptimizedPath(removed)
  if (isRealFile(optimizedPath)) {
    fs.unlinkSync(optimizedPath)
  }

  if (scenes.length === 0) {
    state.currentSceneId = null
    state.sceneStartedAt = null
    state.isPlaying = false
    clearRotationTimer()
    broadcastStateWithReason("manual")
  }

  res.json({ ok: true })
})

// Root
app.get("/", (_req: Request, res: Response) => {
  res.send("ImageDisplayer Backend läuft.")
})

// ===================
// START
// ===================

const PORT = 4000

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] listening on http://0.0.0.0:${PORT}`)
})
