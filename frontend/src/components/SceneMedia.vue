<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from "vue"
import type { Scene } from "../types"
import { API_BASE } from "../config"

const props = defineProps<{
  scene: Scene | null
  mode: "control-preview" | "modal-preview" | "display"
  playVideosFullLength: boolean
  sceneStartedAt: number | null
  isPlaying?: boolean
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

  // display
  return "w-full h-full object-contain"
})

/* ───────────────────────────────
   Helpers: URL-Resolver
──────────────────────────────── */
const isVideo = computed(() => props.scene?.type === "video")

const imageSrcUrl = computed(() => {
  if (!props.scene) {
    return ""
  }

  // Für Bilder: bevorzugt optimierte Version (JPG), sonst Original
  const raw = props.scene.optimizedUrl || props.scene.url
  if (!raw) {
    return ""
  }

  return raw.startsWith("http") ? raw : `${API_BASE}${raw}`
})

const videoSrcUrl = computed(() => {
  if (!props.scene) {
    return ""
  }

  // Für Videos: bevorzugt optimierte MP4-Version
  const raw = props.scene.optimizedUrl || props.scene.url
  if (!raw) {
    return ""
  }

  return raw.startsWith("http") ? raw : `${API_BASE}${raw}`
})

const effectiveIsPlaying = computed(() => {
  if (typeof props.isPlaying === "boolean") {
    return props.isPlaying
  }

  return true
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

  // ✅ Videos: keine Transform-Transitions (Safari black-frame Bug)
  if (isVideo.value) {
    currentTransition.value = "scene-fade"
    return
  }

  const next =
    availableTransitions[Math.floor(Math.random() * availableTransitions.length)]
  currentTransition.value = next ?? "scene-fade"
}


const transitionName = computed(() =>
  props.mode === "display" ? currentTransition.value : "scene-fade",
)

const sceneKey = computed(
  () => `${props.scene?.id ?? "empty"}-${transitionName.value}`,
)

/* ───────────────────────────────
   VIDEO: Autoplay Setup
──────────────────────────────── */
function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function getElapsedSeconds(): number | null {
  if (props.sceneStartedAt === null) {
    return null
  }

  if (props.mode !== "display") {
    return null
  }

  const elapsedMs = Date.now() - props.sceneStartedAt
  if (Number.isFinite(elapsedMs) === false || elapsedMs < 0) {
    return null
  }

  return elapsedMs / 1000
}

function trySyncVideoToServerTime(): void {
  const el = videoRef.value
  if (!el) {
    return
  }

  const elapsed = getElapsedSeconds()
  if (elapsed === null) {
    return
  }

  // Wenn duration noch nicht bekannt ist, warten wir auf loadedmetadata
  if (Number.isFinite(el.duration) === false || el.duration <= 0) {
    return
  }

  // nicht ganz ans Ende springen, sonst feuert sofort `ended`
  const target = clampNumber(elapsed, 0, Math.max(0, el.duration - 0.25))

  // Nur setzen, wenn wir wirklich deutlich daneben liegen (verhindert Jitter)
  if (Number.isFinite(el.currentTime) && Math.abs(el.currentTime - target) < 0.35) {
    return
  }

  try {
    el.currentTime = target
  } catch {
    // ignore
  }
}

function setupVideo() {
  const el = videoRef.value
  if (!el) {
    return
  }

  // Modal + Control Preview sollen immer bei 0 starten
  if (props.mode !== "display") {
    el.currentTime = 0
  }

  // Display: wenn wir `sceneStartedAt` haben, versuchen wir zum Server-Zeitpunkt zu springen
  if (props.mode === "display") {
    trySyncVideoToServerTime()
  }

  el.play().catch(() => {
    // Autoplay kann auf manchen Geräten geblockt werden – dann einfach still ignorieren
  })
}

watch(
  () => props.scene?.id,
  () => {
    pickNextTransition()
    if (isVideo.value) {
      nextTick(() => {
        setupVideo()
        trySyncVideoToServerTime()
      })
    }
  },
)

watch(
  () => props.sceneStartedAt,
  () => {
    if (props.mode !== "display") {
      return
    }

    if (!isVideo.value) {
      return
    }

    nextTick(() => {
      trySyncVideoToServerTime()
    })
  },
)

watch(
  () => effectiveIsPlaying.value,
  (playingNow) => {
    const el = videoRef.value
    if (!el) {
      return
    }

    if (playingNow) {
      nextTick(() => {
        if (props.mode === "display") {
          trySyncVideoToServerTime()
        }

        el.play().catch(() => {
          // ignore autoplay blocks
        })
      })
    } else {
      el.pause()
    }
  },
)

onMounted(() => {
  pickNextTransition()
  if (isVideo.value) {
    setupVideo()
    trySyncVideoToServerTime()
  }
})

onBeforeUnmount(() => {
  if (videoRef.value) {
    videoRef.value.pause()
  }
})

/* ───────────────────────────────
   ENDED → Slideshow Next
   - Im Modal: nix tun (loop)
   - In Display/Preview: bei "volle Länge" → nächste Szene
──────────────────────────────── */
function handleEnded() {
  if (props.mode === "modal-preview") {
    return
  }

  if (!effectiveIsPlaying.value) {
    return
  }

  // Nur wenn "volle Länge" aktiv ist, soll ended → nächste Szene triggern
  if (props.playVideosFullLength) {
    emit("requestNext")
  }
}

function handleLoadedMetadata() {
  if (props.mode === "display") {
    trySyncVideoToServerTime()
  }
}

watch(
  () => props.isPlaying,
  (playing) => {
    const el = videoRef.value
    if (!el) {
      return
    }

    if (playing) {
      el.play().catch(() => {
        // ignore autoplay restrictions
      })
    } else {
      el.pause()
    }
  },
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
          :src="imageSrcUrl"
          :class="mediaClass"
          loading="lazy"
          decoding="async"
        />

        <!-- VIDEO -->
        <video
          v-else-if="scene?.type === 'video'"
          ref="videoRef"
          :src="videoSrcUrl"
          :class="mediaClass"
          muted
          playsinline
          preload="metadata"
          autoplay
          @loadedmetadata="handleLoadedMetadata"
          @ended="handleEnded"
        />

        <!-- NONE -->
        <div v-else class="text-white/60 text-sm">
          Keine Szene ausgewählt
        </div>

        <!-- FULLSCREEN BUTTON (zur Display View) -->
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
          <!-- IMAGE in Modal/Display -->
          <img
            v-if="scene.type === 'image'"
            :src="imageSrcUrl"
            :class="mediaClass"
            loading="lazy"
            decoding="async"
          />

          <!-- VIDEO in Modal/Display -->
          <video
            v-else
            ref="videoRef"
            :src="videoSrcUrl"
            :class="mediaClass"
            muted
            playsinline
            preload="metadata"
            autoplay
            :loop="mode === 'modal-preview'"
            @loadedmetadata="handleLoadedMetadata"
            @ended="handleEnded"
          />
        </div>

        <div v-else class="text-white/60 text-sm">
          Keine Szene ausgewählt
        </div>
      </Transition>
    </template>
  </div>
</template>