// backend/src/scenes.ts
import fs from "fs"
import path from "path"
import { generateThumbnail } from "./thumbnails"


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

function ensureImagesDir(): void {
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true })
  }
}

/**
 * Wird vom Upload-Endpoint verwendet, um sicher denselben Ordner zu nutzen.
 */
export function getImagesDir(): string {
  ensureImagesDir()
  return imagesDir
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

function saveScenesToFile(allScenes: Scene[]): void {
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
  if (scenes.length === 0) {
    return 1
  }

  return Math.max(...scenes.map((s) => s.id)) + 1
}

function detectTypeFromFilename(filename: string): "image" | "video" {
  const lower = filename.toLowerCase()
  if (/\.(mp4|mov|m4v|webm)$/i.test(lower)) {
    return "video"
  }

  return "image"
}

// Scenes mit Dateisystem synchronisieren
async function internalSyncScenesWithFilesystem(): Promise<void> {
  ensureImagesDir()

  const filesOnDisk = fs
    .readdirSync(imagesDir)
    .filter((f) => {
      if (f.startsWith(".")) return false
      const full = path.join(imagesDir, f)
      try { return fs.statSync(full).isFile() } catch { return false }
    })

  const fileSet = new Set(filesOnDisk)
  scenes = scenes.filter((s) => fileSet.has(s.filename))

  const knownFilenames = new Set(scenes.map((s) => s.filename))
  let nextId = getNextId()

  for (const file of filesOnDisk) {
    if (knownFilenames.has(file)) {
      // Bestehendes thumbnail fixen, falls fehlt
      const scene = scenes.find((s) => s.filename === file)!
      if (!scene.thumbnailUrl) {
        const fp = path.join(imagesDir, file)
        scene.thumbnailUrl =
          (await generateThumbnail(fp, scene.type === "video")) ?? undefined
      }
      continue
    }

    // Neue Szene
    const fullPath = path.join(imagesDir, file)
    const type = detectTypeFromFilename(file)

    const thumb = await generateThumbnail(fullPath, type === "video")

    const scene: Scene = {
      id: nextId++,
      filename: file,
      title: file,
      description: "",
      type,
      visible: true,
      thumbnailUrl: thumb ?? undefined,
    }

    scenes.push(scene)
  }

  saveScenesToFile(scenes)
}

/**
 * Optional von außen nutzbar, falls du nach vielen Änderungen
 * nochmal mit dem Dateisystem abgleichen willst.
 */
export async function syncScenesWithFilesystem(): Promise<void> {
  internalSyncScenesWithFilesystem()
}

// Beim Start direkt einmal synchronisieren
internalSyncScenesWithFilesystem().then(() => {
  console.log("[scenes] Sync complete (with thumbnails).")
})

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

/**
 * Helfer für Upload-Endpoints:
 * Legt (falls noch nicht vorhanden) eine Scene für eine hochgeladene Datei an.
 */
export async function addSceneFromFilename(filename: string): Promise<Scene> {
  ensureImagesDir()

  const existing = scenes.find((s) => s.filename === filename)
  if (existing) {
    return existing
  }

  const type = detectTypeFromFilename(filename)
  const fullPath = path.join(imagesDir, filename)

  // Thumbnail erzeugen
  const thumbnailUrl = await generateThumbnail(fullPath, type === "video")

  const scene: Scene = {
    id: getNextId(),
    filename,
    title: filename,
    description: "",
    type,
    visible: true,
    thumbnailUrl: thumbnailUrl ?? undefined,
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
