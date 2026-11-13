import type { Collection, Track } from '../audio/types';
const track = (id: string, title: string, collectionId: string, artwork: string): Track => ({id, title, artist: 'VINYL Sessions', source: 'local', url: `/audio/${id}.wav`, artwork, collectionId});
export const initialCollections: Collection[] = [
  {id:'slow-mornings', title:'Slow mornings', subtitle:'A softer start to your day', artwork:'/artwork/morning.svg', color:'#b6c9a5', tracks:[track('first-light','First light','slow-mornings','/artwork/morning.svg'),track('open-window','An open window','slow-mornings','/artwork/morning.svg')]},
  {id:'after-hours',title:'After hours',subtitle:'When the city settles down',artwork:'/artwork/night.svg',color:'#be8c70',tracks:[track('last-train','The last train home','after-hours','/artwork/night.svg'),track('blue-hour','Blue hour','after-hours','/artwork/night.svg')]},
  {id:'still-here',title:'Still, here.',subtitle:'Space to get lost in',artwork:'/artwork/still.svg',color:'#9faab9',tracks:[track('quiet-tide','A quiet tide','still-here','/artwork/still.svg'),track('somewhere','Somewhere, slowly','still-here','/artwork/still.svg')]},
];
