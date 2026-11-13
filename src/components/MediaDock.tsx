import { ArrowUpRight, CircleSlash } from 'lucide-react';
import { usePlayer } from '../state/store';
import { watchUrl } from '../audio/PlaybackController';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * 16:9 mini-player for the official YouTube embed. It lives outside the queue
 * drawer so it stays on screen while YouTube plays (YouTube requires a visible
 * player of at least 200×200). Hidden entirely for local audio.
 */
export function MediaDock() {
  const mode = usePlayer(s => s.mode);
  const track = usePlayer(s => s.track);
  const failed = usePlayer(s => s.state === 'error' || (s.state !== 'playing' && !!s.track?.blocked));
  const showFailure = mode === 'youtube' && !!track && failed;
  return <section className="media-dock" data-mode={mode} aria-label="YouTube player">
    <div className="media-card">
      <div id="youtube-host" className="youtube-host" />
      {/* Cover YouTube's black "video unavailable" screen with something calmer. */}
      {showFailure && <div className="media-failed">
        <img src={track.artwork} alt="" aria-hidden="true" />
        <div className="media-failed-body">
          <Badge variant="warning"><CircleSlash size={12} />Can't embed</Badge>
          <p>The owner only allows this video on YouTube.</p>
          <Button asChild variant="outline" size="sm"><a href={watchUrl(track)} target="_blank" rel="noreferrer">Open on YouTube<ArrowUpRight size={14} /></a></Button>
        </div>
      </div>}
    </div>
  </section>;
}
