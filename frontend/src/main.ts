import { createApp } from "vue"
import "./assets/tailwind.css"
import "./style.css"
import App from "./App.vue"
import { router } from "./router"

const APP_VERSION = "0.2.7" // neue Version setzen

const url = new URL(window.location.href)

if (url.searchParams.get("v") !== APP_VERSION) {
  url.searchParams.set("v", APP_VERSION)
  window.location.replace(url.toString())
  // danach nicht weiter initialisieren
} else {
  const app = createApp(App)

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