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

const isVideo = computed(() => props.scene?.type === "video")

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
  () => {
    if (!isVideo.value) {
      return
    }

    nextTick(() => {
      setupVideo()
    })
  },
)

onMounted(() => {
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
  <div class="w-full h-full bg-black flex items-center justify-center">
    <template v-if="scene">
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
          @ended="handleEnded"
        ></video>
      </template>
    </template>

    <template v-else>
      <div class="text-white/60 text-sm">
        Keine Szene ausgewählt
      </div>
    </template>
  </div>
</template>