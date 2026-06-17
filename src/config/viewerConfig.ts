import type { HairShadowMode, MaterialBindingMode } from "../engine/PjskViewerApp";

export type ToonShadowSmoothMode =
  | "auto"
  | "hard"
  | "w003"
  | "w005"
  | "w008"
  | "w012";
export type ValueShadowInfluenceMode = "0" | "0.25" | "0.5" | "1";
export type CharacterYawMode = "0" | "45" | "-45" | "90" | "-90" | "180";
export type SpringRuntimeMode = "off" | "unity-prefab";

export type ViewerRenderState = {
  materialBindingMode: MaterialBindingMode;
  hairShadowMode: HairShadowMode;
  toonShadowSmoothMode: ToonShadowSmoothMode;
  valueShadowInfluenceMode: ValueShadowInfluenceMode;
  characterYawMode: CharacterYawMode;
  faceMotionEnabled: boolean;
  bodyHeadTracksEnabled: boolean;
  springRuntimeMode: SpringRuntimeMode;
};

export type ViewerAnimationState = {
  selectedMotionUrl: string;
  selectedLoopUrl: string;
  speed: number;
  paused: boolean;
  seekTime: number;
};

export const toonShadowSmoothByMode: Record<ToonShadowSmoothMode, number | null> = {
  auto: null,
  hard: 0.001,
  w003: 0.03,
  w005: 0.05,
  w008: 0.08,
  w012: 0.12,
};

export const valueShadowInfluenceByMode: Record<ValueShadowInfluenceMode, number> = {
  "0": 0,
  "0.25": 0.25,
  "0.5": 0.5,
  "1": 1,
};

export const characterYawDegreesByMode: Record<CharacterYawMode, number> = {
  "0": 0,
  "45": 45,
  "-45": -45,
  "90": 90,
  "-90": -90,
  "180": 180,
};

export const defaultRenderState: ViewerRenderState = {
  materialBindingMode: "manifest",
  hairShadowMode: "light",
  toonShadowSmoothMode: "auto",
  valueShadowInfluenceMode: "1",
  characterYawMode: "0",
  faceMotionEnabled: true,
  bodyHeadTracksEnabled: true,
  springRuntimeMode: "off",
};

export const defaultAnimationState: ViewerAnimationState = {
  selectedMotionUrl: "",
  selectedLoopUrl: "",
  speed: 1,
  paused: false,
  seekTime: 0,
};
