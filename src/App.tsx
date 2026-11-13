import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Disc3, LoaderCircle, Menu as MenuIcon, Plus } from 'lucide-react';
import { usePlayer } from './state/store';
import { playback } from './audio/PlaybackController';
import { PlaylistSidebar } from './components/PlaylistSidebar';
import { SettingsDialog, type SettingsTab } from './components/SettingsPanel';
import { PlaybackControls } from './components/PlaybackControls';
import { StageToolbar, TransportRow, FirstRunHint, SHORTCUTS } from './components/TurntableWorkbench';
import { resetCamera, setCameraView, toggleCover, toggleNeedle } from './interaction/transport';
import { AddMusicDialog, type AddTab } from './components/AddMusicDialog';
import { QueuePanel } from './components/QueuePanel';
import { MediaDock } from './components/MediaDock';
import { HeaderMenu, type MenuAction } from './components/HeaderMenu';
import { Toast } from './components/Toast';
import { Dialog, IconButton, TooltipProvider } from './components/ui/controls';
import { Button } from '@/components/ui/button';
const TurntableScene=lazy(()=>import('./scene/TurntableScene'));


export default function App(){
 const [addOpen,setAddOpen]=useState(false);const [addTab,setAddTab]=useState<AddTab>('youtube');
 const [settingsOpen,setSettingsOpen]=useState(false);const [settingsTab,setSettingsTab]=useState<SettingsTab>('sound');
 const [aboutOpen,setAboutOpen]=useState(false);
 const [libraryOpen,setLibraryOpen]=useState(false);
 const [queueOpen,setQueueOpen]=useState(false);
 const [fullscreen,setFullscreen]=useState(false);
 const searchRef=useRef<HTMLInputElement>(null);
 const hydrated=usePlayer(s=>s.hydrated);const state=usePlayer(s=>s.state);const collectionCount=usePlayer(s=>s.collections.length);const mode=usePlayer(s=>s.mode);
 const canFullscreen=typeof document!=='undefined'&&!!document.fullscreenEnabled;
 useEffect(()=>{playback.start();void usePlayer.getState().hydrate();return()=>playback.dispose();},[]);
 useEffect(()=>{const on=()=>setFullscreen(!!document.fullscreenElement);document.addEventListener('fullscreenchange',on);return()=>document.removeEventListener('fullscreenchange',on);},[]);
 const toggleFullscreen=()=>{if(document.fullscreenElement)void document.exitFullscreen();else void document.documentElement.requestFullscreen().catch(()=>usePlayer.getState().notify('Fullscreen is not available here.'));};
 const focusSearch=useCallback(()=>{if(window.matchMedia('(max-width: 699px)').matches)setLibraryOpen(true);requestAnimationFrame(()=>searchRef.current?.focus());},[]);
 // Global shortcuts. Ignored while typing, inside dialogs/menus, and for keys the focused control already uses.
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{
  if(e.defaultPrevented||e.metaKey||e.ctrlKey||e.altKey)return;
  const t=e.target instanceof HTMLElement?e.target:null;
  if(t?.closest('input,textarea,select,[contenteditable=true]'))return;
  if(t?.closest('[role=dialog],[role=menu]'))return;
  if(e.key==='/'){e.preventDefault();focusSearch();return;}
  if(e.key.startsWith('Arrow')&&t?.closest('[role=slider],[role=tablist]'))return;
  if(e.key===' '&&t?.closest('button,a,[role=slider],[role=tab]'))return;
  const s=usePlayer.getState();
  switch(e.key.toLowerCase()){
   case ' ':e.preventDefault();void playback.toggle();break;
   case 'arrowleft':e.preventDefault();playback.seekBy(-5);break;
   case 'arrowright':e.preventDefault();playback.seekBy(5);break;
   case 'j':playback.seekBy(-10);break;
   case 'l':toggleNeedle();break;
   case 'c':toggleCover();break;
   case '1':setCameraView('room');break;
   case '2':setCameraView('overhead');break;
   case '3':setCameraView('detail');break;
   case 'r':resetCamera();break;
   case 'f':if(canFullscreen)toggleFullscreen();break;
   case 'n':void playback.next();break;
   case 'p':void playback.previous();break;
   case 'm':s.toggleMute();break;
  }
 };window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[focusSearch]);
 const openAdd=(tab:AddTab='youtube')=>{setAddTab(tab);setAddOpen(true);};
 const onMenu=(action:MenuAction)=>{if(action==='about'){setAboutOpen(true);return;}setSettingsTab(action==='sound'?'sound':'turntable');setSettingsOpen(true);};
 const drawer=libraryOpen||queueOpen;
 return <TooltipProvider delayDuration={400}><div className={`app-shell ${fullscreen?'focus-room':''} ${queueOpen?'queue-open':''}`} data-source={mode}>
  <header className="app-header">
   <IconButton label="Open collection" className="mobile-only" onClick={()=>setLibraryOpen(true)}><MenuIcon size={20}/></IconButton>
   <a className="brand" href="#" onClick={e=>e.preventDefault()} aria-label="VINYL"><span className="brand-disc" aria-hidden="true"><i/></span>VINYL</a>
   <nav className="header-tabs" aria-label="Main">
    <button type="button" aria-current={!libraryOpen||undefined} onClick={()=>setLibraryOpen(false)}>Listening room</button>
    <button type="button" aria-current={libraryOpen||undefined} onClick={focusSearch}>My collection <span className="count">{collectionCount}</span></button>
   </nav>
   <div className="header-actions">
    <Button className="add-music" aria-label="Add music" onClick={()=>openAdd()}><Plus size={16}/><span className="label">Add music</span></Button>
    <HeaderMenu onSelect={onMenu}/>
   </div>
  </header>
  <main className="listening-room">
   <PlaylistSidebar onAdd={()=>openAdd()} mobileOpen={libraryOpen} onClose={()=>setLibraryOpen(false)} searchRef={searchRef}/>
   <section className="stage" aria-label="Turntable">
    <div className="stage-canvas">
     <Suspense fallback={<div className="scene-loading"><Disc3 className="spinning" size={28}/>Setting up the turntable…</div>}><TurntableScene/></Suspense>
     <StageToolbar fullscreen={fullscreen} onFullscreen={toggleFullscreen} canFullscreen={canFullscreen}/>
     <FirstRunHint/>
     {(state==='loading'||state==='buffering')&&<div className="stage-status" role="status"><LoaderCircle className="spinning" size={14}/>{state==='buffering'?'Buffering…':'Setting the needle…'}</div>}
    </div>
    <div className="transport-dock"><TransportRow/></div>
    {/* Reserved lane: toasts and gesture feedback live here so they never cover controls. */}
    <div className="status-lane"><Toast/></div>
   </section>
   <MediaDock/>
   <QueuePanel onAdd={()=>openAdd()} onClose={()=>setQueueOpen(false)}/>
   {drawer&&<button type="button" className="drawer-backdrop" aria-label="Close panel" tabIndex={-1} onClick={()=>{setLibraryOpen(false);setQueueOpen(false);}}/>}
  </main>
  <PlaybackControls onQueue={()=>setQueueOpen(x=>!x)} queueOpen={queueOpen}/>
  <AddMusicDialog open={addOpen} onOpenChange={setAddOpen} tab={addTab} onTabChange={setAddTab}/>
  <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} tab={settingsTab} onTabChange={setSettingsTab}/>
  <Dialog open={aboutOpen} onOpenChange={setAboutOpen} title="About VINYL" description="A listening room for your own files and YouTube.">
   <div className="stack">
    <p className="hint">Local files stay in this browser. YouTube plays in its official player; videos whose owners disable embedding are skipped, or marked if you picked them yourself.</p>
    <dl className="shortcuts">{SHORTCUTS.map(([k,v])=><div key={k}><dt><kbd>{k}</kbd></dt><dd>{v}</dd></div>)}</dl>
   </div>
  </Dialog>
  {!hydrated&&<div className="hydration-indicator" role="status"><LoaderCircle className="spinning" size={14}/>Opening your shelf…</div>}
 </div></TooltipProvider>;
}
