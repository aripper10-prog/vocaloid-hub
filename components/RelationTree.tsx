'use client';

import Link from 'next/link';
import { VocaDBSong } from '../lib/vocadb';

interface RelationTreeProps {
  parentRelations?: VocaDBSong[];
  childRelations?: VocaDBSong[];
}

export function RelationTree({ parentRelations = [], childRelations = [] }: RelationTreeProps) {
  const hasParents = parentRelations.length > 0;
  const hasChildren = childRelations.length > 0;

  if (!hasParents && !hasChildren) {
    return null;
  }

  return (
    <div className="space-y-6 bg-neutral-900/60 p-5 sm:p-6 rounded-2xl border border-neutral-800 backdrop-blur-md">
      {/* 親作品 (原曲・本家) */}
      {hasParents && (
        <div>
          <h3 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <span>🎵</span> 原曲・本家動画
          </h3>
          <div className="space-y-2">
            {parentRelations.map((rel) => (
              <Link
                key={rel.id}
                href={`/songs/${rel.id}`}
                className="flex items-center justify-between p-3 rounded-xl bg-neutral-950 border border-neutral-800 hover:border-cyan-500/50 hover:bg-neutral-900 transition group"
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="text-[11px] font-medium bg-cyan-950 text-cyan-300 border border-cyan-800/80 px-2 py-0.5 rounded whitespace-nowrap">
                    原曲
                  </span>
                  <span className="text-xs sm:text-sm font-medium text-neutral-200 group-hover:text-cyan-400 transition truncate">
                    {rel.title || '本家楽曲'}
                  </span>
                </div>
                <span className="text-neutral-500 text-xs ml-2">→</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 子作品 (派生作品・二次創作) */}
      {hasChildren && (
        <div>
          <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <span>🌿</span> この曲から生まれた派生作品 ({childRelations.length}件)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {childRelations.map((rel) => (
              <Link
                key={rel.id}
                href={`/songs/${rel.id}`}
                className="flex items-center gap-2.5 p-2.5 rounded-xl bg-neutral-950 border border-neutral-800 hover:border-emerald-500/50 hover:bg-neutral-900 transition group"
              >
                <span className="text-[10px] font-medium bg-emerald-950 text-emerald-300 border border-emerald-800/80 px-1.5 py-0.5 rounded whitespace-nowrap">
                  {rel.songType || '派生'}
                </span>
                <span className="text-xs text-neutral-300 group-hover:text-emerald-300 transition truncate">
                  {rel.title || '派生楽曲'}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}