<script setup lang="ts">
import {
  ref,
  computed,
  onMounted,
  onBeforeUnmount,
  watch,
} from "vue"
import { useRouter } from "vue-router"
import type { PlayerState, PlayMode, Scene } from "../types"
import { API_BASE } from "../config"
import { connectWs, onStateChange, sendMessage } from "../ws"
import SceneMedia from "../components/SceneMedia.vue"

const router = useRouter()
const state = ref<PlayerState | null>(null)
const initLoaded = ref(false)
let unsubscribe: (() => void) | null = null

// Dauer in ms (0–10000) – Slider steuert ms, Anzeige in Sekunden
const localDurationMs = ref(5000)
const durationSeconds = computed(() => Math.round(localDurationMs.value / 1000))
const localMode = ref<PlayMode>("sequential")

const scenes = ref<Scene[]>([])
const scenesLoading = ref(false)
const scenesError = ref<string | null>(null)

// Upload State
const uploading = ref(false)
const uploadError = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const totalUploadFiles = ref(0)
const uploadedFilesCount = ref(0)

// reine Text-Helfer für die Pill
const uploadProgressText = computed(() => {
  if (!uploading.value || totalUploadFiles.value === 0) {
    return ""
  }
  return `${uploadedFilesCount.value} / ${totalUploadFiles.value} Dateien hochgeladen`
})

const previewScene = ref<Scene | null>(null)
const showPreview = (scene: Scene) => {
  previewScene.value = scene
}
const closePreview = () => {
  previewScene.value = null
}

const selectedSceneIds = ref<Array<Scene["id"]>>([])
const selectedCount = computed(() => selectedSceneIds.value.length)

const allSelected = computed(() => {
  return scenes.value.length > 0 && selectedSceneIds.value.length === scenes.value.length
})

function toggleSelectAll() {
  if (!scenes.value.length) {
    return
  }

  if (allSelected.value) {
    selectedSceneIds.value = []
  } else {
    selectedSceneIds.value = scenes.value.map((s) => s.id)
  }
}

function isSceneSelected(scene: Scene): boolean {
  return selectedSceneIds.value.includes(scene.id)
}

function toggleSceneSelected(scene: Scene) {
  const id = scene.id
  const idx = selectedSceneIds.value.indexOf(id)
  if (idx === -1) {
    selectedSceneIds.value = [...selectedSceneIds.value, id]
  } else {
    selectedSceneIds.value = selectedSceneIds.value.filter((x) => x !== id)
  }
}

// Tabs: preview / scenes
const activeTab = ref<"preview" | "scenes">("preview")
const setTab = (tab: "preview" | "scenes") => {
  activeTab.value = tab
}

const currentScene = computed<Scene | null>(() => {
  if (!state.value) {
    return null
  }
  return scenes.value.find((s) => s.id === state.value!.currentSceneId) ?? null
})

const visibleScenes = computed(() =>
  scenes.value.filter((scene) => scene.visible ?? true),
)
const visibleCount = computed(() => visibleScenes.value.length)

// --- TIMER für Auto-Wechsel ---
const timerId = ref<number | null>(null)

function goToDisplayFullscreen(): void {
  router.push("/display")
}

function clearTimer() {
  if (timerId.value !== null) {
    clearTimeout(timerId.value)
    timerId.value = null
  }
}

// Hilfsfunktion: nächste Szene nach Modus (sequentiell / random) bestimmen
function computeNextScene(): Scene | null {
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

  if (currentIndex === -1) {
    return list[0] ?? null
  }
  const nextIndex = (currentIndex + 1) % list.length
  return list[nextIndex] ?? null
}

function scheduleNextByTimer() {
  clearTimer()

  const s = state.value
  const scene = currentScene.value

  if (!s || !scene) {
    return
  }

  if (!s.isPlaying) {
    return
  }

  if (scene.type === "video" && s.playVideosFullLength) {
    return
  }

  const baseMs = s.transitionMs ?? localDurationMs.value ?? 5000
  const ms = Math.min(10000, Math.max(500, baseMs))

  timerId.value = window.setTimeout(() => {
    nextScene()
  }, ms)
}

// ===============================
// Pagination mit Scroll + Scroll-Snap (iOS-freundlich)
// ===============================
const thumbPageSize = 12
const currentThumbPage = ref(0)

const totalThumbPages = computed(() => {
  const total = scenes.value.length
  if (total === 0) {
    return 1
  }
  return Math.ceil(total / thumbPageSize)
})

// Container-Ref
const thumbOuter = ref<HTMLElement | null>(null)

// Seiten als Array von Scene-Arrays
const pages = computed(() => {
  const res: Scene[][] = []
  const total = scenes.value.length
  if (total === 0) {
    return res
  }
  for (let i = 0; i < totalThumbPages.value; i++) {
    const start = i * thumbPageSize
    res.push(scenes.value.slice(start, start + thumbPageSize))
  }
  return res
})

watch(scenes, () => {
  const maxPage = Math.max(0, totalThumbPages.value - 1)
  if (currentThumbPage.value > maxPage) {
    currentThumbPage.value = maxPage
  }
})

function onThumbScroll() {
  const el = thumbOuter.value
  if (!el) {
    return
  }

  const width = el.clientWidth || 1
  const rawIndex = el.scrollLeft / width
  const rounded = Math.round(rawIndex)

  const maxPage = Math.max(0, totalThumbPages.value - 1)
  const clamped = Math.min(maxPage, Math.max(0, rounded))

  currentThumbPage.value = clamped
}

// ===============================
// Rest: Player, Upload, etc.
// ===============================

const playVideosFullLength = computed<boolean>({
  get() {
    return !!state.value?.playVideosFullLength
  },
  set(val: boolean) {
    sendMessage({ type: "SET_STATE", payload: { playVideosFullLength: val } })
  },
})

watch(
  () => state.value,
  (s, prev) => {
    if (!s) {
      return
    }

    const nextTransition = Math.min(
      10000,
      Math.max(0, s.transitionMs ?? 5000),
    )

    if (!initLoaded.value) {
      localMode.value = s.mode
      localDurationMs.value = nextTransition
      initLoaded.value = true
      scheduleNextByTimer()
      return
    }

    if (s.transitionMs !== prev?.transitionMs) {
      localDurationMs.value = nextTransition
    }

    if (s.mode !== prev?.mode) {
      localMode.value = s.mode
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
  },
)

onMounted(() => {
  connectWs()
  unsubscribe = onStateChange((s) => {
    state.value = { ...s }
  })
  loadScenes()
})

onBeforeUnmount(() => {
  clearTimer()
  if (unsubscribe) {
    unsubscribe()
  }
})

async function loadScenes() {
  scenesLoading.value = true
  scenesError.value = null
  try {
    const res = await fetch(`${API_BASE}/api/scenes`)
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    scenes.value = (await res.json()) as Scene[]
  } catch (e) {
    console.error(e)
    scenesError.value = "Konnte Szenen nicht laden."
  } finally {
    scenesLoading.value = false
  }
}

function togglePlay() {
  if (!state.value) {
    return
  }
  sendMessage({
    type: "SET_STATE",
    payload: { isPlaying: !state.value.isPlaying },
  })
}

function nextScene() {
  if (!state.value) {
    return
  }
  const next = computeNextScene()
  if (!next) {
    return
  }
  sendMessage({
    type: "SET_SCENE",
    payload: { sceneId: next.id },
  })
}

function prevScene() {
  if (!state.value || !visibleScenes.value.length) {
    return
  }

  const idx = visibleScenes.value.findIndex(
    (s) => s.id === state.value?.currentSceneId,
  )

  const prevIndex = idx <= 0 ? visibleScenes.value.length - 1 : idx - 1
  const targetScene = visibleScenes.value[prevIndex]

  if (!targetScene) {
    return
  }

  sendMessage({
    type: "SET_SCENE",
    payload: { sceneId: targetScene.id },
  })
}

function applyDuration() {
  const ms = Math.min(10000, Math.max(0, localDurationMs.value))
  localDurationMs.value = ms

  sendMessage({
    type: "SET_STATE",
    payload: { transitionMs: ms },
  })
}

function setMode(mode: PlayMode) {
  if (localMode.value === mode) {
    return
  }
  localMode.value = mode
  sendMessage({
    type: "SET_STATE",
    payload: { mode },
  })
}

function openFileDialog() {
  if (fileInput.value) {
    fileInput.value.click()
  }
}

function handleFileChange(e: Event): void {
  const input = e.target as HTMLInputElement

  if (!input.files || input.files.length === 0) {
    return
  }

  totalUploadFiles.value = input.files.length
  uploadedFilesCount.value = 0

  void uploadFiles(input.files)
  input.value = ""
}

async function uploadFiles(files: FileList | File[]): Promise<void> {
  uploading.value = true
  uploadError.value = null

  const hadScenesBefore = scenes.value.length > 0
  let firstNewScene: Scene | null = null

  try {
    const fileArray = Array.from(files)
    const chunkSize = 15

    for (let i = 0; i < fileArray.length; i += chunkSize) {
      const chunk = fileArray.slice(i, i + chunkSize)

      const formData = new FormData()
      for (const file of chunk) {
        formData.append("files", file)
      }

      let response: Response
      try {
        response = await fetch(`${API_BASE}/api/scenes/upload`, {
          method: "POST",
          body: formData,
        })
      } catch (networkError: unknown) {
        console.error("Network error while uploading chunk", networkError)
        uploadError.value = "Netzwerkfehler beim Upload."
        break
      }

      if (!response.ok) {
        console.error("Upload failed for chunk, status:", response.status)
        uploadError.value = `Upload fehlgeschlagen (HTTP ${response.status}).`
        break
      }

      let payload: unknown
      try {
        payload = await response.json()
      } catch (parseError: unknown) {
        console.error("Failed to parse response JSON for chunk", parseError)
        uploadError.value = "Antwort vom Server konnte nicht gelesen werden."
        break
      }

      let createdScenes: Scene[] = []
      if (Array.isArray(payload)) {
        createdScenes = payload as Scene[]
      } else {
        createdScenes = [payload as Scene]
      }

      if (createdScenes.length === 0) {
        continue
      }

      scenes.value.push(...createdScenes)

      if (firstNewScene === null) {
        firstNewScene = createdScenes[0] ?? null
      }

      uploadedFilesCount.value = Math.min(
        totalUploadFiles.value,
        uploadedFilesCount.value + chunk.length,
      )
    }

    if (!hadScenesBefore && firstNewScene !== null) {
      if (typeof firstNewScene.id === "number") {
        sendMessage({
          type: "SET_SCENE",
          payload: { sceneId: firstNewScene.id },
        })

        sendMessage({
          type: "SET_STATE",
          payload: { isPlaying: true },
        })
      }
    }
  } catch (error: unknown) {
    console.error("Unexpected upload error:", error)
    uploadError.value = "Upload fehlgeschlagen."
  } finally {
    uploading.value = false
    uploadedFilesCount.value = 0
    totalUploadFiles.value = 0
  }
}

async function toggleSceneActive(scene: Scene) {
  const oldVisible = scene.visible ?? true
  const newVisible = !oldVisible
  scene.visible = newVisible
  try {
    const res = await fetch(`${API_BASE}/api/scenes/${scene.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visible: newVisible }),
    })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    const updated = (await res.json()) as Scene
    const idx = scenes.value.findIndex((s) => s.id === scene.id)
    if (idx !== -1) {
      scenes.value[idx] = { ...scenes.value[idx], ...updated }
    }
  } catch (e: any) {
    console.error(e)
    scenesError.value =
      e?.message ?? "Sichtbarkeit konnte nicht geändert werden."
    scene.visible = oldVisible
  }
}

async function deleteSelectedScenes() {
  const ids = selectedSceneIds.value
  if (!ids.length) {
    return
  }

  const total = scenes.value.length
  const message =
    ids.length === total
      ? `Wirklich ALLE ${total} Szenen löschen?`
      : `Diese ${ids.length} Datei(en) löschen?`

  if (!confirm(message)) {
    return
  }
  try {
    await Promise.all(
      ids.map((id) =>
        fetch(`${API_BASE}/api/scenes/${id}`, { method: "DELETE" }),
      ),
    )
    scenes.value = scenes.value.filter((s) => !ids.includes(s.id))
    selectedSceneIds.value = []
  } catch (e) {
    console.error(e)
    scenesError.value = "Löschen fehlgeschlagen."
  }
}
</script>

<template>
  <div
    class="h-dvh md:h-screen control-bg relative overflow-x-hidden overflow-y-hidden text-slate-900 px-4 py-4 md:py-6"
  >
    <div class="w-full max-w-md mx-auto space-y-4">
      <!-- TAB HEADERS -->
      <div
        class="grid grid-cols-2 bg-white/40 backdrop-blur-xs p-1 rounded-2xl shadow-[0_18px_40px_rgba(15,23,42,0.16)]"
      >
        <button
          class="pill-tap py-2 rounded-xl text-sm font-semibold"
          :class="
            activeTab === 'preview'
              ? 'bg-white text-slate-800 shadow-[0_8px_26px_rgba(15,23,42,0.18)]'
              : 'text-slate-600'
          "
          @click="setTab('preview')"
        >
          Preview
        </button>

        <button
          class="pill-tap py-2 rounded-xl text-sm font-semibold"
          :class="
            activeTab === 'scenes'
              ? 'bg-white text-slate-800 shadow-[0_8px_26px_rgba(15,23,42,0.18)]'
              : 'text-slate-600'
          "
          @click="setTab('scenes')"
        >
          Szenen
        </button>
      </div>

      <!-- TAB 1 – PREVIEW -->
      <div v-if="activeTab === 'preview'" class="space-y-5">
        <!-- Preview-Panel -->
        <div class="relative w-full">
          <!-- Info-Bar über der Live-Preview -->
          <div class="flex items-center justify-between gap-3 mb-2 px-1">
            <div
              class="flex flex-col rounded-full bg-white/70 border border-slate-200/80 px-3 py-2 text-slate-700 shadow-sm"
            >
              <span
                class="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-800"
              >
                Live Preview
              </span>
              <span class="text-[10px] text-slate-800 mt-0.5">
                {{ visibleCount }} aktive Szene(n)
              </span>
            </div>

            <span
              class="pill-tap max-w-[55%] truncate rounded-full bg-white/70 border border-slate-200/80 px-3 py-2 text-[11px] text-slate-700 shadow-sm hover:bg-white/90"
            >
              {{
                currentScene
                  ? currentScene.title || `Scene ${currentScene.id}`
                  : "Keine Szene ausgewählt"
              }}
            </span>
          </div>

          <!-- Preview-Panel -->
          <div
            class="glass-panel-soft-preview backdrop-blur-xs w-full h-[340px] sm:h-[370px] rounded-[40px] overflow-hidden flex items-center justify-center"
          >
            <div class="relative w-full h-full flex items-center justify-center">
              <SceneMedia
                v-if="currentScene"
                :scene="currentScene"
                mode="control-preview"
                :play-videos-full-length="!!state?.playVideosFullLength"
                @requestNext="nextScene"
                @requestFullscreenDisplay="goToDisplayFullscreen"
                class="absolute inset-0 flex items-center justify-center"
              />
            </div>
          </div>

          <!-- CONTROL BUTTONS: Prev / Play / Next -->
          <div class="mt-4 flex items-center justify-center gap-3">
            <!-- PREVIOUS -->
            <button
              @click.stop="prevScene"
              aria-label="Vorherige Szene"
              class="control-icon-btn w-11 h-11 rounded-full border border-white/80 bg-white/30 text-zinc-100 
                     shadow-[0_0_22px_6px_rgba(255,255,255,0.45)] backdrop-blur-md flex items-center justify-center"
            >
              <svg viewBox="0 0 24 24" class="w-6 h-6" aria-hidden="true">
                <rect x="5" y="5" width="2" height="14" rx="0.5" fill="currentColor" />
                <path d="M17 5L9 12l8 7z" fill="currentColor" />
              </svg>
            </button>

            <!-- PLAY / PAUSE -->
            <button
              @click.stop="togglePlay"
              aria-label="Play/Pause"
              :class="[
                'control-icon-btn control-icon-btn--primary w-11 h-11 rounded-full border border-white/80 bg-white/30 text-zinc-100 backdrop-blur-md flex items-center justify-center',
                !state?.isPlaying ? 'control-icon-btn--pulse' : ''
              ]"
            >
              <template v-if="state?.isPlaying">
                <svg viewBox="0 0 24 24" class="w-6 h-6" aria-hidden="true">
                  <rect
                    x="6"
                    y="5"
                    width="4"
                    height="14"
                    rx="1"
                    stroke="currentColor"
                    fill="currentColor"
                  />
                  <rect
                    x="14"
                    y="5"
                    width="4"
                    height="14"
                    rx="1"
                    stroke="currentColor"
                    fill="currentColor"
                  />
                </svg>
              </template>
              <template v-else>
                <svg viewBox="0 0 24 24" class="w-6 h-6" aria-hidden="true">
                  <path d="M8 5l11 7-11 7z" fill="currentColor" />
                </svg>
              </template>
            </button>

            <!-- NEXT -->
            <button
              @click.stop="nextScene"
              aria-label="Nächste Szene"
              class="control-icon-btn w-11 h-11 rounded-full border border-white/80 bg-white/30 text-zinc-100  
                     shadow-[0_0_22px_6px_rgba(255,255,255,0.45)] backdrop-blur-md flex items-center justify-center"
            >
              <svg viewBox="0 0 24 24" class="w-6 h-6" aria-hidden="true">
                <path d="M17 5h-2v14h2zM13 12L5 5v14z" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>

        <!-- SETTINGS PANEL -->
        <div class="pt-6">
          <div class="glass-panel-soft w-full rounded-[22px] px-4 py-3">
            <div class="flex items-center justify-between gap-3">
              <span
                class="text-[11px] uppercase tracking-[0.22em] text-slate-700"
              >
                Modus
              </span>

              <div
                class="flex rounded-full bg-white/90 border border-slate-200/60 p-1 text-[11px]"
              >
                <button
                  type="button"
                  class="pill-tap px-2.5 py-1 rounded-full"
                  :class="
                    localMode === 'sequential'
                      ? 'bg-slate-900 text-white shadow-[0_8px_22px_rgba(15,23,42,0.45)]'
                      : 'text-slate-600'
                  "
                  @click="setMode('sequential')"
                >
                  Sequenziell
                </button>
                <button
                  type="button"
                  class="pill-tap px-2.5 py-1 rounded-full"
                  :class="
                    localMode === 'random'
                      ? 'bg-slate-900 text-white shadow-[0_8px_22px_rgba(15,23,42,0.45)]'
                      : 'text-slate-600'
                  "
                  @click="setMode('random')"
                >
                  Zufällig
                </button>
              </div>
            </div>

            <div class="mt-5">
              <div class="flex items-center justify-between mb-1">
                <span
                  class="text-[11px] uppercase tracking-[0.22em] text-slate-700"
                >
                  Dauer
                </span>
                <span class="text-[11px] text-slate-700">
                  {{ durationSeconds }} s
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="10000"
                step="10"
                v-model.number="localDurationMs"
                @change="applyDuration"
                class="w-full duration-slider"
                :style="{
                  '--duration-progress': `${(localDurationMs / 100).toFixed(0)}%`,
                }"
              />
            </div>

            <div class="mt-5 flex items-center justify-between gap-3">
              <span
                class="text-[11px] uppercase tracking-[0.22em] text-slate-700"
              >
                Videos in voller Länge
              </span>

              <label class="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  v-model="playVideosFullLength"
                  class="sr-only peer"
                />
                <div
                  class="w-11 h-6 bg-slate-200 peer-checked:bg-sky-400 rounded-full transition-colors"
                ></div>
                <div
                  class="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow-[0_4px_10px_rgba(15,23,42,0.35)] peer-checked:translate-x-5 transition-transform"
                ></div>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 2 – SZENEN -->
      <div
        v-if="activeTab === 'scenes'"
        class="pb-2 pt-2 flex flex-col"
      >
        <!-- Header -->
        <div class="flex items-baseline justify-between gap-2">
          <span class="text-[11px] uppercase tracking-[0.22em] text-white">
            Szenen
          </span>
          <div class="flex items-center gap-2">
            <span class="text-[11px] text-white">
              {{ visibleCount }} sichtbar von {{ scenes.length }}
            </span>
            <button
              type="button"
              class="pill-tap text-[10px] px-2 py-1 rounded-full bg-white/70 border border-slate-200/80 text-slate-700 shadow-sm hover:bg-white/90"
              @click="toggleSelectAll"
            >
              {{ allSelected ? "Auswahl leeren" : "Alle auswählen" }}
            </button>
          </div>
        </div>

        <!-- Scroll Container mit Scroll-Snap -->
        <div class="flex-1 min-h-0 overflow-y-hidden -mx-4 sm:mx-0 pt-1 pb-4">
          <div
            ref="thumbOuter"
            class="relative group overflow-x-auto overflow-y-hidden thumb-swipe-area snap-x snap-mandatory scroll-smooth px-0"
            @scroll.passive="onThumbScroll"
          >
            <div class="flex min-w-full">
              <div
                v-for="(pageScenes, pageIndex) in pages"
                :key="pageIndex"
                class="w-screen md:w-full flex-shrink-0 snap-start mb-4 mt-2"
              >
                <div
                  class="w-full px-4 mx-auto grid grid-cols-3 gap-x-4 sm:gap-x-4 gap-y-2 sm:gap-y-3 py-2 sm:py-3"
                >
                  <div
                    v-for="scene in pageScenes"
                    :key="scene.id"
                    @click="toggleSceneActive(scene)"
                    :class="[
                      'relative cursor-pointer transition',
                      scene.visible === false ? 'opacity-35 grayscale' : 'opacity-100'
                    ]"
                  >
                    <div
                      :class="[
                        'relative rounded-[18px] overflow-visible m-[4px] bg-white/60 shadow-[0_6px_18px_rgba(255,255,255,0.48)]',
                        scene.id === state?.currentSceneId
                          ? 'ring-3 ring-sky-400 shadow-[0_0_0_1px_rgba(56,189,248,0.65)]'
                          : ''
                      ]"
                    >
                      <div class="rounded-[18px] overflow-hidden bg-white/5">
                        <div class="w-full aspect-square">
                          <template v-if="scene.thumbnailUrl">
                            <img
                              :src="API_BASE + scene.thumbnailUrl"
                              loading="lazy"
                              decoding="async"
                              class="w-full h-full object-cover"
                            />
                          </template>

                          <template v-else-if="scene.type === 'image'">
                            <img
                              :src="API_BASE + scene.url"
                              loading="lazy"
                              decoding="async"
                              class="w-full h-full object-cover"
                            />
                          </template>

                          <template v-else>
                            <video
                              :src="API_BASE + scene.url"
                              :poster="scene.thumbnailUrl ? API_BASE + scene.thumbnailUrl : undefined"
                              class="w-full h-full object-cover"
                              muted
                              playsinline
                              preload="metadata"
                            ></video>
                          </template>
                        </div>
                      </div>
                    </div>

                    <!-- Auswahl-Button (Häkchen) -->
                    <button
                      type="button"
                      @click.stop="toggleSceneSelected(scene)"
                      :class="[
                        'pill-tap absolute top-2 right-12 w-8 h-8 rounded-full backdrop-blur-xs flex items-center justify-center text-[14px] z-20 cursor-pointer',
                        isSceneSelected(scene)
                          ? 'bg-sky-400 border border-sky-400 text-white shadow-[0_18px_40px_rgba(56,189,248,0.65)]'
                          : 'bg-white/70 border border-slate-300/85 text-slate-800 shadow-[0_14px_30px_rgba(15,23,42,0.28)] hover:bg-white/80'
                      ]"
                    >
                      <svg viewBox="0 0 24 24" class="w-4 h-4" aria-hidden="true">
                        <path
                          d="M6 12.5l3.5 3.5L18 7.5"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                    </button>

                    <!-- Eck-Button (Preview) -->
                    <button
                      @click.stop="showPreview(scene)"
                      class="pill-tap absolute top-2 right-2 w-8 h-8 rounded-full bg-white/70 border border-slate-200/80 flex items-center justify-center text-[14px] text-slate-700 shadow-sm hover:bg-white/90"
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
                </div>
              </div>
            </div>
          </div>

          <div
            class="mt-1 flex items-center justify-center gap-2 text-[10px] text-white"
          >
            Seite {{ currentThumbPage + 1 }} / {{ totalThumbPages }}
          </div>
        </div>

        <!-- Buttons unten -->
        <div class="flex gap-3 pt-2 mb-1">
          <button
            @click="openFileDialog"
            :disabled="uploading"
            class="flex-1 h-12 glass-pill-btn glass-pill-primary cta-pill text-sm font-semibold flex items-center justify-center"
          >
            {{ uploading ? "Upload…" : "Upload" }}
          </button>

          <button
            @click="deleteSelectedScenes"
            :disabled="selectedCount === 0"
            class="flex-1 h-12 glass-pill-btn glass-pill-danger cta-pill text-sm font-semibold flex items-center justify-center"
          >
            Löschen ({{ selectedCount }})
          </button>

          <input
            ref="fileInput"
            type="file"
            class="hidden"
            multiple
            accept="image/*,image/heic,image/heif,video/*"
            @change="handleFileChange"
          />
        </div>
      </div>
    </div>

    <!-- Upload-Toast unten -->
    <Teleport to="body">
      <div
        v-if="uploading"
        class="fixed inset-x-0 bottom-20 z-[9500] flex justify-center px-4 pointer-events-none"
      >
        <div
          class="pointer-events-auto glass-panel-soft rounded-full px-4 py-2 flex items-center gap-2 text-[11px] text-slate-800 shadow-[0_14px_30px_rgba(15,23,42,0.3)] bg-white/90 border border-slate-200/80"
        >
          <span
            class="inline-block w-3 h-3 rounded-full border-2 border-sky-400 border-t-transparent animate-spin"
          ></span>
          <span class="uppercase tracking-[0.16em] font-semibold">
            Upload läuft
          </span>
          <span class="text-slate-600">
            {{ uploadProgressText }}
          </span>
        </div>
      </div>
    </Teleport>

    <!-- MODAL PREVIEW -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div
          v-if="previewScene"
          class="fixed inset-0 z-[9999] flex items-center justify-center bg-white/30 backdrop-blur-xs"
          @click.self="closePreview"
        >
          <div class="relative w-full h-full flex items-center justify-center">
            <!-- Gemeinsamer Frame für Titel + Media -->
            <div
              class="relative w-full max-w-[min(100vw-40px,900px)] mx-auto flex flex-col items-stretch"
            >
              <!-- Titel + X: exakt an den Bildrand angepasst -->
              <div
                class="absolute top-0 left-1/2 -translate-x-1/2 w-full flex items-start justify-between gap-3 pointer-events-none"
              >
                <span
                  class="pill-tap max-w-[70%] truncate rounded-full bg-white/75 border border-slate-200/80 px-4 py-2 text-[11px] text-slate-700 shadow-sm hover:bg-white/90 pointer-events-auto"
                >
                  {{
                    previewScene?.title ||
                    previewScene?.id?.toString() ||
                    "Preview"
                  }}
                </span>

                <button
                  class="pill-tap w-9 h-9 rounded-full bg-white/80 border border-slate-200/80 flex items-center justify-center text-sm text-slate-700 shadow-sm hover:bg-white pointer-events-auto"
                  @click.stop="closePreview"
                >
                  ✕
                </button>
              </div>

              <!-- Bild / Video mit gleichem Frame wie Header -->
              <div class="modal-media-frame mt-12 w-full overflow-hidden">
                <SceneMedia
                  :scene="previewScene"
                  mode="modal-preview"
                  :play-videos-full-length="!!state?.playVideosFullLength"
                  @requestNext="nextScene"
                  class="w-full h-full object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
