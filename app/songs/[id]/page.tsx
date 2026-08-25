'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from '../../context/ThemeContext';
import { getVocaDBSongDetail, VocaDBSong } from '../../../lib/vocadb';

const ROLE_CONFIG: Record<
  string,
  { label: string; icon: string; darkBadge: string; lightBadge: string }
> = {
  music: {
    label: '作曲 / 編曲',
    icon: '🎵',
    darkBadge: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
    lightBadge: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  },
  lyrics: {
    label: '作詞',
    icon: '✍️',
    darkBadge: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
    lightBadge: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  tuning: {
    label: '調声',
    icon: '🎛️',
    darkBadge: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    lightBadge: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  singer: {
    label: 'ボーカル',
    icon: '🎙️',
    darkBadge: 'bg-pink-500/10 text-pink-300 border-pink-500/30',
    lightBadge: 'bg-pink-50 text-pink-700 border-pink-200',
  },
  mix: {
    label: 'MIX / Mastering',
    icon: '🎧',
    darkBadge: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
    lightBadge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  illust: {
    label: 'イラスト',
    icon: '🎨',
    darkBadge: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
    lightBadge: 'bg-orange-50 text-orange-700 border-orange-200',
  },
  movie: {
    label: '動画・映像',
    icon: '🎬',
    darkBadge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    lightBadge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  dance: {
    label: '振付・ダンス',
    icon: '💃',
    darkBadge: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
    lightBadge: 'bg-rose-50 text-rose-700 border-rose-200',
  },
};

const SONG_TYPE_MAP: Record<string, { label: string; color: string }> = {
  Original: { label: '🎵 ボカロ原曲', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
  Cover: { label: '🎙️ カバー / 歌ってみた', color: 'bg-pink-500/10 text-pink-400 border-pink-500/30' },
  Remix: { label: '🎛️ Remix / アレンジ', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  Other: { label: '✨ 提供曲 / コラボ', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  MusicPV: { label: '🎬 公式PV', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  LiveWeb: { label: '🌐 リアルタイムWeb解析', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
};

export default function SongDetailPage() {
  const router = useRouter();
  const params = useParams();
  const songId = params?.id as string;
  const { theme, toggleTheme } = useTheme();

  const [detail, setDetail] = useState<{
    song: VocaDBSong;
    derivedSongs: VocaDBSong[];
    originalSong: VocaDBSong | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!songId) return;

    async function loadData() {
      setLoading(true);

      let cachedSong: VocaDBSong | null = null;
      try {
        const raw = sessionStorage.getItem(`song_${songId}`);
        if (raw) {
          cachedSong = JSON.parse(raw);
        }
      } catch (e) {
        console.error('SessionStorage read error:', e);
      }

      try {
        const data = await getVocaDBSongDetail(songId);

        if (data && data.song) {
          // 安全ガードを徹底
          if (
            cachedSong &&
            cachedSong.credits &&
            (cachedSong.credits.length || 0) >= (data.song.credits?.length || 0)
          ) {
            data.song.credits = cachedSong.credits;
            data.song.artistString = cachedSong.artistString || data.song.artistString;
          }
          setDetail({
            song: data.song,
            derivedSongs: Array.isArray(data.derivedSongs) ? data.derivedSongs : [],
            originalSong: data.originalSong || null,
          });
        } else if (cachedSong) {
          setDetail({
            song: cachedSong,
            derivedSongs: [],
            originalSong: null,
          });
        }
      } catch (err) {
        console.error('Failed to load song detail:', err);
        if (cachedSong) {
          setDetail({
            song: cachedSong,
            derivedSongs: [],
            originalSong: null,
          });
        }
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [songId]);

  const handleBackToList = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  const isDark = theme === 'dark';

  if (loading) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center gap-3 ${isDark ? 'bg-[#090d16] text-slate-400' : 'bg-[#f8fafc] text-slate-500'}`}>
        <div className="w-8 h-8 rounded-full border-3 border-cyan-500 border-t-transparent animate-spin"></div>
        <p className="text-xs font-medium">楽曲詳細とクレジット情報を展開中...</p>
      </div>
    );
  }

  if (!detail || !detail.song) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-8 text-center gap-4 ${isDark ? 'bg-[#090d16] text-slate-100' : 'bg-[#f8fafc] text-slate-900'}`}>
        <p className="text-sm opacity-60">該当する楽曲が見つかりませんでした。</p>
        <button
          onClick={handleBackToList}
          className="px-5 py-2.5 bg-cyan-500 text-slate-950 text-xs font-bold rounded-xl shadow cursor-pointer hover:bg-cyan-400"
        >
          ← 戻る
        </button>
      </div>
    );
  }

  const { song, derivedSongs = [], originalSong = null } = detail;
  const typeBadge = SONG_TYPE_MAP[song.songType] || { label: song.songType, color: 'bg-slate-800 text-slate-300' };

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${
        isDark ? 'bg-[#090d16] text-slate-100' : 'bg-[#f8fafc] text-slate-900'
      }`}
    >
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className={`absolute -top-32 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full blur-[120px] transition-opacity duration-700 ${
            isDark ? 'bg-gradient-to-r from-cyan-600/15 via-blue-600/15 to-purple-600/15 opacity-80' : 'bg-gradient-to-r from-cyan-200/50 via-blue-200/50 to-purple-200/50 opacity-60'
          }`}
        />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-5 sm:px-8 py-8 sm:py-12 space-y-8">
        <div className="flex items-center justify-between">
          <button
            onClick={handleBackToList}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-bold transition-all shadow-sm cursor-pointer ${
              isDark
                ? 'bg-slate-900/80 border-slate-800 text-slate-300 hover:text-cyan-400'
                : 'bg-white border-slate-200 text-slate-700 hover:text-cyan-600'
            }`}
          >
            ← 検索一覧に戻る
          </button>

          <button
            onClick={toggleTheme}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer shadow-sm ${
              isDark
                ? 'bg-slate-900 border-slate-700 text-amber-300 hover:bg-slate-800'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span>{isDark ? '🌙' : '☀️'}</span>
            <span>{isDark ? 'Dark' : 'Light'}</span>
          </button>
        </div>

        {/* プレイヤーコンテナ */}
        <div className="space-y-3">
          <div className="relative aspect-video w-full rounded-3xl overflow-hidden shadow-2xl border bg-black border-slate-800">
            {song.youtubeId ? (
              <iframe
                src={`https://www.youtube.com/embed/${song.youtubeId}?autoplay=0`}
                title={song.title}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : song.niconicoId ? (
              <iframe
                src={`https://embed.nicovideo.jp/watch/${song.niconicoId}`}
                title={song.title}
                className="w-full h-full border-0"
                allowFullScreen
              />
            ) : song.thumbUrl ? (
              <img
                src={song.thumbUrl}
                alt={song.title}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs font-mono">
                NO VIDEO / PREVIEW
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 text-xs">
            {song.youtubeId && (
              <a
                href={`https://www.youtube.com/watch?v=${song.youtubeId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-1.5 rounded-xl bg-red-600/10 text-red-400 hover:bg-red-600/20 border border-red-500/20 font-bold transition-all"
              >
                YouTubeで開く ↗
              </a>
            )}
            {song.niconicoId && (
              <a
                href={`https://www.nicovideo.jp/watch/${song.niconicoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-1.5 rounded-xl bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 border border-cyan-500/20 font-bold transition-all"
              >
                ニコニコ動画で開く ↗
              </a>
            )}
          </div>
        </div>

        {/* メイン情報 & 職域クレジット */}
        <section
          className={`p-6 sm:p-8 rounded-3xl border backdrop-blur-xl shadow-lg space-y-6 ${
            isDark
              ? 'bg-slate-900/50 border-slate-800/80'
              : 'bg-white/80 border-slate-200/80 shadow-slate-100'
          }`}
        >
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className={`text-[11px] font-bold px-3 py-1 rounded-full border ${typeBadge.color}`}>
                {typeBadge.label}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-snug">
              {song.title}
            </h1>
            <p className="text-xs opacity-50 mt-2 font-medium">
              アーティスト表記: {song.artistString}
            </p>
          </div>

          <div className={`pt-6 border-t ${isDark ? 'border-slate-800/80' : 'border-slate-100'}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold opacity-60 uppercase tracking-wider">
                職域クレジット (クリックして担当作品を検索)
              </h2>
              <span className="text-[10px] opacity-40">
                ※VocaDBおよびWeb概要欄から自動抽出
              </span>
            </div>

            {song.credits && song.credits.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {song.credits.map((c, i) => {
                  const config = ROLE_CONFIG[c.role] || {
                    label: c.role,
                    icon: '✨',
                    darkBadge: 'bg-slate-950 text-slate-300 border-slate-800',
                    lightBadge: 'bg-slate-100 text-slate-700 border-slate-200',
                  };

                  const roleLabel = c.role === 'singer' && c.isHumanSinger ? '🎙️ 歌唱 (人間/歌い手)' : config.label;

                  const searchUrl = c.artistId
                    ? `/?mode=creator&artistId=${c.artistId}&q=${encodeURIComponent(c.creatorName)}&role=${c.role}&page=1`
                    : `/?mode=creator&q=${encodeURIComponent(c.creatorName)}&role=${c.role}&page=1`;

                  return (
                    <Link
                      key={i}
                      href={searchUrl}
                      className={`group p-3.5 rounded-2xl border flex items-center justify-between transition-all duration-200 hover:-translate-y-0.5 shadow-sm hover:shadow-md ${
                        isDark
                          ? 'bg-slate-950/60 border-slate-800/90 hover:border-cyan-500/50 hover:bg-slate-900/80'
                          : 'bg-slate-50/80 border-slate-200 hover:border-cyan-400 hover:bg-white'
                      }`}
                    >
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                          isDark ? config.darkBadge : config.lightBadge
                        }`}
                      >
                        <span>{config.icon}</span>
                        <span>{roleLabel}</span>
                      </span>

                      <div className="flex items-center gap-1 min-w-0 ml-2">
                        <span className="text-sm font-bold truncate group-hover:text-cyan-400 transition-colors">
                          {c.creatorName}
                        </span>
                        <span className="text-xs text-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity font-bold">
                          ➔
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs opacity-50">クレジット情報が登録されていません。</p>
            )}
          </div>
        </section>

        {/* 派生ツリー */}
        <section
          className={`p-6 sm:p-8 rounded-3xl border backdrop-blur-xl shadow-lg space-y-6 ${
            isDark
              ? 'bg-slate-900/50 border-slate-800/80'
              : 'bg-white/80 border-slate-200/80 shadow-slate-100'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">🌿</span>
            <h2 className="text-base font-bold">派生ツリー (Derivative Tree)</h2>
          </div>

          {originalSong && (
            <div className="space-y-2">
              <span className="text-xs font-bold text-cyan-400">⬆ 原曲 (Original Version)</span>
              <Link
                href={`/songs/${originalSong.id}`}
                className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                  isDark
                    ? 'bg-slate-950/80 border-cyan-500/30 hover:border-cyan-500'
                    : 'bg-cyan-50/50 border-cyan-200 hover:border-cyan-400'
                }`}
              >
                <div>
                  <h4 className="text-sm font-bold">{originalSong.title}</h4>
                  <p className="text-xs opacity-60">{originalSong.artistString}</p>
                </div>
                <span className="text-xs font-bold text-cyan-500">原曲を見る ➔</span>
              </Link>
            </div>
          )}

          <div className="space-y-3">
            <span className="text-xs font-bold text-slate-400">
              ⬇ この曲の派生作品（歌ってみた・Remix・カバー） ({derivedSongs.length}件)
            </span>

            {derivedSongs.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {derivedSongs.map((derived) => {
                  const dBadge = SONG_TYPE_MAP[derived.songType] || { label: derived.songType, color: 'bg-slate-800 text-slate-300' };
                  return (
                    <Link
                      key={derived.id}
                      href={`/songs/${derived.id}`}
                      className={`p-3.5 rounded-2xl border transition-all flex items-center gap-3 ${
                        isDark
                          ? 'bg-slate-950/40 border-slate-800 hover:border-cyan-500/40'
                          : 'bg-slate-50 border-slate-200 hover:border-cyan-400'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-xl bg-slate-900 overflow-hidden shrink-0 flex items-center justify-center">
                        {derived.thumbUrl ? (
                          <img
                            src={derived.thumbUrl}
                            alt=""
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="text-[8px] opacity-40 font-mono">NO IMG</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${dBadge.color}`}>
                          {dBadge.label}
                        </span>
                        <h4 className="text-xs font-bold truncate mt-1">{derived.title}</h4>
                        <p className="text-[10px] opacity-50 truncate">{derived.artistString}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs opacity-50">登録されている派生作品はありません。</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
