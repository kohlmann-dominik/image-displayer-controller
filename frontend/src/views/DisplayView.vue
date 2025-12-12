<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue"
import { useRouter } from "vue-router"
import type { PlayerState, Scene } from "../types"
import { API_BASE } from "../config"
import { connectWs, onStateChange, sendMessage } from "../ws"
import SceneMedia from "../components/SceneMedia.vue"

const router = useRouter()

const state = ref<PlayerState | null>(null)
const scenes = ref<Scene[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const isWsReady = ref(false)

let unsubscribe: (() => void) | null = null

let prevHtmlBg = ""
let prevBodyBg = ""
let prevBodyColor = ""
let prevThemeColor = ""

function setThemeColor(color: string) {
  const el = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
  if (el) {
    el.setAttribute("content", color)
  }
}

const visibleScenes = computed(() => {
  return scenes.value.filter((s) => {
    if (s.visible === undefined || s.visible === null) {
      return true
    }
    return s.visible
  })
})

const currentScene = computed<Scene | null>(() => {
  if (state.value === null) {
    return null
  }
  const found = visibleScenes.value.find(
    (s) => s.id === state.value!.currentSceneId,
  )
  return found ?? null
})

// --- Back-Button Sichtbarkeit + Timer ---
const showBackButton = ref(true)
const hideBackButtonTimeoutId = ref<number | null>(null)

// Double-Tap / Double-Click
const lastTapTime = ref<number | null>(null)
const lastTouchTime = ref<number | null>(null)
const lastInputWasTouch = ref(false)

function scheduleHideBackButton(): void {
  if (hideBackButtonTimeoutId.value !== null) {
    window.clearTimeout(hideBackButtonTimeoutId.value)
    hideBackButtonTimeoutId.value = null
  }

  hideBackButtonTimeoutId.value = window.setTimeout(() => {
    showBackButton.value = false
    hideBackButtonTimeoutId.value = null
  }, 3000)
}

function handleUserInteraction(): void {
  if (!showBackButton.value) {
    showBackButton.value = true
  }
  scheduleHideBackButton()
}

function handleTap(event: MouseEvent | TouchEvent): void {
  const now = Date.now()

  // 1) Quelle erkennen: Touch oder Click?
  if (event.type === "touchstart") {
    lastInputWasTouch.value = true
    lastTouchTime.value = now
  } else if (event.type === "click") {
    // synthetischen Click nach Touch ignorieren
    if (
      lastInputWasTouch.value &&
      lastTouchTime.value !== null &&
      now - lastTouchTime.value < 500
    ) {
      return
    }
    lastInputWasTouch.value = false
  }

  // 2) Double-Tap erkennen
  if (lastTapTime.value !== null && now - lastTapTime.value < 350) {
    lastTapTime.value = null
    goBackToControl()
    return
  }

  lastTapTime.value = now

  // 3) Normaler Tap → Back-Button zeigen / Timer resetten
  handleUserInteraction()
}

// --- Szenen laden ---
async function loadScenes(): Promise<void> {
  loading.value = true
  error.value = null

  try {
    const res = await fetch(`${API_BASE}/api/scenes`)

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }

    const json = (await res.json()) as Scene[]
    scenes.value = json
  } catch (e: any) {
    console.error(e)
    error.value = e?.message ?? "Fehler beim Laden der Szenen."
  } finally {
    loading.value = false
  }
}

const resolveUrl = (raw?: string) => {
  if (!raw) {
    return ""
  }

  return raw.startsWith("http") ? raw : `${API_BASE}${raw}`
}

// Lokale Next-Scene-Berechnung (analog zur Control/Backend-Logik)
function computeNextSceneLocal(): Scene | null {
  const s = state.value
  const list = visibleScenes.value

  if (!s || list.length === 0) {
    return null
  }

  const mode = s.mode
  const currentId = s.currentSceneId
  const currentIndex = list.findIndex((sc) => sc.id === currentId)

  if (mode === "random") {
    if (list.length === 1) {
      return list[0] ?? null
    }

    let idx = currentIndex
    while (idx === currentIndex || idx === -1) {
      idx = Math.floor(Math.random() * list.length)
    }

    return list[idx] ?? null
  }

  // sequenziell
  if (currentIndex === -1) {
    return list[0] ?? null
  }

  const nextIndex = (currentIndex + 1) % list.length
  return list[nextIndex] ?? null
}

// Nur Bilder vorladen (Videos sind zu groß)
function preloadNextScene(): void {
  const next = computeNextSceneLocal()
  if (!next) {
    return
  }

  if (next.type !== "image") {
    return
  }

  const raw = next.optimizedUrl || next.url
  if (!raw) {
    return
  }

  const src = resolveUrl(raw)

  const img = new Image()
  img.src = src
}

// --- WS-STATE ---
function handleStateUpdate(s: PlayerState): void {
  const wasNull = state.value === null
  state.value = { ...s }

  if (wasNull) {
    // erster erfolgreicher State nach Mount/Reconnect → einmal sanft einblenden
    isWsReady.value = true
  }

  // Falls noch keine Szene gesetzt ist, aber sichtbare Szenen existieren → erste setzen
  if (
    (state.value.currentSceneId === null ||
      state.value.currentSceneId === undefined) &&
    visibleScenes.value.length > 0
  ) {
    const first = visibleScenes.value[0]
    if (first) {
      sendMessage({ type: "SET_SCENE", payload: { sceneId: first.id } })
    }
  }

  // Kein eigener Timer mehr nötig – Rotation läuft im Backend.
}

onMounted(() => {
  // iPadOS-Fix: html + body explizit schwarz setzen
  const html = document.documentElement
  const body = document.body

  prevHtmlBg = html.style.backgroundColor
  prevBodyBg = body.style.backgroundColor
  prevBodyColor = body.style.color

  const themeMeta = document.querySelector(
    'meta[name="theme-color"]'
  ) as HTMLMetaElement | null
  prevThemeColor = themeMeta?.getAttribute("content") ?? ""

  html.style.backgroundColor = "#000000"
  body.style.backgroundColor = "#000000"
  body.style.color = "#ffffff"

  setThemeColor("#000000")

  // bestehende Logik
  connectWs()
  void loadScenes()
  unsubscribe = onStateChange(handleStateUpdate)

  // Back-Button nach Mount automatisch ausblenden
  scheduleHideBackButton()
})

onBeforeUnmount(() => {
  // Farben sauber zurücksetzen
  const html = document.documentElement
  const body = document.body

  html.style.backgroundColor = prevHtmlBg
  body.style.backgroundColor = prevBodyBg
  body.style.color = prevBodyColor

  if (prevThemeColor) {
    setThemeColor(prevThemeColor)
  }

  // 🔵 bestehende Cleanup-Logik
  if (unsubscribe) {
    unsubscribe()
  }
  if (hideBackButtonTimeoutId.value !== null) {
    window.clearTimeout(hideBackButtonTimeoutId.value)
    hideBackButtonTimeoutId.value = null
  }
})
watch(
  () => [state.value?.currentSceneId, state.value?.mode, visibleScenes.value.length],
  () => {
    preloadNextScene()
  },
  { immediate: true },
)

function handleRequestNext(): void {
  // Nur für Videos mit playVideosFullLength (wird in SceneMedia gesteuert)
  sendMessage({ type: "NEXT_SCENE" })
}

function goBackToControl(): void {
  router.push("/")
}
</script>

<template>
  <div
    class="fixed inset-0 bg-black flex items-center justify-center overflow-hidden"
    @click="handleTap"
    @touchstart.passive="handleTap"
  >
    <Transition name="back-btn-fade">
      <button
        v-if="showBackButton"
        type="button"
        class="absolute bottom-4 right-4 z-50 w-11 h-11 rounded-full
               bg-white/50 border border-slate-200/65
               shadow-sm backdrop-blur-md flex items-center justify-center
               text-slate-900 active:scale-95 transition"
        @click.stop="goBackToControl"
        aria-label="Zurück zur Control View"
      >
        <svg viewBox="0 0 24 24" class="w-4 h-4 rotate-90" aria-hidden="true">
          <rect
            x="5"
            y="5"
            width="14"
            height="14"
            rx="2.5"
            ry="2.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
          />
          <path
            d="M12 9v5.2"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
          <path
            d="M9.75 12.8L12 15.05L14.25 12.8"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </Transition>

    <Transition name="fade-in" appear>
      <div
        v-if="isWsReady"
        class="w-full h-full flex items-center justify-center"
      >
        <SceneMedia
          :scene="currentScene"
          mode="display"
          :play-videos-full-length="!!state?.playVideosFullLength"
          :scene-started-at="state?.sceneStartedAt ?? null"
          @requestNext="handleRequestNext"
        />
      </div>
    </Transition>
  </div>
</template>