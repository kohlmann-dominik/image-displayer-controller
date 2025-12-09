import { createApp } from "vue"
import "./assets/tailwind.css"
import "./style.css"
import App from "./App.vue"
import { router } from "./router"

// 1) Version anpassen, wenn du etwas Größeres änderst (CSS, Layout, Background etc.)
const APP_VERSION = "0.1.9.5"

// zentrale Bootstrap-Funktion
function bootstrap(): void {
  const app = createApp(App)

  app.use(router)
  app.mount("#app")

  // Optional: Service Worker für PWA
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/service-worker.js")
        .catch((err) => {
          console.error("Service Worker registration failed:", err)
        })
    })
  }
}

const url = new URL(window.location.href)
const currentVersion = url.searchParams.get("v")

// 2) Wenn die aktuelle URL noch nicht diese Version hat → umleiten
if (currentVersion !== APP_VERSION) {
  url.searchParams.set("v", APP_VERSION)
  window.location.replace(url.toString())
} else {
  // gleiche Version → App normal starten
  bootstrap()
}