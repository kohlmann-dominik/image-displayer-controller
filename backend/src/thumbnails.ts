import fs from "fs"
import path from "path"
import { execFile } from "child_process"
import sharp from "sharp"

const imagesDir = path.join(__dirname, "..", "public", "images")
const thumbsDir = path.join(imagesDir, "thumbnails")

if (!fs.existsSync(thumbsDir)) {
  fs.mkdirSync(thumbsDir, { recursive: true })
}

export async function generateThumbnail(
  filepath: string,
  isVideo: boolean,
): Promise<string | null> {
  const filename = path.basename(filepath)
  const thumbName = filename.replace(path.extname(filename), ".jpg")
  const thumbPath = path.join(thumbsDir, thumbName)

  // Falls bereits existiert → zurückgeben
  if (fs.existsSync(thumbPath)) {
    return `/images/thumbnails/${thumbName}`
  }

  if (isVideo === false) {
    // -------------------------
    // IMAGE → SHARP THUMBNAIL
    // -------------------------
    try {
      await sharp(filepath)
        .resize(480, 360, { fit: "inside" })
        .jpeg({ quality: 85 })
        .toFile(thumbPath)

      return `/images/thumbnails/${thumbName}`
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : String(err)

      console.error(
        "[thumbnail] sharp error for",
        filepath,
        "-",
        message,
      )

      // Typischer Fall: HEIC/HEIF wird von diesem sharp/libvips-Build nicht unterstützt.
      // → nur warnen, Thumbnail überspringen, aber Szene trotzdem verwenden.
      if (
        message.includes("heif") === true ||
        message.includes("HEIC") === true ||
        message.includes("heic") === true
      ) {
        console.warn(
          "[thumbnail] HEIC/HEIF scheint in diesem sharp/libvips-Build nicht unterstützt zu sein. Thumbnail wird übersprungen.",
        )
      }

      return null
    }
  }

  // -------------------------
  // VIDEO → FFMPEG THUMBNAIL
  // -------------------------
  return new Promise((resolve) => {
    execFile(
      "ffmpeg",
      [
        "-y",
        "-ss",
        "00:00:01",
        "-i",
        filepath,
        "-frames:v",
        "1",
        "-vf",
        "scale=480:360:force_original_aspect_ratio=decrease",
        thumbPath,
      ],
      (err) => {
        if (err) {
          console.error("[thumbnail] ffmpeg error:", err)
          resolve(null)
          return
        }

        resolve(`/images/thumbnails/${thumbName}`)
      },
    )
  })
}
