'use client';

type Platform = 'youtube' | 'niconico' | string;

interface UniversalPlayerProps {
  platform: Platform;
  videoId: string;
  title: string;
}

export function UniversalPlayer({ platform, videoId, title }: UniversalPlayerProps) {
  if (!videoId) {
    return (
      <div className="w-full aspect-video bg-neutral-900 flex items-center justify-center text-neutral-500 rounded-xl">
        動画情報が見つかりません
      </div>
    );
  }

  return (
    <div className="w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border border-neutral-800">
      {platform === 'niconico' ? (
        <iframe
          src={`https://embed.nicovideo.jp/watch/${videoId}?site=nicovideo`}
          title={title}
          className="w-full h-full border-0"
          allow="autoplay"
          allowFullScreen
        />
      ) : (
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=0`}
          title={title}
          className="w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      )}
    </div>
  );
}
