'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, VideoOff } from 'lucide-react';
import { TopicDto } from '@dojo-hub/shared';
import { youTubeEmbedUrl, youTubeId } from '@/lib/video';
import { loadYouTubeApi, YTPlayer } from '@/lib/youtube-api';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

/**
 * Plays a lesson and completes it the way LinkedIn Learning does: by watching it, not by
 * pressing a button. When the video ends, the lesson is ticked and whatever follows —
 * the next lesson, or the chapter quiz — starts after a short countdown.
 *
 * Reaching the end is not enough on its own. The player counts the seconds of the video
 * actually played, so dragging the progress bar to the end does not complete a lesson;
 * most of it has to have been watched. Those seconds are kept in the browser, so a
 * reload or a break part-way through does not lose them.
 *
 * Lessons without a video have nothing to watch, so they keep a "Mark as complete"
 * button. So does a YouTube lesson if YouTube's player cannot be loaded, rather than
 * leaving the student unable to finish it.
 *
 * Keyed by topic.id from the parent (see CoursePlayer), so each lesson mounts fresh.
 */

/** Share of the video that must have been played for it to count as watched. */
const COMPLETE_AT = 0.9;
/** Seconds the "Up next" card waits before moving on by itself. */
const UP_NEXT_SECONDS = 5;
/** Gap between two samples above which playback is treated as a skip, not viewing. */
const MAX_PLAYED_GAP = 2.5;

export type UpNext = { title: string; kind: 'lesson' | 'quiz' };

const storageKey = (topicId: string) => `dojo:watched-seconds:${topicId}`;

function loadSeconds(topicId: string): Set<number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(topicId)) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((n) => Number.isInteger(n)) : []);
  } catch {
    return new Set();
  }
}

function coverageFor(seconds: Set<number>, durationSeconds: number) {
  const total = Math.floor(durationSeconds);
  return total > 0 ? Math.min(1, seconds.size / total) : 0;
}

function saveSeconds(topicId: string, seconds: Set<number>) {
  try {
    localStorage.setItem(storageKey(topicId), JSON.stringify([...seconds]));
  } catch {
    // Storage can be unavailable (private windows); progress then lasts for this visit.
  }
}

export function VideoPlayer({
  topic,
  onCompleted,
  watched = false,
  upNext = null,
  onAdvance,
  autoPlay = false,
}: {
  topic: TopicDto;
  /** Enrolled students only. Omitted for the free preview, where progress means nothing. */
  onCompleted?: () => void;
  watched?: boolean;
  /** What follows this lesson, offered with a countdown when the video ends. */
  upNext?: UpNext | null;
  onAdvance?: () => void;
  /** Start playing straight away — used when arriving here from the previous lesson. */
  autoPlay?: boolean;
}) {
  const ytId = youTubeId(topic.videoUrl);
  const hasVideo = !!topic.videoUrl;

  const [currentTime, setCurrentTime] = useState(0);
  // The player only ever renders in the browser (the course loads after sign-in), so the
  // seconds already watched can be read straight from storage when it mounts.
  const [initialSeen] = useState(() =>
    typeof window === 'undefined' ? new Set<number>() : loadSeconds(topic.id),
  );
  const seen = useRef(initialSeen);
  const lastSample = useRef<number | null>(null);
  const unsaved = useRef(0);
  const duration = useRef(topic.durationSeconds > 0 ? topic.durationSeconds : 0);
  const completed = useRef(watched);
  const [coverage, setCoverage] = useState(() => coverageFor(initialSeen, topic.durationSeconds));
  const [notice, setNotice] = useState<string | null>(null);
  const [upNextOpen, setUpNextOpen] = useState(false);
  const [countdown, setCountdown] = useState(UP_NEXT_SECONDS);
  const [trackingUnavailable, setTrackingUnavailable] = useState(false);

  // Latest callbacks, read from inside player events that outlive a render.
  const latest = useRef({ onCompleted, onAdvance, upNext });
  useEffect(() => {
    latest.current = { onCompleted, onAdvance, upNext };
  });
  useEffect(() => {
    if (watched) completed.current = true;
  }, [watched]);

  const coverageOf = useCallback(() => coverageFor(seen.current, duration.current), []);

  const sample = useCallback(
    (time: number, videoDuration?: number) => {
      if (videoDuration && Number.isFinite(videoDuration) && videoDuration > 0) duration.current = videoDuration;
      const prev = lastSample.current;
      lastSample.current = time;
      // The first reading, a rewind, or a jump forward: nothing was watched in between.
      if (prev === null || time < prev || time - prev > MAX_PLAYED_GAP) return;

      const before = seen.current.size;
      for (let s = Math.floor(prev); s <= Math.floor(time); s++) seen.current.add(s);
      unsaved.current += seen.current.size - before;
      if (unsaved.current >= 5) {
        saveSeconds(topic.id, seen.current);
        unsaved.current = 0;
      }
      setCoverage(coverageOf());
    },
    [topic.id, coverageOf],
  );

  const openUpNext = useCallback(() => {
    if (!latest.current.upNext || !latest.current.onAdvance) return;
    setCountdown(UP_NEXT_SECONDS);
    setUpNextOpen(true);
  }, []);

  const handleEnded = useCallback(() => {
    lastSample.current = null;
    saveSeconds(topic.id, seen.current);
    const { onCompleted: complete } = latest.current;

    if (!complete || completed.current) {
      openUpNext();
      return;
    }
    const share = coverageOf();
    if (share >= COMPLETE_AT) {
      completed.current = true;
      setNotice(null);
      complete();
      openUpNext();
    } else {
      setNotice(
        `You've watched about ${Math.round(share * 100)}% of this video. Watch the parts you skipped to complete this lesson.`,
      );
    }
  }, [topic.id, coverageOf, openUpNext]);

  // The "Up next" countdown: moves on by itself unless cancelled.
  useEffect(() => {
    if (!upNextOpen) return;
    const id = setTimeout(() => {
      if (countdown <= 1) {
        setUpNextOpen(false);
        latest.current.onAdvance?.();
      } else {
        setCountdown(countdown - 1);
      }
    }, 1000);
    return () => clearTimeout(id);
  }, [upNextOpen, countdown]);

  const activeSubtitle = [...topic.subtitles].reverse().find((s) => s.timeSeconds <= currentTime);
  const manualCompletion = !!onCompleted && (!hasVideo || trackingUnavailable);

  return (
    <div className="space-y-3">
      {!hasVideo ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-dashed border-navy-200 bg-navy-50 px-4 py-6 text-navy-500">
          <VideoOff className="w-5 h-5 shrink-0" />
          <span className="text-sm">This lesson has no video — work through the notes below.</span>
        </div>
      ) : (
        <div className="relative bg-black rounded-2xl overflow-hidden aspect-video">
          {ytId ? (
            <TrackedYouTube
              videoId={ytId}
              title={topic.title}
              autoPlay={autoPlay}
              onSample={sample}
              onEnded={handleEnded}
              onUnavailable={() => setTrackingUnavailable(true)}
            />
          ) : (
            <video
              src={topic.videoUrl}
              controls
              autoPlay={autoPlay}
              className="w-full h-full"
              onTimeUpdate={(e) => {
                setCurrentTime(e.currentTarget.currentTime);
                sample(e.currentTarget.currentTime, e.currentTarget.duration);
              }}
              onPause={(e) => sample(e.currentTarget.currentTime, e.currentTarget.duration)}
              onEnded={handleEnded}
            />
          )}

          {activeSubtitle && !ytId && !upNextOpen && (
            <div className="absolute bottom-14 left-0 right-0 flex justify-center px-4 pointer-events-none">
              <span className="bg-black/70 text-white text-xs px-3 py-1.5 rounded-lg max-w-lg text-center">{activeSubtitle.text}</span>
            </div>
          )}

          {upNextOpen && upNext && (
            <div
              role="dialog"
              aria-label="Up next"
              className="absolute inset-0 bg-navy-950/90 flex flex-col items-center justify-center text-center gap-3 p-6"
            >
              <p className="flex items-center gap-1.5 text-sm font-semibold text-green-300">
                <CheckCircle2 className="w-4 h-4" /> Lesson complete
              </p>
              <p className="text-xs font-mono uppercase tracking-wider text-navy-300">
                {upNext.kind === 'quiz' ? 'Chapter quiz' : 'Up next'} in {countdown}
              </p>
              <p className="text-lg font-bold text-white max-w-md">{upNext.title}</p>
              <div className="flex gap-2 pt-1">
                <Button
                  onClick={() => {
                    setUpNextOpen(false);
                    latest.current.onAdvance?.();
                  }}
                >
                  {upNext.kind === 'quiz' ? 'Start quiz' : 'Play now'}
                </Button>
                <Button variant="secondary" onClick={() => setUpNextOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-bold text-navy-950">{topic.title}</h3>
          {topic.description && <p className="text-xs text-navy-500 mt-1">{topic.description}</p>}
        </div>
        {onCompleted &&
          (watched ? (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700 shrink-0 whitespace-nowrap">
              <CheckCircle2 className="w-4 h-4" /> Completed
            </span>
          ) : manualCompletion ? (
            <Button size="sm" variant="outline" onClick={onCompleted} className="shrink-0 whitespace-nowrap">
              Mark as complete
            </Button>
          ) : (
            <div className="shrink-0 w-40 space-y-1" aria-label={`${Math.round(coverage * 100)}% of this video watched`}>
              <p className="text-[11px] text-navy-500 text-right">
                {Math.round(coverage * 100)}% watched
              </p>
              <div className="h-1.5 rounded-full bg-navy-100 overflow-hidden">
                <div className="h-full bg-green-600 transition-[width]" style={{ width: `${Math.round(coverage * 100)}%` }} />
              </div>
              <p className="text-[11px] text-navy-400 text-right">Completes when you finish the video</p>
            </div>
          ))}
      </div>

      {notice && !watched && (
        <p role="status" className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {notice}
        </p>
      )}

      {topic.tools.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {topic.tools.map((tool) => (
            <Badge key={tool} tone="indigo">
              {tool}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A YouTube video played through YouTube's player API, so the page can see how much was
 * played and when it ended. Falls back to the plain embed if the API cannot load.
 */
function TrackedYouTube({
  videoId,
  title,
  autoPlay,
  onSample,
  onEnded,
  onUnavailable,
}: {
  videoId: string;
  title: string;
  autoPlay: boolean;
  onSample: (time: number, duration: number) => void;
  onEnded: () => void;
  onUnavailable: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const callbacks = useRef({ onSample, onEnded, onUnavailable });
  useEffect(() => {
    callbacks.current = { onSample, onEnded, onUnavailable };
  });

  useEffect(() => {
    let cancelled = false;
    let player: YTPlayer | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    const stopPolling = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current) return;
        const mount = document.createElement('div');
        hostRef.current.appendChild(mount);
        player = new YT.Player(mount, {
          host: 'https://www.youtube-nocookie.com',
          videoId,
          width: '100%',
          height: '100%',
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1, autoplay: autoPlay ? 1 : 0 },
          events: {
            onStateChange: (event: { data: number }) => {
              const p = player;
              if (!p) return;
              stopPolling();
              if (event.data === YT.PlayerState.PLAYING) {
                poll = setInterval(() => callbacks.current.onSample(p.getCurrentTime(), p.getDuration()), 1000);
                return;
              }
              callbacks.current.onSample(p.getCurrentTime(), p.getDuration());
              if (event.data === YT.PlayerState.ENDED) callbacks.current.onEnded();
            },
          },
        });
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        callbacks.current.onUnavailable();
      });

    return () => {
      cancelled = true;
      stopPolling();
      try {
        player?.destroy();
      } catch {
        // The iframe may already be gone with the page.
      }
    };
  }, [videoId, autoPlay]);

  if (failed) {
    return (
      <iframe
        src={youTubeEmbedUrl(videoId)}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full h-full border-0"
      />
    );
  }
  return <div ref={hostRef} title={title} className="w-full h-full [&_iframe]:w-full [&_iframe]:h-full" />;
}
