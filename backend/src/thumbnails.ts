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

  if (!isVideo) {
    // -------------------------
    // IMAGE → SHARP THUMBNAIL
    // -------------------------
    try {
      await sharp(filepath)
        .resize(480, 360, { fit: "inside" })
        .jpeg({ quality: 85 })
        .toFile(thumbPath)

      return `/images/thumbnails/${thumbName}`
    } catch (err) {
      console.error("[thumbnail] sharp error:", err)
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
        "-ss", "00:00:01",
        "-i", filepath,
        "-frames:v", "1",
        "-vf", "scale=480:360:force_original_aspect_ratio=decrease",
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
