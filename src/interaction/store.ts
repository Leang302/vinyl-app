import { create } from 'zustand';
import { loadUi } from '../lib/uiStorage';
const initialUi = loadUi();
/** Camera presets: Room, Top-down, Close-up. */
export type CameraView = 'room' | 'overhead' | 'detail';
/** The only directly manipulable parts of the model. */
export type Part = 'record' | 'tonearm' | 'cover';
export type ActiveControl = Part | 'brake' | null;
interface TurntableInteraction {
  view: CameraView;
  /** Bumped to ease the camera back to the current preset. */
  cameraReset: number;
  /** Part being pressed/dragged; orbit is disabled while set. */
  active: ActiveControl;
  /** Part under a mouse pointer (never set by touch). */
  hover: Part | null;
  /** Scrub preview time while dragging the record. */
  preview: number | null;
  /** Floating label near the cursor ("Play", "Drag to seek", a scrub time). */
  label: { text: string; x: number; y: number } | null;
  /** The user has orbited away from the preset (auto-returns when idle). */
  orbiting: boolean;
  needleLifted: boolean;
  coverOpen: boolean;
  patch: (patch: Partial<TurntableInteraction>) => void;
}
export const useTurntable = create<TurntableInteraction>((set) => ({
  view: initialUi.view, cameraReset: 0, active: null, hover: null, preview: null, label: null, orbiting: false,
  needleLifted: false, coverOpen: true,
  patch: patch => set(patch),
}));
