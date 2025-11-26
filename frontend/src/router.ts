import { createRouter, createWebHistory } from "vue-router"
import DisplayView from "./views/DisplayView.vue"
import ControlView from "./views/ControlView.vue"

const routes = [
  { path: "/", redirect: "/display" },
  { path: "/display", component: DisplayView },
  { path: "/control", component: ControlView },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})
