import { createApp } from "vue"
import "./assets/tailwind.css"   // unser Tailwind
import "./style.css"             // optional: die Vite-Standardstyles, kannst du auch weglassen
import App from "./App.vue"
import { router } from "./router"

// main.ts

// 1) Version anpassen, wenn du etwas Größeres änderst (CSS, Layout, Background etc.)
const APP_VERSION = "0.1.3"

const url = new URL(window.location.href)

// 2) Wenn die aktuelle URL noch nicht diese Version hat → auf dieselbe URL mit ?v=... umleiten
if (url.searchParams.get("v") !== APP_VERSION) {
  url.searchParams.set("v", APP_VERSION)
  window.location.replace(url.toString())
  // IMPORTANT: Danach nicht weiter initialisieren – der Reload lädt die neue Version
}

const app = createApp(App)

app.use(router)
app.mount("#app")