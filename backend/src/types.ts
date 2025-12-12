// backend/src/types.ts (gemeinsam für Backend + Frontend)

export type PlayMode = "sequential" | "random"

export interface PlayerState {
  currentSceneId: number | null
  sceneStartedAt: number | null
  isPlaying: boolean
  mode: PlayMode
  transitionMs: number
  playVideosFullLength: boolean
}

export type MessageFromClient =
  | {
      type: "SET_STATE"
      payload: Partial<PlayerState> & {
        playVideosFullLength?: boolean
      }
    }
  | {
      type: "SET_SCENE"
      payload: { sceneId: number }
    }
  | {
      type: "NEXT_SCENE"
      payload?: {} // optional, wir brauchen hier nichts
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