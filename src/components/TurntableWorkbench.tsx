import { useEffect, useState } from 'react';
import { CircleHelp, Maximize, Minimize, Pause, Play, RotateCcw, SkipBack, SkipForward, Undo2, ArrowUpFromLine, ArrowDownToLine, PanelTopClose, PanelTopOpen } from 'lucide-react';
import { useTurntable, type CameraView } from '../interaction/store';
import { resetCamera, setCameraView, toggleCover, toggleNeedle, togglePlay } from '../interaction/transport';
import { usePlayer } from '../state/store';
import { playback } from '../audio/PlaybackController';
import { loadUi, saveUi } from '../lib/uiStorage';
import { PRESETS } from '../scene/useTurntableControls';
import { IconButton, Tooltip } from './ui/controls';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

export const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause'], ['← / →', 'Seek 5 seconds'], ['J', 'Back 10 seconds'], ['N / P', 'Next / previous'],
  ['L', 'Lift / drop needle'], ['C', 'Open / close cover'], ['1 / 2 / 3', 'Room / Top-down / Close-up'],
  ['R', 'Reset camera'], ['F', 'Fullscreen'], ['M', 'Mute'], ['/', 'Search the collection'],
];
const GESTURES: [string, string][] = [
  ['Click the record', 'Play or pause'], ['Drag around the record', 'Scrub (one turn ≈ 30 s)'], ['Click the tonearm', 'Lift or drop the needle'],
  ['Click the cover', 'Open or close it'], ['Drag empty space', 'Look around (eases back after 8 s)'], ['Ctrl/⌘ + scroll, or pinch', 'Zoom'], ['Double-click empty space', 'Reset the camera'],
];

/** One floating pill: [Room | Top-down | Close-up] | [Reset] [Fullscreen] [Help]. No interaction modes. */
export function StageToolbar({ fullscreen, onFullscreen, canFullscreen }: { fullscreen: boolean; onFullscreen: () => void; canFullscreen: boolean }) {
  const view = useTurntable(s => s.view);
  const orbiting = useTurntable(s => s.orbiting);
  return <div className="stage-toolbar" role="toolbar" aria-label="Camera">
    <ToggleGroup type="single" value={view} onValueChange={v => { if (v) setCameraView(v as CameraView); }} aria-label="Camera preset" className="gap-0.5">
      {(Object.keys(PRESETS) as CameraView[]).map(v => <Tooltip key={v} label={`${PRESETS[v].label} view`} shortcut={PRESETS[v].key} side="bottom">
        <ToggleGroupItem value={v} aria-label={`${PRESETS[v].label} view`} className="h-8 rounded-full px-3 text-xs">{PRESETS[v].label}</ToggleGroupItem>
      </Tooltip>)}
    </ToggleGroup>
    <Separator orientation="vertical" className="mx-1 h-5 bg-border-strong" />
    <IconButton label="Reset camera" shortcut="R" side="bottom" className={orbiting ? 'text-primary' : undefined} onClick={resetCamera}><RotateCcw size={16} /></IconButton>
    {canFullscreen && <IconButton label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} shortcut="F" side="bottom" aria-pressed={fullscreen} onClick={onFullscreen}>{fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}</IconButton>}
    <Popover>
      <Tooltip label="Gestures & shortcuts" shortcut="?" side="bottom"><PopoverTrigger asChild><Button variant="ghost" size="icon" aria-label="Gestures and keyboard shortcuts" className="btn-icon"><CircleHelp size={16} /></Button></PopoverTrigger></Tooltip>
      <PopoverContent align="end" className="w-80">
        <p className="mb-2 text-sm font-semibold">On the turntable</p>
        <dl className="shortcuts mb-4">{GESTURES.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        <p className="mb-2 text-sm font-semibold">Keyboard</p>
        <dl className="shortcuts">{SHORTCUTS.map(([k, v]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{v}</dd></div>)}</dl>
      </PopoverContent>
    </Popover>
  </div>;
}

/** "Click the record to play · Drag to scrub" — shown once, fades after the first interaction, never again. */
export function FirstRunHint() {
  const [visible, setVisible] = useState(() => !loadUi().hintsSeen);
  const active = useTurntable(s => s.active);
  const playing = usePlayer(s => s.state === 'playing');
  useEffect(() => { if (visible && (active || playing)) { setVisible(false); saveUi({ hintsSeen: true }); } }, [active, playing, visible]);
  const touch = typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;
  return <div className={`first-run-hint ${visible ? '' : 'hidden'}`} aria-hidden={!visible} role="note">
    {touch ? 'Tap the record to play · Drag it to scrub' : 'Click the record to play · Drag it to scrub'}
  </div>;
}

/** Transport pill under the stage: the primary path, works without WebGL. Mirrors 3D state. */
export function TransportRow() {
  const needleLifted = useTurntable(s => s.needleLifted);
  const coverOpen = useTurntable(s => s.coverOpen);
  const hasTrack = usePlayer(s => !!s.track);
  const state = usePlayer(s => s.state);
  const hasDuration = usePlayer(s => s.duration > 0);
  useEffect(() => { if (state === 'playing') useTurntable.getState().patch({ needleLifted: false }); }, [state]);
  const playing = state === 'playing' || state === 'buffering';
  const needleDown = state === 'playing' && !needleLifted;
  return <div className="transport-pill" role="group" aria-label="Turntable controls">
    <IconButton label="Previous" shortcut="P" disabled={!hasTrack} onClick={() => { useTurntable.getState().patch({ needleLifted: false }); void playback.previous(); }}><SkipBack size={18} /></IconButton>
    <IconButton label="Back 10 seconds" shortcut="J" disabled={!hasDuration} onClick={() => playback.seekBy(-10)}><Undo2 size={18} /></IconButton>
    <IconButton label={needleDown ? 'Needle down · lift needle' : 'Needle up · drop needle'} shortcut="L" className="needle" aria-pressed={needleDown} disabled={!hasTrack} onClick={toggleNeedle}>{needleDown ? <ArrowUpFromLine size={18} /> : <ArrowDownToLine size={18} />}</IconButton>
    <IconButton label={playing ? 'Pause' : 'Play'} shortcut="Space" size="lg" disabled={!hasTrack} onClick={togglePlay}>{playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}</IconButton>
    <IconButton label={coverOpen ? 'Close cover' : 'Open cover'} shortcut="C" aria-pressed={!coverOpen} onClick={toggleCover}>{coverOpen ? <PanelTopClose size={18} /> : <PanelTopOpen size={18} />}</IconButton>
    <IconButton label="Next" shortcut="N" disabled={!hasTrack} onClick={() => { useTurntable.getState().patch({ needleLifted: false }); void playback.next(); }}><SkipForward size={18} /></IconButton>
  </div>;
}
