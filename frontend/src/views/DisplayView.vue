<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue"
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

let unsubscribe: (() => void) | null = null

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

// --- WS-STATE ---
function handleStateUpdate(s: PlayerState): void {
  state.value = { ...s }

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
  connectWs()
  void loadScenes()
  unsubscribe = onStateChange(handleStateUpdate)

  // Back-Button nach Mount automatisch ausblenden
  scheduleHideBackButton()
})

onBeforeUnmount(() => {
  if (unsubscribe) {
    unsubscribe()
  }
  if (hideBackButtonTimeoutId.value !== null) {
    window.clearTimeout(hideBackButtonTimeoutId.value)
    hideBackButtonTimeoutId.value = null
  }
})

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
               bg-white/85 border border-slate-200/80
               shadow-[0_16px_40px_rgba(15,23,42,0.65)]
               backdrop-blur-md flex items-center justify-center
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

    <div class="w-full h-full flex items-center justify-center">
      <SceneMedia
        :scene="currentScene"
        mode="display"
        :play-videos-full-length="!!state?.playVideosFullLength"
        @requestNext="handleRequestNext"
      />
    </div>
  </div>
</template>
