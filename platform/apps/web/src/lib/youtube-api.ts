/**
 * Loads YouTube's IFrame Player API once per page. The plain embed can play a video but
 * cannot say when it ended or how far someone watched; the API can.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type YTPlayer = {
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
};

export type YTNamespace = {
  Player: new (el: HTMLElement, options: Record<string, unknown>) => YTPlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number };
};

let loading: Promise<YTNamespace> | null = null;

export function loadYouTubeApi(timeoutMs = 10_000): Promise<YTNamespace> {
  const w = window as any;
  if (w.YT?.Player) return Promise.resolve(w.YT as YTNamespace);
  if (loading) return loading;

  loading = new Promise<YTNamespace>((resolve, reject) => {
    const timer = setTimeout(() => {
      loading = null;
      reject(new Error('YouTube player API did not load'));
    }, timeoutMs);

    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer);
      if (typeof previous === 'function') previous();
      resolve(w.YT as YTNamespace);
    };

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      clearTimeout(timer);
      loading = null;
      reject(new Error('YouTube player API failed to load'));
    };
    document.head.appendChild(script);
  });
  return loading;
}
