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
  (e: "requestFullscreenDisplay"): void
}>()

const videoRef = ref<HTMLVideoElement | null>(null)

const mediaClass = computed(() => {
  if (props.mode === "control-preview") {
    // Preview-Panel: Bild/Video möglichst vollständig sichtbar, leicht eingepasst
    return "w-full h-full object-contain"
  }

  if (props.mode === "modal-preview") {
    // Modal: Bild soll möglichst vollständig sichtbar bleiben
    return "modal-media-frame max-h-[80vh] max-w-full h-auto w-auto object-contain"
  }

  // DISPLAY (Vollbild): Bild/Videos sollen in den Screen passen
  return "w-full h-full object-contain"
})

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
  <div
    :class="[
      mode === 'display'
        ? 'fixed inset-0 bg-black flex items-center justify-center'
        : 'w-full h-full flex items-center justify-center'
    ]"
  >
    <!-- ========================================================= -->
    <!-- CONTROL-PREVIEW: ohne Transition, mit eigenem Fullscreen-Button -->
    <!-- ========================================================= -->
    <template v-if="mode === 'control-preview'">
      <div class="relative w-full h-full flex items-center justify-center">
        <!-- IMAGE -->
        <template v-if="scene && scene.type === 'image'">
          <img
            :src="srcUrl"
            :class="mediaClass"
            loading="lazy"
            decoding="async"
          />
        </template>

        <!-- VIDEO -->
        <template v-else-if="scene && scene.type === 'video'">
          <video
            ref="videoRef"
            :src="srcUrl"
            :class="mediaClass"
            muted
            playsinline
            preload="auto"
            autoplay
            @ended="handleEnded"
          />
        </template>

        <template v-else>
          <div class="text-white/60 text-sm">
            Keine Szene ausgewählt
          </div>
        </template>

        <!-- Dezenter Fullscreen-Button (öffnet Display-Route) -->
        <button
          type="button"
          class="absolute bottom-2 right-3 w-8 h-8 rounded-full bg-white/80 border border-slate-200/80 flex items-center justify-center text-[13px] text-slate-700 shadow-sm hover:bg-white/95 active:scale-95 transition"
          @click.stop="emit('requestFullscreenDisplay')"
          aria-label="Fullscreen anzeigen"
        >
          <svg viewBox="0 0 24 24" class="w-4 h-4" aria-hidden="true">
              <path
                d="M5 9V5h4"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
              <path
                d="M19 9V5h-4"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
              <path
                d="M5 15v4h4"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
              <path
                d="M19 15v4h-4"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
        </button>
      </div>
    </template>

    <!-- ========================================================= -->
    <!-- MODAL + DISPLAY: mit Transition                           -->
    <!-- ========================================================= -->
    <template v-else>
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
              :class="mediaClass"
              loading="lazy"
              decoding="async"
            />
          </template>

          <!-- VIDEO -->
          <template v-else>
            <video
              ref="videoRef"
              :src="srcUrl"
              :class="mediaClass"
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
    </template>
  </div>
</template>