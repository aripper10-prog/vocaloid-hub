'use client';

import Link from 'next/link';
import { VocaDBSong as Song } from '../lib/vocadb';

const ROLE_LABELS: Record<string, string> = {
  music: '作',
  lyrics: '詞',
  tuning: '調',
  singer: 'Vo',
  mix: 'MIX',
  illust: '絵',
  movie: '動',
};

export function SongCard({ song }: { song: Song }) {
  return (
    <Link
      href={`/songs/${song.id}`}
      onClick={() => {
        try {
          sessionStorage.setItem(`song_${song.id}`, JSON.stringify(song));
        } catch (e) {
          console.error(e);
        }
      }}
      className="group bg-slate-800/50 border border-slate-700/70 hover:border-cyan-500/60 rounded-xl overflow-hidden shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-cyan-500/10 flex flex-col cursor-pointer"
    >
      <div className="relative aspect-video bg-slate-950 overflow-hidden">
        {song.thumbUrl ? (
          <img
            src={song.thumbUrl}
            alt={song.title}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : null}

        <div className="absolute inset-0 -z-10 flex items-center justify-center text-slate-600 text-xs bg-slate-950">
          No Image
        </div>

        <div className="absolute top-2 left-2 flex gap-1">
          {song.youtubeId && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded shadow bg-red-600 text-white">
              YouTube
            </span>
          )}
          {song.niconicoId && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded shadow bg-slate-900 text-cyan-400 border border-cyan-500/30">
              NicoNico
            </span>
          )}
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <h3 className="text-sm md:text-base font-bold text-white group-hover:text-cyan-400 line-clamp-2 transition-colors">
            {song.title}
          </h3>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {song.credits?.slice(0, 4).map((c, i) => (
              <span
                key={i}
                className="text-[11px] bg-slate-900/80 border border-slate-700/80 text-slate-300 px-2 py-0.5 rounded flex items-center gap-1"
              >
                <span className="text-cyan-400 font-bold">{ROLE_LABELS[c.role] || c.role}</span>
                <span className="truncate max-w-[90px]">{c.creatorName}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-700/50 flex items-center justify-between text-[11px] text-slate-400">
          <span>{song.publishDate ? new Date(song.publishDate).toLocaleDateString('ja-JP') : ''}</span>
          <span className="text-cyan-400 group-hover:underline">詳細・派生ツリー →</span>
        </div>
      </div>
    </Link>
  );
}
