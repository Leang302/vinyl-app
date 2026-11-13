export interface YouTubeSource { videoId?: string; playlistId?: string; index: number; startSeconds: number }
export function parseYouTubeUrl(input: string): YouTubeSource {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error('Paste a complete YouTube video or playlist URL.'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Use an http or https YouTube link.');
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host)) throw new Error('This link is not from YouTube. Try a youtube.com or youtu.be link.');
  let videoId: string | undefined;
  const parts = url.pathname.split('/').filter(Boolean);
  if (host === 'youtu.be') videoId = parts[0];
  else if (['shorts', 'embed', 'live'].includes(parts[0])) videoId = parts[1];
  else videoId = url.searchParams.get('v') || undefined;
  const playlistId = url.searchParams.get('list') || undefined;
  if (videoId && !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) throw new Error('That video identifier is incomplete. Copy the full YouTube link.');
  if (playlistId && !/^[a-zA-Z0-9_-]{10,150}$/.test(playlistId)) throw new Error('That playlist identifier is invalid.');
  if (!videoId && !playlistId) throw new Error('No video or playlist was found in this link.');
  const rawTime = url.searchParams.get('t') || url.searchParams.get('start') || '0';
  const match = rawTime.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  const startSeconds = /^\d+$/.test(rawTime) ? Number(rawTime) : match ? Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0) : 0;
  const index = Math.max(0, (Number(url.searchParams.get('index')) || 1) - 1);
  return { videoId, playlistId, index, startSeconds };
}
