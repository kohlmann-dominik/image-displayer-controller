import { createRouter, createWebHistory } from "vue-router"
import DisplayView from "./views/DisplayView.vue"
import ControlView from "./views/ControlView.vue"

const routes = [
  {
    path: "/",
    redirect: "/control",
  },
  {
    path: "/control",
    name: "control",
    component: ControlView,
  },
  {
    path: "/display",
    name: "display",
    component: DisplayView,
  },
  // Fallback: alles Unbekannte auf /control
  {
    path: "/:pathMatch(.*)*",
    redirect: "/control",
  },
]

export const router = createRouter({
  // sauber: respektiert Vite base (z.B. "/" oder "/displaycontroller/")
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})