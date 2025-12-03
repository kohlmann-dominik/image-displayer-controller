<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue"
import type { PlayerState, Scene } from "../types"
import { API_BASE } from "../config"
import { connectWs, onStateChange, sendMessage } from "../ws"
import SceneMedia from "../components/SceneMedia.vue"

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
  return visibleScenes.value.find(
    (s) => s.id === state.value!.currentSceneId,
  ) ?? null
})

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

  // Wenn Video + "volle Länge" → kein Timer, Wechsel über @ended
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

  // Falls noch keine Szene gesetzt ist, aber sichtbare Szenen existieren:
if ((state.value?.currentSceneId == null) && visibleScenes.value.length > 0) {
  const first = visibleScenes.value[0]
  if (!first) {
    // sollte eigentlich nie passieren, aber TS ist dann zufrieden
    return
  }

  sendMessage({ type: "SET_SCENE", payload: { sceneId: first.id } })
  // Wir returnen hier, der nächste State-Update kommt sofort nach dem Backend-Update
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
  loadScenes()
  unsubscribe = onStateChange(handleStateUpdate)
})

onBeforeUnmount(() => {
  clearTimer()
  if (unsubscribe) {
    unsubscribe()
  }
})

function handleRequestNext() {
  // Wird von SceneMedia ausgelöst (z. B. Video fertig)
  sendMessage({ type: "NEXT_SCENE" })
}
</script>

<template>
  <div class="w-screen h-screen bg-black flex items-center justify-center overflow-hidden">
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