import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, FileAudio, Link2, ListMusic, LoaderCircle, Plus, Upload } from 'lucide-react';
import { Dialog, Segmented } from './ui/controls';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlayer } from '../state/store';
import { playback, type Preview } from '../audio/PlaybackController';
import { saveFile } from '../lib/persistence';
import { looksLikeYouTubeUrl, youtubeApiKey } from '../lib/youtubeApi';
import { parseYouTubeUrl } from '../lib/youtube';
import { COLLECTION_TINT } from '../lib/palette';
import type { Collection, Track } from '../audio/types';

export type AddTab = 'youtube' | 'local';
type Check = { status: 'idle' } | { status: 'invalid'; message: string } | { status: 'checking' } | { status: 'ready'; preview: Preview } | { status: 'failed'; message: string };

/** Synchronous validation while typing; the network preview follows after a pause. */
function validate(input: string, canSearch: boolean): string | null {
  const text = input.trim();
  if (!text) return null;
  if (!looksLikeYouTubeUrl(text)) return canSearch ? null : 'Paste a youtube.com or youtu.be link.';
  try { parseYouTubeUrl(/^https?:/i.test(text) ? text : `https://${text}`); return null; }
  catch (e) { return e instanceof Error ? e.message : 'This link could not be read.'; }
}

export function AddMusicDialog({ open, onOpenChange, tab, onTabChange }: { open: boolean; onOpenChange: (value: boolean) => void; tab: AddTab; onTabChange: (tab: AddTab) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange} title="Add music">
    <Tabs value={tab} onValueChange={v => onTabChange(v as AddTab)}>
      <Segmented label="Music source" value={tab} options={[{ value: 'youtube', label: 'Paste link', icon: <Link2 size={14} /> }, { value: 'local', label: 'Import files', icon: <FileAudio size={14} /> }]} />
      <TabsContent value="youtube"><LinkTab onDone={() => onOpenChange(false)} /></TabsContent>
      <TabsContent value="local"><FilesTab onDone={() => onOpenChange(false)} /></TabsContent>
    </Tabs>
  </Dialog>;
}

function LinkTab({ onDone }: { onDone: () => void }) {
  const canSearch = !!youtubeApiKey();
  const [url, setUrl] = useState(''); const [name, setName] = useState('');
  const [check, setCheck] = useState<Check>({ status: 'idle' });
  const [adding, setAdding] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    setError('');
    const text = url.trim();
    if (!text) { setCheck({ status: 'idle' }); return; }
    const invalid = validate(text, canSearch);
    if (invalid) { setCheck({ status: 'invalid', message: invalid }); return; }
    setCheck({ status: 'checking' });
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      playback.preview(text, ctrl.signal).then(preview => setCheck({ status: 'ready', preview }))
        .catch(e => { if ((e as Error).name !== 'AbortError') setCheck({ status: 'failed', message: e instanceof Error ? e.message : 'This link could not be opened.' }); });
    }, 400);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [url, canSearch]);
  const ready = check.status === 'ready';
  async function add(e: React.FormEvent) {
    e.preventDefault(); if (!ready || adding) return; setAdding(true); setError('');
    try { await playback.addFromYouTube(url, name, check.preview.kind === 'resolved' ? check.preview.resolved : undefined); setUrl(''); setName(''); onDone(); }
    catch (err) { setError(err instanceof Error ? err.message : 'This link could not be added.'); }
    finally { setAdding(false); }
  }
  const p = ready ? check.preview : null;
  const preview = p ? (p.kind === 'resolved'
    ? { title: p.resolved.title, artwork: p.resolved.tracks[0]?.artwork, count: p.resolved.tracks.length, note: p.resolved.skipped ? `${p.resolved.skipped} can't be embedded and will be left out.` : p.resolved.kind === 'radio' || p.resolved.kind === 'video' ? 'Starts with this video, then more from the same artist.' : '' }
    : p) : null;
  const bad = check.status === 'invalid' || check.status === 'failed';
  return <form className="stack" onSubmit={add} noValidate>
    <div className="field">
      <Label htmlFor="add-url" className="field-label">{canSearch ? 'YouTube link or search' : 'YouTube link'}</Label>
      <div className="input-wrap">
        <Link2 size={16} className="input-icon" aria-hidden="true" />
        <Input id="add-url" className="pl-9" autoFocus autoComplete="off" spellCheck={false} placeholder={canSearch ? 'youtube.com/playlist?list=… or an artist' : 'youtube.com/playlist?list=…'} value={url}
          aria-invalid={bad} aria-describedby="add-url-status" onChange={e => setUrl(e.target.value)} />
      </div>
      <p id="add-url-status" className={`field-status ${bad ? 'error' : ''}`} aria-live="polite">
        {check.status === 'idle' && 'Video, playlist or mix links work.'}
        {bad && <><CircleAlert size={14} />{check.message}</>}
        {check.status === 'checking' && <><LoaderCircle size={14} className="spinning" />Checking link…</>}
        {check.status === 'ready' && <><CheckCircle2 size={14} />Ready to add</>}
      </p>
    </div>
    {check.status === 'checking' && <div className="preview" aria-hidden="true"><Skeleton className="preview-art" /><span className="row-text gap-2"><Skeleton className="h-2.5 w-3/4" /><Skeleton className="h-2.5 w-2/5" /></span></div>}
    {preview && <div className="preview">
      {preview.artwork ? <img className="preview-art" src={preview.artwork} alt="" /> : <span className="preview-art"><ListMusic size={20} /></span>}
      <div className="row-text"><strong>{preview.title}</strong><small>{preview.count ? `${preview.count} ${preview.count === 1 ? 'track' : 'tracks'}` : 'Playlist'}{preview.note ? ` · ${preview.note}` : ''}</small></div>
    </div>}
    <div className="field">
      <Label htmlFor="add-name" className="field-label">Name <span className="optional">optional</span></Label>
      <Input id="add-name" value={name} maxLength={80} placeholder={preview?.title || 'Uses the playlist title'} onChange={e => setName(e.target.value)} />
    </div>
    {error && <p className="field-status error" role="alert"><CircleAlert size={14} />{error}</p>}
    <div className="dialog-actions"><Button type="submit" disabled={!ready || adding}>{adding ? <LoaderCircle className="spinning" size={16} /> : <Plus size={16} />}{adding ? 'Adding…' : 'Add to collection'}</Button></div>
  </form>;
}

function FilesTab({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [over, setOver] = useState(false);
  const files = useRef<HTMLInputElement>(null);
  async function importFiles(list: FileList | null) {
    if (!list?.length) return; setBusy(true); setError(''); const tracks: Track[] = [];
    try {
      for (const file of Array.from(list)) { if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|aac|flac|ogg|opus|webm|aiff?)$/i.test(file.name)) continue; const id = crypto.randomUUID(); await saveFile(id, file); tracks.push({ id, title: file.name.replace(/\.[^.]+$/, ''), artist: 'Your files', source: 'local', artwork: '/artwork/still.svg' }); }
      if (!tracks.length) throw new Error('Choose an audio file, such as MP3, WAV, M4A, OGG or FLAC.');
      const id = crypto.randomUUID(); tracks.forEach(t => t.collectionId = id);
      const title = tracks.length === 1 ? tracks[0].title : `${tracks[0].title} + ${tracks.length - 1} more`;
      const collection: Collection = { id, title, subtitle: `${tracks.length} local ${tracks.length === 1 ? 'track' : 'tracks'}`, artwork: '/artwork/still.svg', color: COLLECTION_TINT.local, tracks };
      usePlayer.getState().setCollections([...usePlayer.getState().collections, collection]); onDone(); await playback.selectCollection(collection);
    } catch (e) { setError(e instanceof Error ? e.message : 'Your files could not be saved. Browser storage might be full.'); } finally { setBusy(false); }
  }
  return <div className="stack">
    <div className={`file-drop ${over ? 'over' : ''}`} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); if (!busy) void importFiles(e.dataTransfer.files); }}>
      <Upload size={24} aria-hidden="true" /><span>Drop audio files here</span>
      <Button variant="outline" disabled={busy} onClick={() => files.current?.click()}>{busy ? <LoaderCircle className="spinning" size={16} /> : <FileAudio size={16} />}Choose files</Button>
      <input ref={files} hidden type="file" multiple accept="audio/*,.flac,.ogg,.m4a" onChange={e => void importFiles(e.target.files)} />
    </div>
    <p className="hint">Files stay in this browser. Nothing is uploaded. Each record is named after its files; double-click it later to rename.</p>
    {error && <p className="field-status error" role="alert"><CircleAlert size={14} />{error}</p>}
  </div>;
}
