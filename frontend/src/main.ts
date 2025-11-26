import { createApp } from "vue"
import "./assets/tailwind.css"   // unser Tailwind
import "./style.css"             // optional: die Vite-Standardstyles, kannst du auch weglassen
import App from "./App.vue"
import { router } from "./router"

const app = createApp(App)

app.use(router)
app.mount("#app")