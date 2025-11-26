// backend/src/scenes.ts
import fs from "fs"
import path from "path"

export interface Scene {
  id: number
  filename: string
  title: string
  description: string
  type: "image" | "video"
  visible?: boolean
  thumbnailUrl?: string
}

// Pfade
const dataFile = path.join(__dirname, "..", "data", "scenes.json")
const imagesDir = path.join(__dirname, "..", "public", "images")

function ensureImagesDir() {
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true })
  }
}

function loadScenesFromFile(): Scene[] {
  try {
    if (!fs.existsSync(dataFile)) {
      return []
    }
    const raw = fs.readFileSync(dataFile, "utf8")
    const parsed = JSON.parse(raw) as any[]

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map((raw) => {
        if (!raw || typeof raw !== "object") {
          return null
        }

        const id = Number((raw as any).id)
        const filename = String((raw as any).filename ?? "")

        if (!id || !filename) {
          return null
        }

        const type: "image" | "video" =
          (raw as any).type === "video" ? "video" : "image"

        const visible =
          typeof (raw as any).visible === "boolean"
            ? (raw as any).visible
            : true

        const title =
          typeof (raw as any).title === "string"
            ? (raw as any).title
            : filename

        const description =
          typeof (raw as any).description === "string"
            ? (raw as any).description
            : ""

        const thumbnailUrl =
          typeof (raw as any).thumbnailUrl === "string"
            ? (raw as any).thumbnailUrl
            : undefined

        const scene: Scene = {
          id,
          filename,
          title,
          description,
          type,
          visible,
          thumbnailUrl,
        }

        return scene
      })
      .filter((s): s is Scene => !!s)
  } catch (err) {
    console.error("[scenes] Failed to load scenes.json:", err)
    return []
  }
}

function saveScenesToFile(allScenes: Scene[]) {
  try {
    const dir = path.dirname(dataFile)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(dataFile, JSON.stringify(allScenes, null, 2), "utf8")
  } catch (err) {
    console.error("[scenes] Failed to save scenes.json:", err)
  }
}

// Globale Scenes – Basis kommt aus scenes.json
export let scenes: Scene[] = loadScenesFromFile()

function getNextId(): number {
  return scenes.length ? Math.max(...scenes.map((s) => s.id)) + 1 : 1
}

// Scenes mit Dateisystem synchronisieren
function syncScenesWithFilesystem() {
  ensureImagesDir()

  // Nur echte Dateien (keine Verzeichnisse) aus imagesDir holen
  const filesOnDisk = fs
    .readdirSync(imagesDir)
    .filter((f) => {
      if (f.startsWith(".")) {
        return false
      }
      const fullPath = path.join(imagesDir, f)
      try {
        return fs.statSync(fullPath).isFile()
      } catch {
        return false
      }
    })

  const fileSet = new Set(filesOnDisk)

  // 1) Scenes entfernen, deren Dateien es nicht mehr gibt
  //    oder deren "filename" gar keine echte Datei ist (z. B. "thumbnails"-Ordner)
  scenes = scenes.filter((s) => fileSet.has(s.filename))

  // 2) Scenes für neue Dateien anlegen
  const knownFilenames = new Set(scenes.map((s) => s.filename))
  let nextId = getNextId()

  for (const file of filesOnDisk) {
    if (knownFilenames.has(file)) {
      continue
    }

    const lower = file.toLowerCase()
    const isVideo = /\.(mp4|mov|m4v|webm)$/i.test(lower)

    const scene: Scene = {
      id: nextId++,
      filename: file,
      title: file,
      description: "",
      type: isVideo ? "video" : "image",
      visible: true,
      // thumbnailUrl wird im Server bei Bedarf zur Laufzeit gesetzt
    }

    scenes.push(scene)
  }

  saveScenesToFile(scenes)
}

// Beim Start direkt einmal synchronisieren
syncScenesWithFilesystem()

// --- API-Funktionen für server.ts ---

export function addScene(input: Omit<Scene, "id">): Scene {
  const scene: Scene = {
    id: getNextId(),
    ...input,
  }
  scenes.push(scene)
  saveScenesToFile(scenes)
  return scene
}

export function removeScene(id: number): Scene | null {
  const idx = scenes.findIndex((s) => s.id === id)
  if (idx === -1) {
    return null
  }
  const [removed] = scenes.splice(idx, 1)
  saveScenesToFile(scenes)
  return removed
}

export function updateScene(
  id: number,
  partial: Partial<Scene>,
): Scene | null {
  const idx = scenes.findIndex((s) => s.id === id)
  if (idx === -1) {
    return null
  }

  const updated: Scene = {
    ...scenes[idx],
    ...partial,
  }

  scenes[idx] = updated
  saveScenesToFile(scenes)
  return updated
}