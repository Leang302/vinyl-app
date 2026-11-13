import { useEffect, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useTurntable, type CameraView, type Part } from '../interaction/store';
import { haptic } from '../interaction/transport';

/* ═══ Tunables ═══════════════════════════════════════════════════════════════ */
export const TUNING = {
  /** Invisible hit meshes, relative to the visible part. */
  hitScale: { platter: 1.3, tonearm: 3 },
  /** Orbit limits around the current preset. Polar is absolute (0° = straight down). */
  orbit: { azimuthDeg: 35, polarMinDeg: 25, polarMaxDeg: 75, zoomMin: 0.85, zoomMax: 1.2, rotateSpeed: 0.55 },
  /** Subtle mouse parallax at rest (never on touch or with reduced motion). */
  parallaxDeg: 3,
  presetTweenMs: 600,
  /** After orbiting, ease back to the preset when idle this long. */
  idleReturnMs: 8000,
  /** A full turn of the record scrubs this many seconds. */
  scrubSecondsPerTurn: 30,
  /** Pointer travel before a press becomes a drag instead of a tap. */
  dragSlopPx: 6,
  hoverLabelDelayMs: 300,
  /** Hover glow fade time constant. */
  glowFadeMs: 150,
  /** Fit-to-viewport: padding around the model and the band kept clear for the toolbar. */
  fit: { paddingPx: 24, topInsetPx: 64, bottomInsetPx: 8 },
  /** Platter spin-up / spin-down. */
  spinSeconds: 1,
  /** Below this sustained frame rate, quality steps down (then falls back to 2D). */
  minFps: 30,
} as const;

/** Radius of a sphere that comfortably holds the turntable and speakers (world units). */
export const MODEL_RADIUS = 5.6;
const deg = THREE.MathUtils.degToRad;

export interface Preset { label: string; key: string; dir: [number, number, number]; target: [number, number, number]; zoom: number; polar?: [number, number] }
export const PRESETS: Record<CameraView, Preset> = {
  room: { label: 'Room', key: '1', dir: [5.8, 6.5, 8], target: [0, 0.5, 0], zoom: 1 },
  overhead: { label: 'Top-down', key: '2', dir: [0, 1, 0.12], target: [0, 0.6, 0.15], zoom: 0.92, polar: [4, 40] },
  detail: { label: 'Close-up', key: '3', dir: [0.62, 0.78, 0.62], target: [-0.5, 1, 0.1], zoom: 0.52 },
};

/** Camera distance that fits a sphere of `radius` inside the padded viewport. */
export function fitDistance(radius: number, fovDeg: number, width: number, height: number) {
  const { paddingPx: p, topInsetPx: top, bottomInsetPx: bottom } = TUNING.fit;
  const halfV = deg(fovDeg) / 2;
  const availH = Math.max(80, height - top - bottom - p * 2);
  const availW = Math.max(80, width - p * 2);
  const v = Math.atan(Math.tan(halfV) * availH / height);
  const h = Math.atan(Math.tan(halfV) * (width / height) * availW / width);
  return radius / Math.sin(Math.min(v, h));
}

export function presetPose(view: CameraView, fovDeg: number, width: number, height: number) {
  const p = PRESETS[view];
  const target = new THREE.Vector3(...p.target);
  const distance = fitDistance(MODEL_RADIUS, fovDeg, width, height) * p.zoom;
  const position = new THREE.Vector3(...p.dir).normalize().multiplyScalar(distance).add(target);
  return { position, target, distance };
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ═══ Camera rig ═════════════════════════════════════════════════════════════
 * Presets with eased tweens, damped mouse parallax at rest, limited optional
 * orbit on empty space, Ctrl/⌘-only wheel zoom, idle auto-return, and a view
 * offset that keeps the model clear of the toolbar. */
export function useCameraRig(controls: React.RefObject<OrbitControlsImpl | null>) {
  const { camera, size, gl, invalidate } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const view = useTurntable(s => s.view);
  const reset = useTurntable(s => s.cameraReset);
  const rig = useRef({
    mode: 'rest' as 'rest' | 'orbit' | 'tween',
    tween: null as null | { fromPos: THREE.Vector3; fromTarget: THREE.Vector3; toPos: THREE.Vector3; toTarget: THREE.Vector3; start: number },
    base: null as null | { position: THREE.Vector3; target: THREE.Vector3 },
    pointer: new THREE.Vector2(), mouse: false, interacting: false, idle: 0, first: true,
  });

  const applyLimits = (v: CameraView, distance: number) => {
    const c = controls.current; if (!c) return;
    const p = PRESETS[v]; const az = Math.atan2(p.dir[0], p.dir[2]);
    c.minAzimuthAngle = az - deg(TUNING.orbit.azimuthDeg); c.maxAzimuthAngle = az + deg(TUNING.orbit.azimuthDeg);
    c.minPolarAngle = deg(p.polar?.[0] ?? TUNING.orbit.polarMinDeg); c.maxPolarAngle = deg(p.polar?.[1] ?? TUNING.orbit.polarMaxDeg);
    c.minDistance = distance * TUNING.orbit.zoomMin; c.maxDistance = distance * TUNING.orbit.zoomMax;
  };
  const goTo = (animate: boolean) => {
    const r = rig.current; const c = controls.current;
    const pose = presetPose(view, cam.fov, size.width, size.height);
    window.clearTimeout(r.idle);
    useTurntable.getState().patch({ orbiting: false });
    r.base = { position: pose.position, target: pose.target };
    if (!animate || reducedMotion() || !c) {
      r.mode = 'rest'; r.tween = null;
      cam.position.copy(pose.position); c?.target.copy(pose.target); cam.lookAt(pose.target);
      applyLimits(view, pose.distance); c?.update(); invalidate(); return;
    }
    r.mode = 'tween'; c.enabled = false;
    r.tween = { fromPos: cam.position.clone(), fromTarget: c.target.clone(), toPos: pose.position, toTarget: pose.target, start: performance.now() };
    invalidate();
  };

  // Keep the model below the toolbar: shift the projection down by half the top inset.
  useEffect(() => {
    cam.setViewOffset(size.width, size.height, 0, -(TUNING.fit.topInsetPx - TUNING.fit.bottomInsetPx) / 2, size.width, size.height);
    cam.updateProjectionMatrix();
    const r = rig.current; if (r.mode !== 'orbit') goTo(false);
    invalidate();
  }, [size.width, size.height]); // eslint-disable-line react-hooks/exhaustive-deps

  // Preset change or Reset: ease to the preset (snap on first mount).
  useEffect(() => { const r = rig.current; goTo(!r.first); r.first = false; }, [view, reset]); // eslint-disable-line react-hooks/exhaustive-deps

  // Input wiring on the canvas container.
  useEffect(() => {
    const el = gl.domElement.parentElement; if (!el) return;
    const r = rig.current;
    // Plain wheel scrolls the page; Ctrl/⌘+wheel (and trackpad pinch, which sends ctrlKey) zooms.
    const onWheel = (e: WheelEvent) => { if (!e.ctrlKey && !e.metaKey) e.stopPropagation(); };
    const onMove = (e: PointerEvent) => {
      r.mouse = e.pointerType === 'mouse';
      if (!r.mouse) return;
      const b = el.getBoundingClientRect();
      r.pointer.set(((e.clientX - b.left) / b.width) * 2 - 1, ((e.clientY - b.top) / b.height) * 2 - 1);
      invalidate();
    };
    const onLeave = () => { r.pointer.set(0, 0); invalidate(); };
    el.addEventListener('wheel', onWheel, { capture: true });
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => { el.removeEventListener('wheel', onWheel, { capture: true }); el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerleave', onLeave); window.clearTimeout(r.idle); };
  }, [gl, invalidate]);

  // OrbitControls callbacks.
  const onStart = () => { const r = rig.current; r.interacting = true; window.clearTimeout(r.idle); };
  const onChange = () => {
    const r = rig.current;
    if (r.interacting && r.mode === 'rest' && !useTurntable.getState().active) { r.mode = 'orbit'; useTurntable.getState().patch({ orbiting: true }); }
  };
  const onEnd = () => {
    const r = rig.current; r.interacting = false;
    if (r.mode !== 'orbit') return;
    window.clearTimeout(r.idle);
    r.idle = window.setTimeout(() => { if (!useTurntable.getState().active) goTo(true); }, TUNING.idleReturnMs);
  };

  useFrame((_, dt) => {
    const r = rig.current; const c = controls.current; if (!c) return;
    if (r.mode === 'tween' && r.tween) {
      const t = Math.min(1, (performance.now() - r.tween.start) / TUNING.presetTweenMs); const k = easeInOutCubic(t);
      cam.position.lerpVectors(r.tween.fromPos, r.tween.toPos, k); c.target.lerpVectors(r.tween.fromTarget, r.tween.toTarget, k); cam.lookAt(c.target);
      if (t >= 1) { r.mode = 'rest'; r.tween = null; applyLimits(view, presetPose(view, cam.fov, size.width, size.height).distance); c.enabled = !useTurntable.getState().active; c.update(); }
      invalidate(); return;
    }
    if (r.mode === 'rest' && r.base) {
      // Damped parallax: rotate the base pose by at most ±parallaxDeg around the target.
      const on = r.mouse && !reducedMotion() && !useTurntable.getState().active;
      const yaw = on ? -r.pointer.x * deg(TUNING.parallaxDeg) : 0; const pitch = on ? -r.pointer.y * deg(TUNING.parallaxDeg) : 0;
      const offset = r.base.position.clone().sub(r.base.target); const s = new THREE.Spherical().setFromVector3(offset);
      s.theta += yaw; s.phi = THREE.MathUtils.clamp(s.phi + pitch, 0.05, Math.PI / 2 - 0.05);
      const desired = new THREE.Vector3().setFromSpherical(s).add(r.base.target);
      const before = cam.position.distanceToSquared(desired);
      cam.position.lerp(desired, 1 - Math.exp(-6 * dt)); c.target.copy(r.base.target); cam.lookAt(c.target);
      if (before > 1e-6) invalidate();
    }
  });

  return { onStart, onChange, onEnd };
}

/* ═══ Direct manipulation ════════════════════════════════════════════════════
 * One hook for every part: tap vs. drag, pointer capture, orbit disabled while
 * pressed, cursor, a delayed floating label (mouse only), haptics. */
export interface DragHandlers { start: (e: ThreeEvent<PointerEvent>) => boolean; move: (e: ThreeEvent<PointerEvent>) => void; end: (e: ThreeEvent<PointerEvent> | null, cancel: boolean) => void }
export function usePart(part: Part, opts: { label: () => string; onTap: () => void; drag?: DragHandlers }) {
  const canvas = useThree(s => s.gl.domElement);
  const controls = useThree(s => s.controls) as unknown as { enabled: boolean } | undefined;
  const invalidate = useThree(s => s.invalidate);
  const press = useRef<{ id: number; x: number; y: number; dragging: boolean; target: Element } | null>(null);
  const labelTimer = useRef(0);
  const optsRef = useRef(opts); optsRef.current = opts;
  const set = useTurntable.getState().patch;
  const showLabel = (x: number, y: number) => set({ label: { text: optsRef.current.label(), x, y } });
  const finish = () => {
    press.current = null;
    if (controls) controls.enabled = true;
    set({ active: null, preview: null });
    canvas.style.cursor = useTurntable.getState().hover === part ? (optsRef.current.drag ? 'grab' : 'pointer') : '';
    invalidate();
  };
  useEffect(() => () => { window.clearTimeout(labelTimer.current); if (press.current) { optsRef.current.drag?.end(null, true); finish(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    onPointerOver(e: ThreeEvent<PointerEvent>) {
      e.stopPropagation();
      if (e.pointerType !== 'mouse' || useTurntable.getState().active) return;
      set({ hover: part }); canvas.style.cursor = opts.drag ? 'grab' : 'pointer';
      window.clearTimeout(labelTimer.current);
      const { clientX: x, clientY: y } = e;
      labelTimer.current = window.setTimeout(() => { if (useTurntable.getState().hover === part && !press.current) showLabel(x, y); }, TUNING.hoverLabelDelayMs);
      invalidate();
    },
    onPointerOut(e: ThreeEvent<PointerEvent>) {
      e.stopPropagation(); window.clearTimeout(labelTimer.current);
      if (useTurntable.getState().hover === part) set({ hover: null, ...(press.current ? {} : { label: null }) });
      if (!press.current) canvas.style.cursor = '';
      invalidate();
    },
    onPointerDown(e: ThreeEvent<PointerEvent>) {
      if (e.button !== 0) return;
      e.stopPropagation();
      // Interactive part beats orbit: OrbitControls ignores moves while disabled.
      if (controls) controls.enabled = false;
      const target = e.target as Element; target.setPointerCapture(e.pointerId);
      press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dragging: false, target };
      window.clearTimeout(labelTimer.current);
      set({ active: part, label: null });
    },
    onPointerMove(e: ThreeEvent<PointerEvent>) {
      const p = press.current;
      if (!p) { if (useTurntable.getState().label && useTurntable.getState().hover === part) showLabel(e.clientX, e.clientY); return; }
      if (e.pointerId !== p.id) return;
      e.stopPropagation();
      if (!p.dragging && opts.drag && Math.hypot(e.clientX - p.x, e.clientY - p.y) > TUNING.dragSlopPx) {
        p.dragging = opts.drag.start(e);
        if (p.dragging) canvas.style.cursor = 'grabbing';
      }
      if (p.dragging) { opts.drag!.move(e); invalidate(); }
    },
    onPointerUp(e: ThreeEvent<PointerEvent>) {
      const p = press.current; if (!p || e.pointerId !== p.id) return;
      e.stopPropagation();
      try { p.target.releasePointerCapture(p.id); } catch { /* already released */ }
      if (p.dragging) opts.drag!.end(e, false); else { opts.onTap(); haptic(); }
      finish();
    },
    onPointerCancel(e: ThreeEvent<PointerEvent>) {
      const p = press.current; if (!p) return;
      if (p.dragging) opts.drag!.end(e, true);
      finish();
    },
    onLostPointerCapture(e: ThreeEvent<PointerEvent>) {
      const p = press.current; if (!p || e.pointerId !== p.id) return;
      if (p.dragging) opts.drag!.end(e, true);
      finish();
    },
  };
}

/** Damped 0→1 hover/press glow for a part (≈150ms fade). */
export function useGlow(part: Part) {
  const value = useRef(0);
  const invalidate = useThree(s => s.invalidate);
  useFrame((_, dt) => {
    const s = useTurntable.getState();
    const target = s.hover === part || s.active === part ? 1 : 0;
    const next = THREE.MathUtils.damp(value.current, target, 1000 / TUNING.glowFadeMs, dt);
    if (Math.abs(next - value.current) > 1e-3) invalidate();
    value.current = next;
  });
  return value;
}
