// backend/src/state.ts
import fs from "fs"
import path from "path"
import type { PlayerState } from "./types"

const dataFile = path.join(__dirname, "..", "data", "state.json")

// Default-State, falls noch nichts existiert
const defaultState: PlayerState = {
  currentSceneId: 1,
  sceneStartedAt: null,
  isPlaying: true,
  mode: "sequential",
  transitionMs: 5000,
  playVideosFullLength: false,
}

function loadStateFromFile(): PlayerState {
  try {
    if (!fs.existsSync(dataFile)) {
      return { ...defaultState }
    }

    const raw = fs.readFileSync(dataFile, "utf8")
    const parsed = JSON.parse(raw) as Partial<PlayerState>

    return {
      ...defaultState,
      ...parsed,
    }
  } catch (err) {
    console.error("[state] Failed to load state.json:", err)
    return { ...defaultState }
  }
}

function saveStateToFile(state: PlayerState) {
  try {
    const dir = path.dirname(dataFile)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(dataFile, JSON.stringify(state, null, 2), "utf8")
  } catch (err) {
    console.error("[state] Failed to save state.json:", err)
  }
}

// aktuell gültiger State (wird beim Import initialisiert)
let _state: PlayerState = loadStateFromFile()

export function getState(): PlayerState {
  return _state
}

export function setState(newState: PlayerState) {
  _state = { ...newState }
  saveStateToFile(_state)
}

export function updateState(patch: Partial<PlayerState>) {
  _state = { ..._state, ...patch }
  saveStateToFile(_state)
}