// backend/src/optimizedMedia.ts
import fs from "fs"
import path from "path"
import { execFile } from "child_process"
import sharp from "sharp"

const imagesDir = path.join(__dirname, "..", "public", "images")
const optimizedDir = path.join(imagesDir, "optimized")

if (!fs.existsSync(optimizedDir)) {
  fs.mkdirSync(optimizedDir, { recursive: true })
}

function getOptimizedVideoPath(inputPath: string): string {
  const base = path.basename(inputPath, path.extname(inputPath))
  return path.join(optimizedDir, `${base}.mp4`)
}

function getOptimizedImagePath(inputPath: string): string {
  const base = path.basename(inputPath, path.extname(inputPath))
  return path.join(optimizedDir, `${base}.jpg`)
}

function toPublicUrl(fullPath: string): string {
  const rel = path.relative(path.join(__dirname, "..", "public"), fullPath)
  return `/${rel.replace(/\\/g, "/")}`
}

/**
 * Video optimieren:
 *  - h.264
 *  - max 1920px Breite
 *  - sinnvolle Bitrate über CRF
 */
export async function ensureOptimizedVideo(
  inputPath: string,
): Promise<string | null> {
  if (!fs.existsSync(inputPath)) {
    return null
  }

  const outPath = getOptimizedVideoPath(inputPath)

  // Falls schon vorhanden & neuer als Original → wiederverwenden
  try {
    if (fs.existsSync(outPath)) {
      const srcStat = fs.statSync(inputPath)
      const outStat = fs.statSync(outPath)
      if (outStat.mtimeMs >= srcStat.mtimeMs) {
        return toPublicUrl(outPath)
      }
    }
  } catch {
    // ignore, zur Not neu bauen
  }

  return new Promise((resolve) => {
    execFile(
      "ffmpeg",
      [
        "-y",
        "-i",
        inputPath,
        "-vf",
        "scale='min(1920,iw)':-2",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "28",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        outPath,
      ],
      (err) => {
        if (err) {
          console.error("[optimized] ffmpeg error:", err)
          resolve(null)
          return
        }

        resolve(toPublicUrl(outPath))
      },
    )
  })
}

/**
 * Bild optimieren:
 *  - max 2560px Breite
 *  - JPEG mit ~80% Qualität
 *  - keine Vergrößerung
 */
export async function ensureOptimizedImage(
  inputPath: string,
): Promise<string | null> {
  if (!fs.existsSync(inputPath)) {
    return null
  }

  const outPath = getOptimizedImagePath(inputPath)

  try {
    if (fs.existsSync(outPath)) {
      const srcStat = fs.statSync(inputPath)
      const outStat = fs.statSync(outPath)
      if (outStat.mtimeMs >= srcStat.mtimeMs) {
        return toPublicUrl(outPath)
      }
    }
  } catch {
    // ignore
  }

  try {
    await sharp(inputPath)
      .rotate() // EXIF-Orientierung respektieren
      .resize(2560, null, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toFile(outPath)

    return toPublicUrl(outPath)
  } catch (err) {
    console.error("[optimized] sharp error:", err)
    return null
  }
}
