import type { Track } from '../audio/types';
import { parseYouTubeUrl } from './youtube';

/**
 * YouTube Data API v3 resolver. Turns a pasted link or search phrase into a
 * list of tracks that can actually play in an embedded player.
 * The key is read from VITE_YOUTUBE_API_KEY (see .env.example).
 */
const API = 'https://www.googleapis.com/youtube/v3';
const MAX_PLAYLIST = 200;
const RADIO_SIZE = 20;

export function youtubeApiKey(): string {
  return (import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined)?.trim() || '';
}

export class YouTubeApiError extends Error {
  constructor(message: string, readonly reason?: string) { super(message); }
}

export interface Resolved { tracks: Track[]; startIndex: number; startSeconds: number; title: string; kind: 'playlist' | 'radio' | 'search' | 'video'; skipped: number }

const reasons: Record<string, string> = {
  quotaExceeded: 'The YouTube API quota for today is used up. Try again tomorrow.',
  dailyLimitExceeded: 'The YouTube API quota for today is used up. Try again tomorrow.',
  keyInvalid: 'The YouTube API key is invalid. Check VITE_YOUTUBE_API_KEY.',
  badRequest: 'The YouTube API key is invalid. Check VITE_YOUTUBE_API_KEY.',
  ipRefererBlocked: 'This site is not allowed to use the YouTube API key. Check its HTTP referrer restrictions.',
  forbidden: 'YouTube would not share this playlist. It may be private.',
  playlistNotFound: 'This playlist is private or no longer exists.',
  accessNotConfigured: 'YouTube Data API v3 is not enabled for this API key.',
};

async function get<T>(path: string, params: Record<string, string>, key: string, signal?: AbortSignal): Promise<T> {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries({ ...params, key })) url.searchParams.set(k, v);
  let response: Response;
  try { response = await fetch(url, { signal }); }
  catch (error) { if ((error as Error).name === 'AbortError') throw error; throw new YouTubeApiError('Could not reach YouTube. Check your connection.'); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason: string | undefined = body?.error?.errors?.[0]?.reason;
    throw new YouTubeApiError(reasons[reason || ''] || `YouTube returned an error (${response.status}).`, reason);
  }
  return body as T;
}

interface VideoResource {
  id: string;
  snippet?: { title?: string; channelTitle?: string; liveBroadcastContent?: string };
  contentDetails?: { duration?: string };
  status?: { embeddable?: boolean; privacyStatus?: string; uploadStatus?: string };
}

/** ISO-8601 duration (PT1H2M3S) to seconds. */
export function parseDuration(value?: string): number | undefined {
  const m = value && /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value);
  if (!m) return undefined;
  const seconds = Number(m[1] || 0) * 86400 + Number(m[2] || 0) * 3600 + Number(m[3] || 0) * 60 + Number(m[4] || 0);
  return seconds || undefined;
}

/** "Artist - Topic" / "ArtistVEVO" → "Artist". */
export function cleanArtist(channel = ''): string {
  return channel.replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim();
}

export function isPlayable(video: VideoResource): boolean {
  const s = video.status;
  return !!s && s.embeddable === true && s.privacyStatus !== 'private' && (s.uploadStatus === undefined || s.uploadStatus === 'processed');
}

export function videoTrack(video: VideoResource, collectionId?: string): Track {
  return {
    id: video.id, videoId: video.id, source: 'youtube',
    title: video.snippet?.title || 'Untitled video',
    artist: cleanArtist(video.snippet?.channelTitle) || 'YouTube',
    artwork: `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`,
    duration: parseDuration(video.contentDetails?.duration),
    collectionId,
  };
}

/** videos.list in batches of 50; returns resources in the requested order (missing ids dropped). */
export async function fetchVideos(ids: string[], key: string, signal?: AbortSignal): Promise<VideoResource[]> {
  const found = new Map<string, VideoResource>();
  for (let i = 0; i < ids.length; i += 50) {
    const body = await get<{ items?: VideoResource[] }>('videos', { part: 'snippet,contentDetails,status', id: ids.slice(i, i + 50).join(','), maxResults: '50' }, key, signal);
    for (const item of body.items || []) found.set(item.id, item);
  }
  return ids.map(id => found.get(id)).filter((v): v is VideoResource => !!v);
}

export async function fetchPlaylist(playlistId: string, key: string, signal?: AbortSignal): Promise<{ title: string; ids: string[] }> {
  const ids: string[] = [];
  let pageToken = '';
  const titleRequest = get<{ items?: { snippet?: { title?: string } }[] }>('playlists', { part: 'snippet', id: playlistId }, key, signal).catch(() => ({ items: [] }));
  do {
    const body = await get<{ items?: { contentDetails?: { videoId?: string } }[]; nextPageToken?: string }>('playlistItems', { part: 'contentDetails', playlistId, maxResults: '50', ...(pageToken ? { pageToken } : {}) }, key, signal);
    for (const item of body.items || []) if (item.contentDetails?.videoId) ids.push(item.contentDetails.videoId);
    pageToken = body.nextPageToken || '';
  } while (pageToken && ids.length < MAX_PLAYLIST);
  const title = (await titleRequest).items?.[0]?.snippet?.title || 'YouTube playlist';
  return { title, ids: ids.slice(0, MAX_PLAYLIST) };
}

/** search.list restricted to videos that can be embedded and played off youtube.com. */
export async function searchVideoIds(q: string, key: string, max = 25, signal?: AbortSignal): Promise<string[]> {
  const body = await get<{ items?: { id?: { videoId?: string } }[] }>('search', {
    part: 'snippet', q, type: 'video', videoEmbeddable: 'true', videoSyndicated: 'true', maxResults: String(Math.min(50, max)),
  }, key, signal);
  return (body.items || []).map(i => i.id?.videoId).filter((id): id is string => !!id);
}

/** A link (with or without scheme) rather than a search phrase. */
export function looksLikeYouTubeUrl(input: string): boolean {
  return /^(https?:\/\/|www\.|youtu\.be\/|(m\.|music\.)?youtube(-nocookie)?\.com\/)/i.test(input.trim());
}

const normalize = (title: string) => title.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Resolve user input into playable tracks.
 * - PL… playlist → playlistItems.list, then videos.list to drop unembeddable/private items
 * - single video or RD radio link → seed + search.list for more by the same artist
 * - anything else → search.list
 */
export async function resolveYouTube(input: string, key: string, collectionId?: string, signal?: AbortSignal): Promise<Resolved> {
  const text = input.trim();
  if (looksLikeYouTubeUrl(text)) {
    const source = parseYouTubeUrl(/^https?:/i.test(text) ? text : `https://${text}`);
    if (source.playlistId) {
      const { title, ids } = await fetchPlaylist(source.playlistId, key, signal);
      const videos = await fetchVideos(ids, key, signal);
      const playable = videos.filter(isPlayable);
      if (!playable.length) throw new YouTubeApiError('None of the videos in this playlist can be played outside YouTube.');
      const tracks = playable.map(v => videoTrack(v, collectionId));
      const fromVideo = source.videoId ? tracks.findIndex(t => t.id === source.videoId) : -1;
      const fromIndex = source.index ? tracks.findIndex(t => t.id === ids[source.index]) : -1;
      return { tracks, startIndex: Math.max(0, fromVideo >= 0 ? fromVideo : fromIndex), startSeconds: fromVideo >= 0 ? source.startSeconds : 0, title, kind: 'playlist', skipped: ids.length - playable.length };
    }
    const [seed] = await fetchVideos([source.videoId!], key, signal);
    if (!seed) throw new YouTubeApiError('This video is private, removed, or unavailable.');
    const query = cleanArtist(seed.snippet?.channelTitle) || seed.snippet?.title || '';
    const relatedIds = (await searchVideoIds(query, key, RADIO_SIZE + 10, signal)).filter(id => id !== seed.id);
    const related = (await fetchVideos(relatedIds, key, signal)).filter(isPlayable);
    const seen = new Set<string>([normalize(seed.snippet?.title || '')]);
    const extras = related.filter(v => { const n = normalize(v.snippet?.title || ''); if (seen.has(n)) return false; seen.add(n); return true; }).slice(0, RADIO_SIZE);
    const seedPlayable = isPlayable(seed);
    if (!seedPlayable && !extras.length) throw new YouTubeApiError('The owner does not allow this video to be embedded, and no similar videos were found.');
    const tracks = [...(seedPlayable ? [seed] : []), ...extras].map(v => videoTrack(v, collectionId));
    return { tracks, startIndex: 0, startSeconds: seedPlayable ? source.startSeconds : 0, title: `${seed.snippet?.title || 'YouTube'} radio`, kind: source.radioMix ? 'radio' : 'video', skipped: seedPlayable ? 0 : 1 };
  }
  if (text.length < 2) throw new YouTubeApiError('Paste a YouTube link or type something to search for.');
  const ids = await searchVideoIds(text, key, 25, signal);
  const tracks = (await fetchVideos(ids, key, signal)).filter(isPlayable).map(v => videoTrack(v, collectionId));
  if (!tracks.length) throw new YouTubeApiError(`No playable videos found for “${text}”.`);
  return { tracks, startIndex: 0, startSeconds: 0, title: text, kind: 'search', skipped: 0 };
}
