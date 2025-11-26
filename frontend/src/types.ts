// src/types.ts

export type PlayMode = "sequential" | "random"

export interface PlayerState {
  currentSceneId: number
  isPlaying: boolean
  mode: PlayMode
  transitionMs: number
  playVideosFullLength: boolean
}

export type MessageFromClient =
  | {
      type: "SET_STATE"
      payload: Partial<PlayerState>
    }
  | {
      type: "SET_SCENE"
      payload: { sceneId: number }
    }
  | {
      type: "NEXT_SCENE"
      payload?: {}
    }

export type MessageFromServer =
  | {
      type: "STATE_UPDATE"
      payload: PlayerState
    }
  | {
      type: "INFO"
      payload: { message: string }
    }

export interface Scene {
  id: number
  url: string
  type: "image" | "video"
  filename?: string
  title?: string
  description?: string
  visible: boolean
  thumbnailUrl?: string 
}
