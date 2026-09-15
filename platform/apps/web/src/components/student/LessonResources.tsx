'use client';

import { useState } from 'react';
import { ChevronDown, Download, ExternalLink, FileText, Link2, PlayCircle } from 'lucide-react';
import { StoredFileDto, TopicResourceDto } from '@dojo-hub/shared';
import { youTubeEmbedUrl, youTubeId } from '@/lib/video';

/**
 * A lesson's extra videos, reference links and downloadable documents, shown beneath its
 * main video. Renders nothing when the lesson has none, so existing lessons look unchanged.
 */

const DIRECT_VIDEO = /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function fileLabel(name: string): string {
  const ext = name.includes('.') ? name.split('.').pop()!.toUpperCase() : '';
  return ext.length <= 5 ? ext : 'FILE';
}

/** A video that can play on the page does; anything else opens where it lives. */
function VideoResource({ resource }: { resource: TopicResourceDto }) {
  const [open, setOpen] = useState(false);
  const ytId = youTubeId(resource.url);
  const playable = !!ytId || DIRECT_VIDEO.test(resource.url);

  if (!playable) return <LinkResource resource={resource} />;

  return (
    <li className="rounded-xl border border-navy-100 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-crimson-500/60"
      >
        <PlayCircle className="w-4 h-4 text-crimson-600 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-navy-950 truncate">{resource.title}</span>
          <span className="block text-[11px] text-navy-400 truncate">{hostOf(resource.url)}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-navy-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="aspect-video bg-black">
          {ytId ? (
            <iframe
              src={youTubeEmbedUrl(ytId)}
              title={resource.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full border-0"
            />
          ) : (
            <video src={resource.url} controls className="w-full h-full" />
          )}
        </div>
      )}
    </li>
  );
}

function LinkResource({ resource }: { resource: TopicResourceDto }) {
  const Icon = resource.kind === 'VIDEO' ? PlayCircle : Link2;
  return (
    <li>
      <a
        href={resource.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 rounded-xl border border-navy-100 bg-white px-3.5 py-2.5 hover:border-crimson-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-500/60"
      >
        <Icon className="w-4 h-4 text-crimson-600 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-navy-950 truncate">{resource.title}</span>
          <span className="block text-[11px] text-navy-400 truncate">{hostOf(resource.url)}</span>
        </span>
        <ExternalLink className="w-3.5 h-3.5 text-navy-400 shrink-0" />
      </a>
    </li>
  );
}

export function LessonResources({
  resources = [],
  documents = [],
}: {
  resources?: TopicResourceDto[];
  documents?: StoredFileDto[];
}) {
  if (resources.length === 0 && documents.length === 0) return null;

  return (
    <div className="space-y-4">
      {resources.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-[12px] font-mono uppercase tracking-wider font-bold text-navy-500">
            More videos &amp; links
          </h4>
          <ul className="space-y-1.5">
            {resources.map((r, i) =>
              r.kind === 'VIDEO' ? <VideoResource key={i} resource={r} /> : <LinkResource key={i} resource={r} />,
            )}
          </ul>
        </section>
      )}

      {documents.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-[12px] font-mono uppercase tracking-wider font-bold text-navy-500">
            Reference materials
          </h4>
          <ul className="space-y-1.5">
            {documents.map((d) => (
              <li key={d.id}>
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={d.originalName}
                  className="flex items-center gap-3 rounded-xl border border-navy-100 bg-white px-3.5 py-2.5 hover:border-crimson-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-500/60"
                >
                  <FileText className="w-4 h-4 text-navy-500 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-navy-950 truncate">{d.originalName}</span>
                    <span className="block text-[11px] text-navy-400">
                      {fileLabel(d.originalName)} · {formatBytes(d.sizeBytes)}
                    </span>
                  </span>
                  <Download className="w-3.5 h-3.5 text-navy-400 shrink-0" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
