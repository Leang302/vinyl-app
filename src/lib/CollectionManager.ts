import { usePlayer } from '../state/store';
import { deleteFile, writePreference } from './persistence';
/** Remove unreferenced files as well as shelf metadata, preserving shared tracks. */
export async function removeCollection(id:string){
 const state=usePlayer.getState();const removed=state.collections.find(c=>c.id===id);if(!removed)return;
 const remaining=state.collections.filter(c=>c.id!==id);const retainedIds=new Set(remaining.flatMap(c=>c.tracks.map(t=>t.id)));
 const removedIds=new Set(removed.tracks.filter(t=>!retainedIds.has(t.id)).map(t=>t.id));
 const favorites=state.favorites.filter(id=>!removedIds.has(id));const recent=state.recent.filter(id=>!removedIds.has(id));
 state.setCollections(remaining);state.patch({favorites,recent});
 try{await Promise.all([writePreference('favorites',favorites),writePreference('recent',recent),...removed.tracks.filter(t=>t.source==='local'&&!t.url&&!retainedIds.has(t.id)).map(t=>deleteFile(t.id))]);}
 catch{state.notify('The collection was removed, but some browser storage could not be cleaned up.');}
}
