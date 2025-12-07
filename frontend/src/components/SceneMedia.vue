<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from "vue"
import type { Scene } from "../types"
import { API_BASE } from "../config"

const props = defineProps<{
  scene: Scene | null
  mode: "control-preview" | "modal-preview" | "display"
  playVideosFullLength: boolean
}>()

const emit = defineEmits<{
  (e: "requestNext"): void
}>()

const videoRef = ref<HTMLVideoElement | null>(null)

const isVideo = computed(() => {
  if (!props.scene) {
    return false
  }

  return props.scene.type === "video"
})

const srcUrl = computed(() => {
  if (!props.scene || !props.scene.url) {
    return ""
  }

  const url = props.scene.url

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url
  }

  return `${API_BASE}${url}`
})

type TransitionName =
  | "scene-fade"
  | "scene-slide"
  | "scene-zoom"
  | "scene-pan"
  | "scene-blur"
  | "scene-rotate"
  | "scene-kenburns"
  | "scene-pop"

const availableTransitions: TransitionName[] = [
  "scene-fade",
  "scene-slide",
  "scene-zoom",
  "scene-pan",
  "scene-blur",
  "scene-rotate",
  "scene-kenburns",
  "scene-pop",
]

const currentTransition = ref<TransitionName>("scene-fade")

function pickNextTransition() {
  // Nur im Display-Modus randomisieren, Preview/Modal bleiben bei Fade
  if (props.mode !== "display") {
    currentTransition.value = "scene-fade"
    return
  }

  if (availableTransitions.length === 0) {
    currentTransition.value = "scene-fade"
    return
  }

  const previous = currentTransition.value
  let next =
    availableTransitions[
      Math.floor(Math.random() * availableTransitions.length)
    ] ?? "scene-fade"

  if (next === previous && availableTransitions.length > 1) {
    const index = availableTransitions.indexOf(next)
    if (index >= 0) {
      const altIndex = (index + 1) % availableTransitions.length
      next = availableTransitions[altIndex] ?? "scene-fade"
    }
  }

  currentTransition.value = next
}

const transitionName = computed(() => {
  if (props.mode === "display") {
    return currentTransition.value
  }

  return "scene-fade"
})

const sceneKey = computed(() => {
  if (!props.scene) {
    return "empty"
  }

  return `${props.scene.id ?? "scene"}-${transitionName.value}`
})

function setupVideo() {
  const el = videoRef.value
  if (!el) {
    return
  }

  el.currentTime = 0

  const playPromise = el.play()
  if (playPromise && typeof playPromise.then === "function") {
    playPromise.catch(() => {
      // Autoplay-Blocker o. Ä. ignorieren
    })
  }
}

watch(
  () => props.scene?.id,
  (newId, oldId) => {
    if (newId !== oldId) {
      pickNextTransition()
    }

    if (!isVideo.value) {
      return
    }

    nextTick(() => {
      setupVideo()
    })
  },
)

onMounted(() => {
  pickNextTransition()

  if (isVideo.value) {
    setupVideo()
  }
})

onBeforeUnmount(() => {
  if (videoRef.value) {
    videoRef.value.pause()
  }
})

function handleEnded() {
  if (props.playVideosFullLength) {
    emit("requestNext")
  }
}
</script>

<template>
  <!-- ACHTUNG: hier kein "props.mode", sondern direkt "mode" -->
  <div
    :class="[
      mode === 'display'
        ? 'fixed inset-0 bg-black flex items-center justify-center'
        : 'w-full h-full bg-black flex items-center justify-center'
    ]"
  >
    <Transition :name="transitionName" mode="out-in">
      <div
        v-if="scene"
        :key="sceneKey"
        class="w-full h-full flex items-center justify-center"
      >
        <!-- IMAGE -->
        <template v-if="scene.type === 'image'">
          <img
            :src="srcUrl"
            class="w-full h-full object-contain"
            loading="lazy"
            decoding="async"
          />
        </template>

        <!-- VIDEO -->
        <template v-else>
          <video
            ref="videoRef"
            :src="srcUrl"
            class="w-full h-full object-contain"
            muted
            playsinline
            preload="auto"
            autoplay
            @ended="handleEnded"
          />
        </template>
      </div>

      <div
        v-else
        key="empty"
        class="text-white/60 text-sm"
      >
        Keine Szene ausgewählt
      </div>
    </Transition>
  </div>
</template>
