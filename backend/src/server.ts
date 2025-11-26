// backend/src/server.ts
import express, { Request, Response, NextFunction } from "express"
import http from "http"
import WebSocket, { WebSocketServer } from "ws"
import path from "path"
import fs from "fs"
import multer from "multer"
import sharp from "sharp"
import { execFile } from "child_process"
import { promisify } from "util"

import {
  scenes,
  addScene,
  removeScene,
  updateScene,
  Scene as SceneModel,
} from "./scenes"

const execFileAsync = promisify(execFile)

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

app.use("/images", express.static(imagesDir))

// ===================
// TYPES
// ===================
type PlayMode = "sequential" | "random"

interface PlayerState {
  isPlaying: boolean
  currentSceneId: number | null
  mode: PlayMode
  transitionMs: number
  playVideosFullLength: boolean
}

// ===================
// THUMBNAIL-HELPER
// ===================

function getThumbnailPath(scene: SceneModel): string {
  const baseName = path.parse(scene.filename).name
  return path.join(thumbDir, `${baseName}.jpg`)
}

function getThumbnailUrl(scene: SceneModel): string {
  const baseName = path.parse(scene.filename).name
  return `/images/thumbnails/${baseName}.jpg`
}

function isRealFile(p: string): boolean {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile()
  } catch {
    return false
  }
}

async function createImageThumbnail(scene: SceneModel): Promise<boolean> {
  const src = path.join(imagesDir, scene.filename)
  const dst = getThumbnailPath(scene)

  if (!isRealFile(src)) {
    console.warn("[thumbs] Quelle ist keine Datei (image):", src)
    return false
  }

  try {
    await sharp(src)
      .rotate() // EXIF-Orientation fixen
      .resize(480, 360, { fit: "cover" })
      .jpeg({ quality: 80 })
      .toFile(dst)

    return true
  } catch (err) {
    console.error("[thumbs] Fehler bei Image-Thumbnail:", err)
    return false
  }
}

async function createVideoThumbnail(scene: SceneModel): Promise<boolean> {
  const src = path.join(imagesDir, scene.filename)
  const dst = getThumbnailPath(scene)

  if (!isRealFile(src)) {
    console.warn("[thumbs] Quelle ist keine Datei (video):", src)
    return false
  }

  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-ss",
      "00:00:01",
      "-i",
      src,
      "-frames:v",
      "1",
      "-vf",
      "scale=480:360:force_original_aspect_ratio=decrease",
      dst,
    ])
    return true
  } catch (err) {
    console.error("[thumbs] Fehler bei Video-Thumbnail:", err)
    return false
  }
}

async function ensureThumbnail(scene: SceneModel): Promise<void> {
  const thumbPath = getThumbnailPath(scene)

  if (isRealFile(thumbPath)) {
    scene.thumbnailUrl = getThumbnailUrl(scene)
    return
  }

  let ok = false
  if (scene.type === "image") {
    ok = await createImageThumbnail(scene)
  } else if (scene.type === "video") {
    ok = await createVideoThumbnail(scene)
  }

  if (ok) {
    scene.thumbnailUrl = getThumbnailUrl(scene)
  }
}

async function initThumbnails() {
  let withThumb = 0
  for (const scene of scenes) {
    await ensureThumbnail(scene)
    if (scene.thumbnailUrl) {
      withThumb++
    }
  }
  console.log(
    `[server] Thumbnails initialisiert (${scenes.length} Szenen, ${withThumb} mit Thumbnail)`,
  )
}

// ===================
// MULTER (UPLOAD)
// ===================

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, imagesDir)
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname)
      const base = path.basename(file.originalname, ext)
      const safeBase = base.replace(/[^a-zA-Z0-9_\-]/g, "_")
      const finalName = `${Date.now()}_${safeBase}${ext}`
      cb(null, finalName)
    },
  }),
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
}

function broadcastState() {
  const payload = JSON.stringify({
    type: "STATE_UPDATE",
    payload: state,
  })
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload)
    }
  })
}

function setCurrentScene(id: number | null) {
  state = { ...state, currentSceneId: id }
  broadcastState()
}

wss.on("connection", (ws) => {
  ws.send(
    JSON.stringify({
      type: "STATE_UPDATE",
      payload: state,
    }),
  )

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString())
      console.log("[ws] message from client:", msg)

      switch (msg.type) {
        case "SET_STATE": {
          state = { ...state, ...(msg.payload || {}) }
          broadcastState()
          break
        }
        case "SET_SCENE": {
          const sceneId = msg.payload?.sceneId
          if (typeof sceneId === "number") {
            setCurrentScene(sceneId)
          }
          break
        }
        case "NEXT_SCENE": {
          const visibleScenes = scenes.filter((s) => s.visible ?? true)
          if (!visibleScenes.length) {
            break
          }
          const currentId = state.currentSceneId
          const idx = visibleScenes.findIndex((s) => s.id === currentId)
          let nextScene: SceneModel

          if (state.mode === "random") {
            const randomIndex = Math.floor(
              Math.random() * visibleScenes.length,
            )
            nextScene = visibleScenes[randomIndex]
          } else {
            const nextIndex =
              idx === -1 || idx === visibleScenes.length - 1 ? 0 : idx + 1
            nextScene = visibleScenes[nextIndex]
          }
          setCurrentScene(nextScene.id)
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
    // komplette Medien-URL für Frontend (SceneMedia.vue erwartet vermutlich scene.url)
    url: `/images/${scene.filename}`,
  }
}

// ===================
// API ROUTES
// ===================

// Szenen-Liste
app.get("/api/scenes", (req: Request, res: Response) => {
  res.json(scenes.map(sceneToResponse))
})

// Upload von Bildern/Videos
app.post(
  "/api/scenes/upload",
  upload.array("files"),
  async (req: Request, res: Response) => {
    try {
      const files = (req as any).files as Express.Multer.File[]
      if (!files || !files.length) {
        return res.status(400).json({ error: "Keine Dateien hochgeladen." })
      }

      const created: SceneModel[] = []

      for (const file of files) {
        const lower = file.filename.toLowerCase()
        const isVideo = /\.(mp4|mov|m4v|webm)$/i.test(lower)

        const sceneInput: Omit<SceneModel, "id"> = {
          filename: file.filename,
          title: file.originalname,
          description: "",
          type: isVideo ? "video" : "image",
          visible: true,
          thumbnailUrl: undefined,
        }

        const newScene = addScene(sceneInput)
        await ensureThumbnail(newScene)
        created.push(newScene)
      }

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

  if (!updated.thumbnailUrl) {
    await ensureThumbnail(updated)
    saveScenes()
  }

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

  res.json({ ok: true })
})

// Root
app.get("/", (req: Request, res: Response) => {
  res.send("ImageDisplayer Backend läuft.")
})

// Szenen inkl. thumbnailUrl persistieren (optional)
function saveScenes() {
  try {
    const dataFile = path.join(__dirname, "..", "data", "scenes.json")
    const dir = path.dirname(dataFile)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(dataFile, JSON.stringify(scenes, null, 2), "utf8")
  } catch (err) {
    console.error("[server] Failed to save scenes.json:", err)
  }
}

// ===================
// START
// ===================

const PORT = 4000

;(async () => {
  await initThumbnails()
  server.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`)
  })
})()