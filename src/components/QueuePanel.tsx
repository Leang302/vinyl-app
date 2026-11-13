import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowUpRight, CircleSlash, Disc3, GripVertical, Heart, ListEnd, Pencil, Play, Plus, Trash2, X, Youtube, HardDrive } from 'lucide-react';
import { usePlayer } from '../state/store';
import { playback, watchUrl } from '../audio/PlaybackController';
import { formatTime } from '../lib/utils';
import { loadUi, saveUi } from '../lib/uiStorage';
import { IconButton, InlineRename, Menu } from './ui/controls';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { Track } from '../audio/types';

/** Loading placeholder shaped like a 56px list row. */
export function SkeletonRow({ as: Tag = 'div' }: { as?: 'div' | 'li' }) {
  return <Tag className="row skeleton-row" aria-hidden="true"><Skeleton className="size-10 shrink-0" /><span className="row-text gap-2"><Skeleton className="h-2.5 w-3/4" /><Skeleton className="h-2.5 w-2/5" /></span></Tag>;
}

/** Right panel: the queue is the hero. */
export function QueuePanel({ onAdd, onClose }: { onAdd: () => void; onClose: () => void }) {
  const queueLength = usePlayer(s => s.queue.length);
  const index = usePlayer(s => s.index);
  const [showPlayed, setShowPlayed] = useState(() => loadUi().showPlayed);
  const upcoming = Math.max(0, queueLength - index - 1);
  const toggleHistory = () => { setShowPlayed(v => { saveUi({ showPlayed: !v }); return !v; }); };
  return <aside className="queue-panel" aria-label="Now playing and queue">
    <div className="panel-head">
      <h2>Now playing</h2>
      <IconButton label="Close queue" className="drawer-close" onClick={onClose}><X size={18} /></IconButton>
    </div>
    <NowPlayingCard />
    <div className="section-head">
      <h3>Up next <span className="count">{upcoming}</span></h3>
      <div className="section-actions">
        {index > 0 && <Button variant="outline" size="sm" aria-pressed={showPlayed} onClick={toggleHistory}>{showPlayed ? 'Hide played' : `Played (${index})`}</Button>}
        {queueLength > 0 && <Button variant="outline" size="sm" onClick={() => playback.clearWithUndo()}>Clear</Button>}
      </div>
    </div>
    <QueueList showPlayed={showPlayed} onAdd={onAdd} />
  </aside>;
}

function NowPlayingCard() {
  const track = usePlayer(s => s.track);
  const position = usePlayer(s => s.position);
  const duration = usePlayer(s => s.duration);
  const playing = usePlayer(s => s.state === 'playing');
  if (!track) return <div className="now-card empty"><span className="thumb lg"><Disc3 size={20} /></span><div className="row-text"><strong>Nothing on the platter</strong><small>Pick a record to start</small></div></div>;
  const pct = duration ? Math.min(100, position / duration * 100) : 0;
  return <div className="now-card">
    <span className="thumb lg"><img src={track.artwork} alt="" />{playing && <span className="eq on" aria-hidden="true"><i /><i /><i /></span>}</span>
    <div className="row-text">
      <strong title={track.title}>{track.title}</strong>
      <small>{track.source === 'youtube' ? <Youtube size={12} aria-label="YouTube" /> : <HardDrive size={12} aria-label="Local file" />}{track.artist}</small>
      <div className="mini-progress" role="progressbar" aria-label="Track progress" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(position)} aria-valuetext={`${formatTime(position)} of ${formatTime(duration)}`}><span style={{ width: `${pct}%` }} /></div>
    </div>
  </div>;
}

interface DragState { from: number; to: number; dy: number; startY: number; rects: DOMRect[]; pointer: number }

function QueueList({ showPlayed, onAdd }: { showPlayed: boolean; onAdd: () => void }) {
  const queue = usePlayer(s => s.queue);
  const index = usePlayer(s => s.index);
  const playing = usePlayer(s => s.state === 'playing');
  const resolving = usePlayer(s => s.resolving);
  const hydrated = usePlayer(s => s.hydrated);
  const favorites = usePlayer(s => s.favorites);
  const list = useRef<HTMLOListElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const focusAfterMove = useRef<number | null>(null);
  const start = showPlayed ? 0 : index + 1;
  const rows = queue.slice(start);
  useEffect(() => {
    if (focusAfterMove.current === null) return;
    list.current?.querySelectorAll<HTMLButtonElement>('.row-main')[focusAfterMove.current - start]?.focus();
    focusAfterMove.current = null;
  }, [queue, start]);
  // Keep the current row visible by scrolling the list only (scrollIntoView would also scroll the page).
  useEffect(() => {
    const box = list.current; const row = box?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!box || !row || box.scrollHeight <= box.clientHeight) return;
    if (row.offsetTop < box.scrollTop) box.scrollTop = row.offsetTop - 16;
    else if (row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight + 16;
  }, [index, showPlayed]);

  if (!hydrated || (resolving && !queue.length)) return <ol className="list-scroll" aria-busy="true" aria-label="Loading queue">{[0, 1, 2, 3, 4].map(i => <SkeletonRow key={i} as="li" />)}</ol>;
  if (!queue.length) return <div className="empty-state"><Disc3 size={28} /><p>No records yet. Paste a YouTube link or import audio.</p><Button variant="outline" onClick={onAdd}><Plus size={16} />Add music</Button></div>;
  if (!rows.length) return <div className="empty-state"><ListEnd size={24} /><p>That's the end of the queue.</p></div>;

  const begin = (e: ReactPointerEvent, i: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const rects = Array.from(list.current?.children || []).map(el => el.getBoundingClientRect());
    setDrag({ from: i, to: i, dy: 0, startY: e.clientY, rects, pointer: e.pointerId });
  };
  const moveDrag = (e: ReactPointerEvent) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const dy = e.clientY - drag.startY;
    const r = drag.rects[drag.from];
    const center = r.top + r.height / 2 + dy;
    let to = 0;
    drag.rects.forEach((rect, k) => { if (k !== drag.from && center > rect.top + rect.height / 2) to++; });
    setDrag({ ...drag, dy, to });
  };
  const endDrag = (e: ReactPointerEvent) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    if (drag.to !== drag.from) playback.move(start + drag.from, start + drag.to);
    setDrag(null);
  };
  const shift = (k: number) => {
    if (!drag) return 0;
    if (k === drag.from) return drag.dy;
    const h = drag.rects[drag.from].height + 4;
    if (drag.from < drag.to && k > drag.from && k <= drag.to) return -h;
    if (drag.to < drag.from && k >= drag.to && k < drag.from) return h;
    return 0;
  };
  return <ol className={`list-scroll ${drag ? 'is-dragging' : ''}`} ref={list} aria-label="Up next">
    {rows.map((t, k) => {
      const i = start + k;
      return <QueueRow key={t.id} track={t} current={i === index} playing={playing && i === index} favorite={favorites.includes(t.id)}
        dragging={drag?.from === k} offset={shift(k)} renaming={renaming === t.id}
        onPlay={() => void playback.pick(i)}
        onHandleDown={e => begin(e, k)} onHandleMove={moveDrag} onHandleUp={endDrag}
        onMove={dir => { const to = i + dir; if (to < start || to >= queue.length) return; focusAfterMove.current = to; playback.move(i, to); }}
        onRename={() => setRenaming(t.id)} onRenamed={v => { setRenaming(null); if (v !== null) playback.renameTrack(t.id, v); }}
        onRemove={() => void playback.remove(i)} />;
    })}
  </ol>;
}

function QueueRow({ track, current, playing, favorite, dragging, offset, renaming, onPlay, onHandleDown, onHandleMove, onHandleUp, onMove, onRename, onRenamed, onRemove }: {
  track: Track; current: boolean; playing: boolean; favorite: boolean; dragging: boolean; offset: number; renaming: boolean;
  onPlay: () => void; onHandleDown: (e: ReactPointerEvent) => void; onHandleMove: (e: ReactPointerEvent) => void; onHandleUp: (e: ReactPointerEvent) => void;
  onMove: (dir: -1 | 1) => void; onRename: () => void; onRenamed: (value: string | null) => void; onRemove: () => void;
}) {
  return <li className={`row ${current ? 'selected' : ''} ${dragging ? 'dragging' : ''} ${track.blocked ? 'blocked' : ''}`} aria-current={current || undefined} style={offset ? { transform: `translateY(${offset}px)` } : undefined}>
    <span className="drag-handle" aria-hidden="true" title="Drag to reorder" onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp}><GripVertical size={16} /></span>
    {renaming ? <div className="row-main"><span className="thumb"><img src={track.artwork} alt="" /></span><InlineRename value={track.title} label="Track name" onDone={onRenamed} /></div>
      : <button type="button" className="row-main" onClick={onPlay} aria-label={`${current ? 'Now playing: ' : 'Play '}${track.title} by ${track.artist}${track.blocked ? ", can't embed" : ''}. Alt+arrow keys reorder.`}
        onKeyDown={e => { if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); e.stopPropagation(); onMove(e.key === 'ArrowUp' ? -1 : 1); } }}>
        <span className="thumb"><img src={track.artwork} alt="" loading="lazy" />{current ? <span className={`eq ${playing ? 'on' : ''}`} aria-hidden="true"><i /><i /><i /></span> : <span className="thumb-play" aria-hidden="true"><Play size={14} fill="currentColor" /></span>}</span>
        <span className="row-text"><strong>{track.title}</strong><small>{track.artist}</small></span>
        {track.blocked ? <Badge variant="warning"><CircleSlash size={12} />Can't embed</Badge> : !!track.duration && <span className="row-meta">{formatTime(track.duration)}</span>}
      </button>}
    {track.blocked && <IconButton label="Open on YouTube" size="sm" onClick={() => window.open(watchUrl(track), '_blank', 'noopener')}><ArrowUpRight size={16} /></IconButton>}
    <Menu label={`More options for ${track.title}`} items={[
      { label: 'Play next', icon: <ListEnd size={16} />, onSelect: () => playback.playNext([track]), disabled: current },
      { label: favorite ? 'Remove from favorites' : 'Add to favorites', icon: <Heart size={16} />, onSelect: () => usePlayer.getState().toggleFavorite(track.id) },
      { label: 'Rename', icon: <Pencil size={16} />, onSelect: onRename },
      { label: 'Remove from queue', icon: <Trash2 size={16} />, onSelect: onRemove, danger: true },
    ]} />
  </li>;
}
