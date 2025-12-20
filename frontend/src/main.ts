import { createApp } from "vue"
import "./assets/tailwind.css"
import "./style.css"
import App from "./App.vue"
import { router } from "./router"

const APP_VERSION = "0.5.1" // neue Version setzen

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

function applyRouteChrome(to: any) {
  const isDisplayRoute = to.name === "display"
  const isControlRoute = to.name === "control"

  const root = document.documentElement

  if (isDisplayRoute) {
    root.style.setProperty("--statusbar-bg", "#000000")
  } else if (isControlRoute) {
    root.style.setProperty("--statusbar-bg", "#287ffd")
  }

  // optional weiterhin theme-color (schadet nicht)
  const theme = isDisplayRoute ? "#000000" : "#287ffd"
  let themeTag = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
  if (!themeTag) {
    themeTag = document.createElement("meta")
    themeTag.setAttribute("name", "theme-color")
    document.head.appendChild(themeTag)
  }
  themeTag.setAttribute("content", theme)
}

  // 🔹 Dynamische theme-color + iOS statusbar je nach Route
  router.afterEach((to) => {
    applyRouteChrome(to)
  })

  // Beim initialen Load sicher anwenden
  router.isReady().then(() => {
    applyRouteChrome(router.currentRoute.value)
  })

  // iOS Back/Forward Cache: häufigster Grund fürs "bleibt schwarz"
  window.addEventListener("pageshow", () => {
    applyRouteChrome(router.currentRoute.value)
  })

  // Wenn App aus dem Hintergrund zurückkommt
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      applyRouteChrome(router.currentRoute.value)
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
