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
  (e: "requestModalClose"): void
}>()

const videoRef = ref<HTMLVideoElement | null>(null)

/* ───────────────────────────────
   Klassen pro Modus
──────────────────────────────── */
const mediaClass = computed(() => {
  if (props.mode === "control-preview") {
    return "w-full h-full object-cover"
  }

  if (props.mode === "modal-preview") {
    return "modal-media-frame max-h-[80vh] max-w-full h-auto w-auto object-contain"
  }

  return "w-full h-full object-contain"
})

/* ───────────────────────────────
   Helpers
──────────────────────────────── */
const isVideo = computed(() => props.scene?.type === "video")

const srcUrl = computed(() => {
  if (!props.scene?.url) return ""
  const url = props.scene.url
  return url.startsWith("http") ? url : `${API_BASE}${url}`
})

/* ───────────────────────────────
   Display-Transitions (für Slideshow)
──────────────────────────────── */
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
  if (props.mode !== "display") {
    currentTransition.value = "scene-fade"
    return
  }

  const next =
    availableTransitions[Math.floor(Math.random() * availableTransitions.length)]
  currentTransition.value = next ?? "scene-fade"
}

const transitionName = computed(() =>
  props.mode === "display" ? currentTransition.value : "scene-fade"
)

const sceneKey = computed(
  () => `${props.scene?.id ?? "empty"}-${transitionName.value}`
)

/* ───────────────────────────────
   VIDEO: Autoplay Setup
──────────────────────────────── */
function setupVideo() {
  const el = videoRef.value
  if (!el) return

  el.currentTime = 0
  el.play().catch(() => {})
}

watch(
  () => props.scene?.id,
  () => {
    pickNextTransition()
    if (isVideo.value) nextTick(() => setupVideo())
  }
)

onMounted(() => {
  pickNextTransition()
  if (isVideo.value) setupVideo()
})

onBeforeUnmount(() => {
  videoRef.value?.pause()
})

/* ───────────────────────────────
   FULLSCREEN (Video Only)
──────────────────────────────── */
function enterFullscreen() {
  const el = videoRef.value
  if (!el) return

  if (el.requestFullscreen) el.requestFullscreen()
  else if ((el as any).webkitEnterFullscreen) (el as any).webkitEnterFullscreen()
}

/* ───────────────────────────────
   ENDED → Slideshow Next
──────────────────────────────── */
function handleEnded() {
  if (props.playVideosFullLength) emit("requestNext")
}

/* ───────────────────────────────
   MODAL VIDEO HANDLING
   → Videos sollen NICHT im Modal bleiben!
   → Direkt Fullscreen öffnen
──────────────────────────────── */
watch(
  () => props.mode,
  (mode) => {
    if (mode === "modal-preview" && isVideo.value) {
      nextTick(() => {
        enterFullscreen()
        emit("requestModalClose")
      })
    }
  }
)
</script>

<template>
  <div
    :class="[
      mode === 'display'
        ? 'fixed inset-0 bg-black flex items-center justify-center'
        : 'w-full h-full flex items-center justify-center'
    ]"
  >
    <!-- CONTROL PREVIEW -->
    <template v-if="mode === 'control-preview'">
      <div class="relative w-full h-full flex items-center justify-center">
        <!-- IMAGE -->
        <img
          v-if="scene?.type === 'image'"
          :src="srcUrl"
          :class="mediaClass"
        />

        <!-- VIDEO -->
        <video
          v-else-if="scene?.type === 'video'"
          ref="videoRef"
          :src="srcUrl"
          :class="mediaClass"
          muted
          playsinline
          preload="auto"
          autoplay
          @ended="handleEnded"
        />

        <!-- NONE -->
        <div v-else class="text-white/60 text-sm">Keine Szene ausgewählt</div>

        <!-- FULLSCREEN BUTTON -->
        <button
          type="button"
          class="absolute bottom-2 right-3 w-8 h-8 rounded-full bg-white/80 border border-slate-200/80 flex items-center justify-center text-[13px] text-slate-700 shadow-sm hover:bg-white/95 active:scale-95 transition pill-tap"
          @click.stop="emit('requestFullscreenDisplay')"
        >
          ⛶
        </button>
      </div>
    </template>

    <!-- MODAL + DISPLAY -->
    <template v-else>
      <Transition :name="transitionName" mode="out-in">
        <div
          v-if="scene"
          :key="sceneKey"
          class="relative w-full h-full flex items-center justify-center"
        >
          <!-- IMAGE in Modal -->
          <img
            v-if="scene.type === 'image'"
            :src="srcUrl"
            :class="mediaClass"
          />

          <!-- VIDEO (Modal → auto fullscreen, keine Darstellung nötig) -->
          <video
            v-else
            ref="videoRef"
            :src="srcUrl"
            :class="mediaClass"
            muted
            playsinline
            preload="auto"
            autoplay
            @ended="handleEnded"
          />
        </div>

        <div v-else class="text-white/60 text-sm">Keine Szene ausgewählt</div>
      </Transition>
    </template>
  </div>
</template>
