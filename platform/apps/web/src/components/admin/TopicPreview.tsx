'use client';

import { Clock, Pencil, VideoOff } from 'lucide-react';
import { TrackDto } from '@dojo-hub/shared';
import { formatDuration, youTubeEmbedUrl, youTubeId } from '@/lib/video';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { LessonResources } from '../student/LessonResources';

type Topic = TrackDto['modules'][number]['topics'][number];

/**
 * Read-only rendering of a saved topic, so an author can confirm what students will
 * actually get — the video, extra videos and links, and reference documents, rendered by
 * the same component the course player uses.
 */
export function TopicPreview({ topic, onEdit }: { topic: Topic; onEdit?: () => void }) {
  const ytId = youTubeId(topic.videoUrl);

  return (
    <div className="border-t border-navy-100 bg-white px-3 py-3 space-y-3">
      <p className="text-[12px] font-mono uppercase text-navy-400 font-bold">Preview — what students see</p>

      {topic.videoUrl ? (
        <div className="bg-black rounded-lg overflow-hidden aspect-video max-w-md">
          {ytId ? (
            <iframe
              src={youTubeEmbedUrl(ytId)}
              title={topic.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full border-0"
            />
          ) : (
            <video src={topic.videoUrl} controls preload="metadata" className="w-full h-full" />
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 max-w-md rounded-lg border border-dashed border-navy-200 bg-navy-50/60 px-3 py-4 text-navy-400">
          <VideoOff className="w-4 h-4 shrink-0" />
          <span className="text-xs">No video on this lesson — reading or exercise only.</span>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-sm font-bold text-navy-950">{topic.title}</h4>
          <span className="flex items-center gap-1 text-[12px] font-mono text-navy-400">
            <Clock className="w-3 h-3" />
            {formatDuration(topic.durationSeconds)}
          </span>
        </div>
        {topic.description && <p className="text-xs text-navy-600 mt-1 whitespace-pre-wrap">{topic.description}</p>}
      </div>

      {topic.tools.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {topic.tools.map((tool) => (
            <Badge key={tool} tone="indigo">
              {tool}
            </Badge>
          ))}
        </div>
      )}

      {topic.videoUrl && <p className="text-[12px] font-mono text-navy-300 break-all">{topic.videoUrl}</p>}
      <div className="max-w-2xl">
        <LessonResources resources={topic.resources} documents={topic.documents} />
      </div>

      {onEdit && (
        <div className="pt-1">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="w-3.5 h-3.5" /> Edit this topic
          </Button>
        </div>
      )}
    </div>
  );
}
