import { createApp } from "vue"
import "./assets/tailwind.css"
import "./style.css"
import App from "./App.vue"
import { router } from "./router"

const APP_VERSION = "0.4.46" // neue Version setzen

let lastTouchEnd = 0

document.addEventListener(
  "touchend",
  (event) => {
    const now = Date.now()

    // Wenn zwei Touchend-Events sehr nah beieinander liegen → Double-Tap
    if (now - lastTouchEnd <= 300) {
      event.preventDefault()
    }

    lastTouchEnd = now
  },
  { passive: false },
)

const url = new URL(window.location.href)

if (url.searchParams.get("v") !== APP_VERSION) {
  url.searchParams.set("v", APP_VERSION)
  window.location.replace(url.toString())
  // danach nicht weiter initialisieren
} else {
  const app = createApp(App)

  // 🔹 Dynamische theme-color + body background je nach Route
  router.afterEach((to) => {
    const themeMeta = document.querySelector(
      'meta[name="theme-color"]'
    ) as HTMLMetaElement | null

    const isDisplayRoute = to.name === "display" // ggf. anpassen!

    // Navbar / Browser-Leiste einfärben
    if (themeMeta) {
      if (isDisplayRoute) {
        // Display → schwarz
        themeMeta.setAttribute("content", "#000000")
      } else {
        // Rest → dein Blau
        themeMeta.setAttribute("content", "#287ffd")
      }
    }

    // 🔸 Body-Background je nach Route setzen
    const body = document.body

    if (isDisplayRoute) {
      body.style.backgroundColor = "#000000"
      body.style.color = "#ffffff" // optional, falls nötig
    } else {
      // Hier deine Standard-Hintergrundfarbe aus dem CSS
      body.style.backgroundColor = "#287ffd"
      body.style.color = "" // zurücksetzen
    }
  })

  app.use(router)
  app.mount("#app")

  // Service Worker registrieren (optional nur in PROD)
  if ("serviceWorker" in navigator /* && import.meta.env.PROD */) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/service-worker.js")
        .catch((err) => {
          console.error("[SW] registration failed:", err)
        })
    })
  }
}