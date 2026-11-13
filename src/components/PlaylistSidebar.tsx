import { useEffect, useState, type RefObject } from 'react';
import { Disc3, HardDrive, Heart, History, ListEnd, Pencil, Play, Plus, Search, SearchX, Trash2, X, Youtube } from 'lucide-react';
import { usePlayer } from '../state/store';
import { playback } from '../audio/PlaybackController';
import { removeCollection } from '../lib/CollectionManager';
import { loadUi, saveUi, type UiState } from '../lib/uiStorage';
import { IconButton, InlineRename, Menu } from './ui/controls';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SkeletonRow } from './QueuePanel';
import type { Collection, Track } from '../audio/types';

type Filter = UiState['filter'];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = window.setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function PlaylistSidebar({ onAdd, mobileOpen, onClose, searchRef }: { onAdd: () => void; mobileOpen: boolean; onClose: () => void; searchRef: RefObject<HTMLInputElement | null> }) {
  const [filter, setFilterState] = useState<Filter>(() => loadUi().filter);
  const setFilter = (f: Filter) => { setFilterState(f); saveUi({ filter: f }); };
  const [text, setText] = useState('');
  const query = useDebounced(text.trim().toLowerCase(), 200);
  const [renaming, setRenaming] = useState<string | null>(null);
  const collections = usePlayer(s => s.collections);
  const favorites = usePlayer(s => s.favorites);
  const recent = usePlayer(s => s.recent);
  const hydrated = usePlayer(s => s.hydrated);
  const currentCollection = usePlayer(s => s.track?.collectionId);
  const currentTrack = usePlayer(s => s.track?.id);
  const playing = usePlayer(s => s.state === 'playing');
  const allTracks = collections.flatMap(c => c.tracks);
  const byId = new Map(allTracks.map(t => [t.id, t]));
  const tracks = (filter === 'favorites' ? allTracks.filter(t => favorites.includes(t.id)) : recent.map(id => byId.get(id)).filter((t): t is Track => !!t))
    .filter(t => `${t.title} ${t.artist}`.toLowerCase().includes(query));
  const shown = collections.filter(c => `${c.title} ${c.subtitle}`.toLowerCase().includes(query));
  const nav: { id: Filter; label: string; icon: typeof Disc3; count?: number }[] = [
    { id: 'all', label: 'All records', icon: Disc3, count: collections.length },
    { id: 'favorites', label: 'Favorites', icon: Heart, count: favorites.length },
    { id: 'recent', label: 'Recently played', icon: History },
  ];
  const noResults = !!query && (filter === 'all' ? !shown.length : !tracks.length);
  return <aside className={`library-panel ${mobileOpen ? 'mobile-open' : ''}`} aria-label="Collection">
    <div className="panel-head">
      <h2>Collection</h2>
      <IconButton label="Close collection" className="drawer-close" onClick={onClose}><X size={18} /></IconButton>
    </div>
    <nav className="library-nav" aria-label="Collection views">
      {nav.map(item => <button type="button" key={item.id} aria-current={filter === item.id || undefined} onClick={() => setFilter(item.id)}><item.icon size={16} />{item.label}{item.count !== undefined && <span className="count">{item.count}</span>}</button>)}
    </nav>
    <div className="input-wrap">
      <Search size={16} className="input-icon" aria-hidden="true" />
      <Input ref={searchRef} className="pl-9 pr-10" type="search" aria-label="Search your collection" aria-keyshortcuts="/" placeholder="Search  /" value={text}
        onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); if (text) setText(''); else e.currentTarget.blur(); } }} />
      {text && <IconButton label="Clear search" size="sm" className="input-clear" onClick={() => { setText(''); searchRef.current?.focus(); }}><X size={14} /></IconButton>}
    </div>
    <div className="list-scroll" role="list" aria-busy={!hydrated}>
      {!hydrated ? [0, 1, 2].map(i => <div key={i} role="listitem"><SkeletonRow /></div>)
        : noResults ? <div className="empty-state" role="listitem"><SearchX size={24} /><p>No results for “{text.trim()}”.</p><Button variant="outline" size="sm" onClick={() => setText('')}>Clear search</Button></div>
        : filter === 'all' ? <>
          {shown.map(collection => <CollectionRow key={collection.id} collection={collection} selected={currentCollection === collection.id} playing={playing && currentCollection === collection.id}
            renaming={renaming === collection.id} onRename={() => setRenaming(collection.id)}
            onRenamed={v => { setRenaming(null); if (v !== null) playback.renameCollection(collection.id, v); }}
            onPlay={() => { void playback.selectCollection(collection); onClose(); }} />)}
          {!collections.length && <div className="empty-state" role="listitem"><Disc3 size={24} /><p>No records yet. Paste a YouTube link or import audio.</p></div>}
          {!query && <div role="listitem"><button type="button" className="add-tile" onClick={onAdd}><span className="thumb"><Plus size={18} /></span>Add music</button></div>}
        </>
        : tracks.length ? tracks.map(t => <div key={t.id} role="listitem" className={`row ${currentTrack === t.id ? 'selected' : ''}`}>
          <button type="button" className="row-main" onClick={() => { usePlayer.getState().patch({ queue: tracks, index: tracks.findIndex(x => x.id === t.id), unshuffled: null, shuffle: false }); void playback.selectTrack(t, true); onClose(); }}>
            <span className="thumb"><img src={t.artwork} alt="" loading="lazy" />{currentTrack === t.id ? <span className={`eq ${playing ? 'on' : ''}`} aria-hidden="true"><i /><i /><i /></span> : <span className="thumb-play" aria-hidden="true"><Play size={14} fill="currentColor" /></span>}</span>
            <span className="row-text"><strong>{t.title}</strong><small>{t.artist}</small></span>
          </button>
          <Menu label={`More options for ${t.title}`} items={[
            { label: 'Play next', icon: <ListEnd size={16} />, onSelect: () => playback.playNext([t]) },
            { label: favorites.includes(t.id) ? 'Remove from favorites' : 'Add to favorites', icon: <Heart size={16} />, onSelect: () => usePlayer.getState().toggleFavorite(t.id) },
          ]} />
        </div>)
        : <div className="empty-state" role="listitem">{filter === 'favorites' ? <Heart size={24} /> : <History size={24} />}<p>{filter === 'favorites' ? 'Tap the heart in the player to keep a track here.' : 'Tracks you play will show up here.'}</p></div>}
    </div>
  </aside>;
}

function CollectionRow({ collection, selected, playing, renaming, onPlay, onRename, onRenamed }: { collection: Collection; selected: boolean; playing: boolean; renaming: boolean; onPlay: () => void; onRename: () => void; onRenamed: (v: string | null) => void }) {
  const isYouTube = !!collection.youtubeUrl || collection.tracks[0]?.source === 'youtube';
  const count = collection.tracks.length;
  const meta = <small>{isYouTube ? <Youtube size={12} aria-label="YouTube" /> : <HardDrive size={12} aria-label="Local files" />}{count ? `${count} ${count === 1 ? 'track' : 'tracks'}` : 'Not loaded yet'}</small>;
  return <div role="listitem" className={`row ${selected ? 'selected' : ''}`} draggable={!renaming} onDragStart={e => e.dataTransfer.setData('vinyl/collection', collection.id)}>
    {renaming ? <div className="row-main"><span className="thumb"><img src={collection.artwork} alt="" /></span><span className="row-text"><InlineRename value={collection.title} label="Record name" onDone={onRenamed} />{meta}</span></div>
      : <button type="button" className="row-main" onClick={onPlay} onDoubleClick={e => { e.preventDefault(); onRename(); }} title="Double-click to rename" aria-label={`Play ${collection.title}`}>
        <span className="thumb"><img src={collection.artwork} alt="" loading="lazy" />{selected ? <span className={`eq ${playing ? 'on' : ''}`} aria-hidden="true"><i /><i /><i /></span> : <span className="thumb-play" aria-hidden="true"><Play size={14} fill="currentColor" /></span>}</span>
        <span className="row-text"><strong>{collection.title}</strong>{meta}</span>
      </button>}
    <Menu label={`More options for ${collection.title}`} items={[
      { label: 'Play next', icon: <ListEnd size={16} />, onSelect: () => playback.playNext(collection.tracks), disabled: !count },
      { label: 'Rename', icon: <Pencil size={16} />, onSelect: onRename },
      { label: 'Remove', icon: <Trash2 size={16} />, danger: true, onSelect: () => { if (selected) playback.clear(); void removeCollection(collection.id); } },
    ]} />
  </div>;
}
