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

const visibleScenes = computed(() =>
  scenes.value.filter((s) => s.visible ?? true),
)

const currentScene = computed<Scene | null>(() => {
  if (!state.value) {
    return null
  }

  return (
    visibleScenes.value.find(
      (s) => s.id === state.value!.currentSceneId,
    ) ?? null
  )
})

// --- Back-Button Sichtbarkeit + Timer ---
const showBackButton = ref(true)
const hideBackButtonTimeoutId = ref<number | null>(null)

function scheduleHideBackButton() {
  if (hideBackButtonTimeoutId.value !== null) {
    window.clearTimeout(hideBackButtonTimeoutId.value)
    hideBackButtonTimeoutId.value = null
  }

  hideBackButtonTimeoutId.value = window.setTimeout(() => {
    showBackButton.value = false
    hideBackButtonTimeoutId.value = null
  }, 3000)
}

function handleUserInteraction() {
  if (!showBackButton.value) {
    showBackButton.value = true
  }

  scheduleHideBackButton()
}

// --- Szenen laden / Player-Logik ---
async function loadScenes() {
  loading.value = true
  error.value = null

  try {
    const res = await fetch(`${API_BASE}/api/scenes`)

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }

    scenes.value = (await res.json()) as Scene[]
  } catch (e: any) {
    console.error(e)
    error.value = e?.message ?? "Fehler beim Laden der Szenen."
  } finally {
    loading.value = false
  }
}

function clearTimer() {
  if (timerId.value !== null) {
    clearTimeout(timerId.value)
    timerId.value = null
  }
}

function scheduleNextByTimer() {
  clearTimer()

  if (!state.value) {
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

function handleStateUpdate(s: PlayerState) {
  const prev = state.value
  state.value = { ...s }

  if (state.value?.currentSceneId == null && visibleScenes.value.length > 0) {
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

function handleRequestNext() {
  sendMessage({ type: "NEXT_SCENE" })
}

function goBackToControl() {
  router.push("/")
}
</script>

<template>
  <div
    class="relative w-screen h-screen bg-black flex items-center justify-center overflow-hidden"
    @click="handleUserInteraction"
    @touchstart.passive="handleUserInteraction"
  >
    <!-- Icon-Only Back/Control Button (auto-hide) -->
    <Transition name="back-btn-fade">
      <button
        v-if="showBackButton"
        type="button"
        class="absolute top-4 left-4 z-50 w-10 h-10 rounded-full 
               bg-white/85 border border-slate-200/80 
               shadow-[0_12px_30px_rgba(15,23,42,0.55)] 
               backdrop-blur-md flex items-center justify-center 
               text-slate-800 active:scale-95 transition"
        @click.stop="goBackToControl"
        aria-label="Zurück zur Control View"
      >
        <!-- kleines Fenster-Icon mit Pfeil nach links -->
        <svg
          viewBox="0 0 24 24"
          class="w-4 h-4"
          aria-hidden="true"
        >
          <!-- Window -->
          <rect
            x="9"
            y="6"
            width="9"
            height="12"
            rx="2"
            ry="2"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
          />
          <!-- Arrow Left -->
          <path
            d="M6 12h6"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
          <path
            d="M8.5 9.5L6 12l2.5 2.5"
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
