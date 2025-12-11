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

const timerId = ref<number | null>(null)
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

  const found = visibleScenes.value.find((s) => {
    return s.id === state.value!.currentSceneId
  })

  if (!found) {
    return null
  }

  return found
})

// --- Back-Button Sichtbarkeit + Timer ---
const showBackButton = ref(true)
const hideBackButtonTimeoutId = ref<number | null>(null)

// Double-Tap / Double-Click
const lastTapTime = ref<number | null>(null)

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

function handleTap(): void {
  const now = Date.now()

  if (lastTapTime.value !== null && now - lastTapTime.value < 350) {
    lastTapTime.value = null
    goBackToControl()
    return
  }

  lastTapTime.value = now
  handleUserInteraction()
}

// --- Szenen laden / Player-Logik ---
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

function clearTimer(): void {
  if (timerId.value !== null) {
    window.clearTimeout(timerId.value)
    timerId.value = null
  }
}

function scheduleNextByTimer(): void {
  clearTimer()

  if (state.value === null) {
    return
  }

  if (!state.value.isPlaying) {
    return
  }

  const scene = currentScene.value
  const ms = Math.min(10000, Math.max(0, state.value.transitionMs ?? 5000))

  if (scene && scene.type === "video" && state.value.playVideosFullLength) {
    return
  }

  timerId.value = window.setTimeout(() => {
    sendMessage({ type: "NEXT_SCENE" })
    scheduleNextByTimer()
  }, ms)
}

function handleStateUpdate(s: PlayerState): void {
  const prev = state.value
  state.value = { ...s }

  if (
    (state.value.currentSceneId === null ||
      state.value.currentSceneId === undefined) &&
    visibleScenes.value.length > 0
  ) {
    const first = visibleScenes.value[0]

    if (!first) {
      return
    }

    sendMessage({ type: "SET_SCENE", payload: { sceneId: first.id } })
    return
  }

  const relevantChanged =
    !prev ||
    prev.currentSceneId !== s.currentSceneId ||
    prev.transitionMs !== s.transitionMs ||
    prev.isPlaying !== s.isPlaying ||
    prev.playVideosFullLength !== s.playVideosFullLength

  if (relevantChanged) {
    scheduleNextByTimer()
  }
}

onMounted(() => {
  connectWs()
  void loadScenes()
  unsubscribe = onStateChange(handleStateUpdate)

  // Back-Button nach Mount automatisch ausblenden
  scheduleHideBackButton()
})

onBeforeUnmount(() => {
  clearTimer()

  if (unsubscribe) {
    unsubscribe()
  }

  if (hideBackButtonTimeoutId.value !== null) {
    window.clearTimeout(hideBackButtonTimeoutId.value)
    hideBackButtonTimeoutId.value = null
  }
})

function handleRequestNext(): void {
  sendMessage({ type: "NEXT_SCENE" })
}

function goBackToControl(): void {
  router.push("/")
}
</script>

<template>
  <div
    class="relative w-screen h-screen bg-black flex items-center justify-center overflow-hidden"
    @click="handleTap"
    @touchstart.passive="handleTap"
  >
    <!-- Icon-Only Back/Control Button (auto-hide, unten rechts) -->
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
        <!-- Minimize / Exit-Fullscreen Icon -->
        <svg
          viewBox="0 0 24 24"
          class="w-4 h-4 inline-block -rotate-270"
          aria-hidden="true"
        >
          <!-- Rahmen / „Screen“ -->
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
          <!-- Pfeil nach unten (Minimize / Zurück) -->
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

    <div class="w-full h-full flex items-center justify-center py-4 md:py-6">
      <SceneMedia
        :scene="currentScene"
        mode="display"
        :play-videos-full-length="!!state?.playVideosFullLength"
        @requestNext="handleRequestNext"
      />
    </div>
  </div>
</template>