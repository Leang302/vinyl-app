import { HardDrive, Heart, ListMusic, LoaderCircle, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume1, Volume2, VolumeX, Youtube } from 'lucide-react';
import { useRef, useState, type CSSProperties } from 'react';
import { usePlayer } from '../state/store';
import { playback } from '../audio/PlaybackController';
import { IconButton, Slider, Tooltip } from './ui/controls';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatTime } from '../lib/utils';

/** Ellipsis by default; scrolls to reveal the full text only while hovered. */
function Marquee({ text, className }: { text: string; className?: string }) {
  const outer = useRef<HTMLSpanElement>(null);
  const [distance, setDistance] = useState(0);
  return <span ref={outer} className={`marquee ${distance ? 'on' : ''} ${className || ''}`} title={text} style={{ '--marquee': `${-distance}px` } as CSSProperties}
    onMouseEnter={() => { const el = outer.current; if (el && el.scrollWidth > el.clientWidth) setDistance(el.scrollWidth - el.clientWidth); }} onMouseLeave={() => setDistance(0)}>
    <span>{text}</span>
  </span>;
}

/** 4px scrub bar: buffered in --border-strong, played in --accent, time tooltip on hover. */
function Scrubber() {
  const position = usePlayer(s => s.position);
  const duration = usePlayer(s => s.duration);
  const buffered = usePlayer(s => s.buffered);
  const [hover, setHover] = useState<{ x: number; time: number } | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const value = dragging ?? Math.min(position, duration || 0);
  return <div className="scrubber" onPointerMove={e => { if (!duration) return; const r = e.currentTarget.getBoundingClientRect(); const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); setHover({ x: f * r.width, time: f * duration }); }} onPointerLeave={() => setHover(null)}>
    <Slider aria-label="Seek" aria-valuetext={`${formatTime(value)} of ${formatTime(duration)}`} min={0} max={duration || 1} step={.1} value={[value]} disabled={!duration}
      onValueChange={([v]) => setDragging(v)} onValueCommit={([v]) => { playback.seek(v); setDragging(null); }}>
      <span className="slider-buffered" style={{ width: `${Math.min(1, buffered) * 100}%` }} />
    </Slider>
    {hover && <span className="scrub-tip" style={{ left: hover.x }} aria-hidden="true">{formatTime(hover.time)}</span>}
  </div>;
}

/** The single source of truth for what is playing. */
export function PlaybackControls({ onQueue, queueOpen }: { onQueue: () => void; queueOpen: boolean }) {
  const track = usePlayer(s => s.track);
  const state = usePlayer(s => s.state);
  const position = usePlayer(s => s.position);
  const duration = usePlayer(s => s.duration);
  const volume = usePlayer(s => s.settings.volume);
  const shuffle = usePlayer(s => s.shuffle);
  const repeat = usePlayer(s => s.repeat);
  const favorite = usePlayer(s => !!s.track && s.favorites.includes(s.track.id));
  const playing = state === 'playing' || state === 'buffering';
  const repeatLabel = repeat === 'off' ? 'Repeat off' : repeat === 'all' ? 'Repeat queue' : 'Repeat track';
  const VolumeIcon = !volume ? VolumeX : volume < 50 ? Volume1 : Volume2;
  return <footer className="player-bar">
    <div className="pb-left">
      {track ? <img className="pb-cover" src={track.artwork} alt="" /> : <span className="pb-cover" aria-hidden="true" />}
      <div className="pb-text"><Marquee className="pb-title" text={track?.title || 'Nothing playing'} /><span className="pb-artist">{track?.artist || 'Pick a record to begin'}</span></div>
      <IconButton label={favorite ? 'Remove from favorites' : 'Add to favorites'} className={favorite ? 'on' : ''} disabled={!track} aria-pressed={favorite} onClick={() => track && usePlayer.getState().toggleFavorite(track.id)}><Heart size={18} fill={favorite ? 'currentColor' : 'none'} /></IconButton>
    </div>
    <div className="pb-center">
      <div className="pb-buttons">
        <IconButton label={shuffle ? 'Shuffle on' : 'Shuffle off'} className="pb-shuffle" aria-pressed={shuffle} onClick={() => playback.setShuffle(!shuffle)}><Shuffle size={18} /></IconButton>
        <IconButton label="Previous" shortcut="P" className="pb-prev" disabled={!track} onClick={() => void playback.previous()}><SkipBack size={20} fill="currentColor" /></IconButton>
        <Tooltip label={playing ? 'Pause' : 'Play'} shortcut="Space"><Button size="play" className="pb-play" aria-label={playing ? 'Pause' : 'Play'} aria-keyshortcuts="Space" disabled={!track} onClick={() => void playback.toggle()}>{state === 'loading' ? <LoaderCircle className="spinning" size={20} /> : playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}</Button></Tooltip>
        <IconButton label="Next" shortcut="N" className="pb-next" disabled={!track} onClick={() => void playback.next()}><SkipForward size={20} fill="currentColor" /></IconButton>
        <IconButton label={repeatLabel} className="pb-repeat" aria-pressed={repeat !== 'off'} onClick={() => playback.cycleRepeat()}>{repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}</IconButton>
      </div>
      <div className="pb-progress">
        <span className="time">{formatTime(position)}</span>
        <Scrubber />
        <span className="time">{formatTime(duration)}</span>
      </div>
    </div>
    <div className="pb-right">
      <IconButton label={queueOpen ? 'Hide queue' : 'Show queue'} className="queue-toggle" aria-expanded={queueOpen} aria-pressed={queueOpen} onClick={onQueue}><ListMusic size={18} /></IconButton>
      <IconButton label={volume ? 'Mute' : 'Unmute'} shortcut="M" onClick={() => usePlayer.getState().toggleMute()}><VolumeIcon size={18} /></IconButton>
      <Slider className="volume" aria-label="Volume" min={0} max={100} step={1} value={[volume]} onValueChange={([v]) => usePlayer.getState().setSettings({ volume: v })} />
      {track && <Badge data-slot="source-badge">{track.source === 'youtube' ? <><Youtube size={12} />YouTube</> : <><HardDrive size={12} />Local</>}</Badge>}
    </div>
  </footer>;
}
