'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from './context/ThemeContext';
import { searchVocaDBSongs, searchVocaDBArtists, VocaDBSong, VocaDBArtist } from '../lib/vocadb';

const PAGE_SIZE = 48;

const ROLE_CONFIG: Record<
  string,
  { label: string; darkBadge: string; lightBadge: string }
> = {
  music: {
    label: '🎵 作曲',
    darkBadge: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
    lightBadge: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  },
  lyrics: {
    label: '✍️ 作詞',
    darkBadge: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
    lightBadge: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  tuning: {
    label: '🎛️ 調声',
    darkBadge: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    lightBadge: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  singer: {
    label: '🎙️ ボーカル',
    darkBadge: 'bg-pink-500/10 text-pink-300 border-pink-500/30',
    lightBadge: 'bg-pink-50 text-pink-700 border-pink-200',
  },
  mix: {
    label: '🎧 MIX',
    darkBadge: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
    lightBadge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  illust: {
    label: '🎨 イラスト',
    darkBadge: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
    lightBadge: 'bg-orange-50 text-orange-700 border-orange-200',
  },
  movie: {
    label: '🎬 動画',
    darkBadge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    lightBadge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  dance: {
    label: '💃 振付',
    darkBadge: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
    lightBadge: 'bg-rose-50 text-rose-700 border-rose-200',
  },
};

const SORT_OPTIONS = [
  { key: 'PublishDate', label: '🕒 新着投稿順' },
  { key: 'FavoritedTimes', label: '🌟 歴代人気順' },
];

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme, toggleTheme } = useTheme();

  const urlMode = (searchParams.get('mode') as 'song' | 'creator') || 'song';
  const urlQuery = searchParams.get('query') || searchParams.get('q') || '';
  
  const urlRole = searchParams.get('role') || 'all';
  const [selectedRole, setSelectedRole] = useState(urlRole);

  const urlArtistId = searchParams.get('artistId') || '';
  const urlPage = parseInt(searchParams.get('page') || '1', 10);
  const urlSongType = searchParams.get('songType') || 'all';

  const [songQueryInput, setSongQueryInput] = useState(urlMode === 'song' ? urlQuery : '');
  const [creatorQueryInput, setCreatorQueryInput] = useState(urlMode === 'creator' ? urlQuery : '');

  const [songs, setSongs] = useState<VocaDBSong[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('PublishDate');

  const [artistSuggestions, setArtistSuggestions] = useState<VocaDBArtist[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedRole(urlRole);
  }, [urlRole]);

  useEffect(() => {
    if (urlMode === 'song') {
      setSongQueryInput(urlQuery);
      setCreatorQueryInput('');
    } else {
      setCreatorQueryInput(urlQuery);
      setSongQueryInput('');
    }

    let isMounted = true;

    const fetchSongs = async () => {
      setLoading(true);
      try {
        let currentArtistId = urlArtistId;

        if (urlMode === 'creator' && urlQuery.trim() && !currentArtistId) {
          try {
            const artists = await searchVocaDBArtists(urlQuery.trim());
            if (artists && artists.length > 0) {
              const target = urlQuery.trim().toLowerCase();
              
              let matched = artists.find((a: any) => {
                const name = (a.name || '').toLowerCase();
                const addNames = (a.additionalNames || '').toLowerCase();
                const isProducer = (a.artistType || '').toLowerCase() === 'producer';
                return isProducer && (name === target || addNames.includes(target) || target.includes(name));
              });

              if (!matched) {
                matched = artists.find((a: any) => (a.artistType || '').toLowerCase() === 'producer');
              }

              if (!matched) {
                matched = artists[0];
              }

              currentArtistId = String(matched.id);

              const params = new URLSearchParams(searchParams.toString());
              params.set('artistId', currentArtistId);
              router.replace(`/?${params.toString()}`);
            }
          } catch (e) {
            console.error('Auto artistId resolution error:', e);
          }
        }

        const songTypesParam =
          urlMode === 'song' && urlSongType === 'original'
            ? 'Original'
            : 'Original,Cover,Remix,Other,MusicPV';

        const result = await searchVocaDBSongs(
          urlQuery,
          urlMode,
          sort,
          urlPage,
          PAGE_SIZE,
          currentArtistId,
          'all',
          songTypesParam
        );

        if (isMounted) {
          setSongs(result.items);
          setTotalCount(result.totalCount);
        }
      } catch (err) {
        console.error('Fetch error:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchSongs();

    return () => {
      isMounted = false;
    };
  }, [urlMode, urlQuery, urlArtistId, urlPage, urlSongType, sort]);

  useEffect(() => {
    if (!creatorQueryInput.trim() || urlArtistId) {
      setArtistSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      const suggestions = await searchVocaDBArtists(creatorQueryInput.trim());
      setArtistSuggestions(suggestions);
    }, 250);

    return () => clearTimeout(timer);
  }, [creatorQueryInput, urlArtistId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestBoxRef.current && !suggestBoxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSongSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCreatorQueryInput('');
    setShowSuggestions(false);
    const q = songQueryInput.trim();
    if (!q) {
      handleResetAll();
    } else {
      router.push(`/?mode=song&query=${encodeURIComponent(q)}&songType=${urlSongType}&page=1`);
    }
  };

  const handleCreatorSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSongQueryInput('');
    setShowSuggestions(false);
    const q = creatorQueryInput.trim();
    if (!q) {
      handleResetAll();
      return;
    }

    try {
      const res = await searchVocaDBArtists(q);
      if (res && res.length > 0) {
        const matched = res[0];
        router.push(
          `/?mode=creator&artistId=${matched.id}&query=${encodeURIComponent(matched.name)}&role=${selectedRole}&page=1`
        );
        return;
      }
    } catch (err) {
      console.error('Artist search on submit error:', err);
    }

    router.push(`/?mode=creator&query=${encodeURIComponent(q)}&role=${selectedRole}&page=1`);
  };

  const handleSelectArtist = (artist: VocaDBArtist) => {
    setShowSuggestions(false);
    setCreatorQueryInput(artist.name);
    setSongQueryInput('');
    router.push(
      `/?mode=creator&artistId=${artist.id}&query=${encodeURIComponent(artist.name)}&role=${selectedRole}&page=1`
    );
  };

  const handleResetAll = () => {
    setSongQueryInput('');
    setCreatorQueryInput('');
    setShowSuggestions(false);
    window.location.href = '/';
  };

  const changePage = (newPage: number) => {
    if (newPage < 1) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(newPage));
    router.replace(`/?${params.toString()}`);
  };

  const handleRoleChange = (role: string) => {
    setSelectedRole(role);
    const params = new URLSearchParams(searchParams.toString());
    params.set('role', role);
    router.replace(`/?${params.toString()}`);
  };

  const handleSongTypeChange = (type: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('songType', type);
    params.set('page', '1');
    router.replace(`/?${params.toString()}`);
  };

  const handleSortChange = (newSort: string) => {
    setSort(newSort);
  };

  // --- ★ 手元（メモリ上）での厳格なフィルタリング ---
  const filteredSongs = songs.filter((song) => {
    let nameMatched = true;
    if (urlMode === 'creator' && urlQuery.trim()) {
      const queryLower = urlQuery.trim().toLowerCase();
      const hasMatchingCreator = (song.credits || []).some((c) => 
        (c.creatorName || '').toLowerCase().includes(queryLower)
      );
      const hasMatchingArtist = (song.artistString || '').toLowerCase().includes(queryLower);
      const hasMatchingTitle = (song.title || '').toLowerCase().includes(queryLower);

      nameMatched = hasMatchingCreator || hasMatchingArtist || hasMatchingTitle;
    }

    if (!nameMatched) return false;

    if (selectedRole !== 'all') {
      const credits = song.credits || [];
      const artists = song.artists || [];
      
      const matchCreditRole = credits.some((c: any) => c.role === selectedRole);
      
      const matchArtistRole = artists.some((a: any) => {
        const aRoles = a.roles || [];
        if (selectedRole === 'music' && (aRoles.includes('Composer') || aRoles.includes('Arranger'))) return true;
        if (selectedRole === 'lyrics' && aRoles.includes('Lyricist')) return true;
        if (selectedRole === 'singer' && aRoles.includes('Vocalist')) return true;
        if (selectedRole === 'mix' && aRoles.includes('Mixer')) return true;
        if (selectedRole === 'illust' && aRoles.includes('Illustrator')) return true;
        if (selectedRole === 'movie' && aRoles.includes('Animator')) return true;
        if (selectedRole === 'tuning' && aRoles.includes('VoiceManipulator')) return true;
        return false;
      });

      if (!matchCreditRole && !matchArtistRole) {
        return false;
      }
    }

    return true;
  });

  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
  const isDark = theme === 'dark';

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (urlPage > 4) pages.push('...');
      const start = Math.max(2, urlPage - 2);
      const end = Math.min(totalPages - 1, urlPage + 2);
      for (let i = start; i <= end; i++) pages.push(i);
      if (urlPage < totalPages - 3) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${
        isDark ? 'bg-[#090d16] text-slate-100' : 'bg-[#f8fafc] text-slate-900'
      }`}
    >
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className={`absolute -top-32 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full blur-[120px] transition-opacity duration-700 ${
            isDark
              ? 'bg-gradient-to-r from-cyan-600/15 via-blue-600/15 to-purple-600/15 opacity-80'
              : 'bg-gradient-to-r from-cyan-200/50 via-blue-200/50 to-purple-200/50 opacity-60'
          }`}
        />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 py-8 sm:py-12 space-y-8">
        {/* ヘッダー */}
        <header
          className={`flex items-center justify-between p-4 sm:p-5 rounded-3xl border backdrop-blur-2xl shadow-sm ${
            isDark
              ? 'bg-slate-900/60 border-slate-800/80'
              : 'bg-white/80 border-slate-200/80 shadow-slate-200/50'
          }`}
        >
          <button
            onClick={handleResetAll}
            className="flex items-center gap-3 cursor-pointer text-left bg-transparent border-0 p-0"
          >
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-black text-xl">
              V
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">
                  VocaHub
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  Dual Engine
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                ボカロ・歌い手・職域クレジット総合検索
              </p>
            </div>
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
        </header>

        {/* 2つの独立検索パネル */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-5 relative z-30">
          {/* 1. 曲名検索窓 */}
          <div
            className={`p-5 sm:p-6 rounded-3xl border backdrop-blur-xl shadow-lg space-y-3 transition-all ${
              urlMode === 'song' && urlQuery
                ? 'ring-2 ring-cyan-500/50 border-cyan-500/50'
                : isDark
                ? 'bg-slate-900/40 border-slate-800/80 shadow-slate-950/40'
                : 'bg-white/80 border-slate-200/80 shadow-slate-100'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-base">🎵</span>
              <span className="text-xs font-black uppercase tracking-wider text-cyan-400">
                曲名で検索
              </span>
            </div>

            <form onSubmit={handleSongSearch} className="flex gap-2 relative">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="曲名を入力..."
                  value={songQueryInput}
                  onChange={(e) => setSongQueryInput(e.target.value)}
                  className={`w-full rounded-2xl px-4 py-3 text-xs transition-all focus:outline-none focus:ring-2 focus:ring-cyan-500/30 ${
                    isDark
                      ? 'bg-slate-950/80 border border-slate-800 text-slate-100 placeholder-slate-600 focus:border-cyan-500'
                      : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:border-cyan-500'
                  }`}
                />
                {songQueryInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setSongQueryInput('');
                      handleResetAll();
                    }}
                    className="absolute right-3 top-3 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              <button
                type="submit"
                className="px-5 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-black text-xs rounded-2xl shadow hover:opacity-90 cursor-pointer shrink-0"
              >
                検索 ➔
              </button>
            </form>
            <p className="text-[10px] opacity-50">※楽曲タイトルのみを対象に検索（原曲最優先）</p>
          </div>

          {/* 2. クリエイター・職域検索窓 */}
          <div
            className={`p-5 sm:p-6 rounded-3xl border backdrop-blur-xl shadow-lg space-y-3 transition-all relative ${
              urlMode === 'creator' && urlQuery
                ? 'ring-2 ring-purple-500/50 border-purple-500/50'
                : isDark
                ? 'bg-slate-900/40 border-slate-800/80 shadow-slate-950/40'
                : 'bg-white/80 border-slate-200/80 shadow-slate-100'
            }`}
            ref={suggestBoxRef}
          >
            <div className="flex items-center gap-2">
              <span className="text-base">👤</span>
              <span className="text-xs font-black uppercase tracking-wider text-purple-400">
                クリエイター名・職域で検索
              </span>
            </div>

            <form onSubmit={handleCreatorSearch} className="flex gap-2 relative">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="クリエイター名を入力（作詞/作曲/絵師/MIX/歌い手など）..."
                  value={creatorQueryInput}
                  onChange={(e) => {
                    setCreatorQueryInput(e.target.value);
                    if (e.target.value.trim().length > 1) {
                      setShowSuggestions(true);
                    }
                  }}
                  className={`w-full rounded-2xl px-4 py-3 text-xs transition-all focus:outline-none focus:ring-2 focus:ring-purple-500/30 ${
                    isDark
                      ? 'bg-slate-950/80 border border-slate-800 text-slate-100 placeholder-slate-600 focus:border-purple-500'
                      : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:border-purple-500'
                  }`}
                />
                {creatorQueryInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setCreatorQueryInput('');
                      handleResetAll();
                    }}
                    className="absolute right-3 top-3 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              <button
                type="submit"
                className="px-5 py-3 bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-black text-xs rounded-2xl shadow hover:opacity-90 cursor-pointer shrink-0"
              >
                発掘 ➔
              </button>
            </form>
            <p className="text-[10px] opacity-50">※担当クレジットが含まれる作品のみを抽出</p>

            {/* サジェストボックス */}
            {showSuggestions && artistSuggestions.length > 0 && (
              <div
                className={`absolute top-full left-0 right-0 mt-2 rounded-2xl border shadow-2xl backdrop-blur-2xl z-50 overflow-hidden max-h-72 overflow-y-auto ${
                  isDark
                    ? 'bg-slate-950/98 border-slate-800/90 divide-y divide-slate-800/60 shadow-purple-950/50'
                    : 'bg-white/98 border-slate-200 divide-y divide-slate-100 shadow-slate-400/50'
                }`}
              >
                <div
                  className={`p-2 px-3 text-[10px] font-bold flex items-center justify-between sticky top-0 z-10 backdrop-blur-md ${
                    isDark ? 'text-slate-400 bg-slate-900/90' : 'text-slate-600 bg-slate-100/90'
                  }`}
                >
                  <span>👤 クリエイター候補</span>
                  <button
                    type="button"
                    onClick={() => setShowSuggestions(false)}
                    className="text-[10px] text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    ✕ 閉じる
                  </button>
                </div>

                {artistSuggestions.map((artist) => (
                  <div
                    key={artist.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectArtist(artist);
                    }}
                    className={`w-full p-2.5 px-3 flex items-center justify-between transition-all cursor-pointer select-none ${
                      isDark ? 'hover:bg-slate-900/80 text-slate-200' : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-slate-800 overflow-hidden flex items-center justify-center shrink-0 border border-slate-700/50">
                        {artist.pictureUrl ? (
                          <img
                            src={artist.pictureUrl}
                            alt=""
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-xs">👤</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate leading-snug">{artist.name}</div>
                        {artist.additionalNames && (
                          <div className="text-[9px] opacity-60 truncate max-w-xs">
                            {artist.additionalNames}
                          </div>
                        )}
                      </div>
                    </div>

                    <span
                      className={`text-[9px] px-2 py-0.5 rounded-full font-bold border shrink-0 ${
                        isDark
                          ? 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                          : 'bg-purple-50 text-purple-700 border-purple-200'
                      }`}
                    >
                      {artist.artistType}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 絞り込み状況バナー */}
        {urlQuery && (
          <div
            className={`p-4 rounded-2xl border flex items-center justify-between backdrop-blur-xl relative z-10 ${
              urlMode === 'creator'
                ? isDark
                  ? 'bg-purple-950/40 border-purple-500/40 text-purple-200'
                  : 'bg-purple-50 border-purple-300 text-purple-900'
                : isDark
                ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-200'
                : 'bg-cyan-50 border-cyan-300 text-cyan-900'
            }`}
          >
            <div className="flex items-center gap-2 text-xs">
              <span>{urlMode === 'creator' ? '👤 参加クリエイター:' : '🎵 検索曲名:'}</span>
              <strong className="text-sm font-black">{urlQuery}</strong>
              {urlMode === 'creator' && selectedRole !== 'all' && ROLE_CONFIG[selectedRole] && (
                <span className="px-2 py-0.5 rounded-full bg-black/20 text-[10px] font-bold border border-white/10">
                  {ROLE_CONFIG[selectedRole].label}
                </span>
              )}
              {urlMode === 'song' && urlSongType === 'original' && (
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-[10px] font-bold border border-cyan-500/30">
                  🎵 原曲のみ
                </span>
              )}
            </div>

            <button
              onClick={handleResetAll}
              className="px-3.5 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-900 text-white text-xs font-bold transition-all cursor-pointer border border-white/10"
            >
              全曲に戻す ✕
            </button>
          </div>
        )}

        {/* ソート ＆ フィルターパネル */}
        <section
          className={`p-5 rounded-3xl border backdrop-blur-xl shadow-lg space-y-4 relative z-10 ${
            isDark
              ? 'bg-slate-900/40 border-slate-800/80 shadow-slate-950/40'
              : 'bg-white/80 border-slate-200/80 shadow-slate-100'
          }`}
        >
          <div className="flex flex-wrap gap-2 items-center">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => handleSortChange(opt.key)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  sort === opt.key
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                    : isDark
                    ? 'bg-slate-950/60 text-slate-400 border border-slate-800 hover:text-slate-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {urlMode === 'song' ? (
            <div
              className={`flex flex-wrap gap-2 items-center pt-3 border-t ${
                isDark ? 'border-slate-800/80' : 'border-slate-100'
              }`}
            >
              <button
                onClick={() => handleSongTypeChange('all')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  urlSongType === 'all'
                    ? isDark
                      ? 'bg-white text-slate-950 shadow'
                      : 'bg-slate-900 text-white shadow'
                    : isDark
                    ? 'bg-slate-950/60 text-slate-400 border border-slate-800'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                🌟 すべての作品（カバー・歌ってみた含む）
              </button>

              <button
                onClick={() => handleSongTypeChange('original')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                  urlSongType === 'original'
                    ? 'bg-cyan-500 text-slate-950 font-black shadow-md shadow-cyan-500/20 scale-105 border-cyan-400'
                    : isDark
                    ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/20'
                    : 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100'
                }`}
              >
                🎵 原曲のみ（本家のみに限定）
              </button>
            </div>
          ) : (
            <div
              className={`flex flex-wrap gap-2 items-center pt-3 border-t ${
                isDark ? 'border-slate-800/80' : 'border-slate-100'
              }`}
            >
              <button
                onClick={() => handleRoleChange('all')}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  selectedRole === 'all'
                    ? isDark
                      ? 'bg-white text-slate-950 shadow'
                      : 'bg-slate-900 text-white shadow'
                    : isDark
                    ? 'bg-slate-950/60 text-slate-400 border border-slate-800'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                🌟 すべての職域
              </button>

              {Object.entries(ROLE_CONFIG).map(([key, config]) => {
                const active = selectedRole === key;
                return (
                  <button
                    key={key}
                    onClick={() => handleRoleChange(key)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                      active
                        ? `${isDark ? config.darkBadge : config.lightBadge} ring-2 ring-cyan-400/50 shadow-sm scale-105`
                        : `${isDark ? config.darkBadge : config.lightBadge} opacity-70 hover:opacity-100`
                    }`}
                  >
                    {config.label}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* 楽曲グリッド */}
        <section className="space-y-6 relative z-10">
          <div className="flex items-center justify-between text-xs opacity-60 px-2 font-medium">
            <span>
              ヒット総数: <strong className="text-cyan-500 font-bold">{totalCount.toLocaleString()}</strong> 件{' '}
              {totalPages > 1 && `（ページ ${urlPage} / ${totalPages}）`}
            </span>
            <span>1ページ {PAGE_SIZE} 件表示</span>
          </div>

          {loading ? (
            <div className="min-h-[35vh] flex flex-col items-center justify-center gap-3 text-slate-400">
              <div className="w-8 h-8 rounded-full border-3 border-cyan-500 border-t-transparent animate-spin"></div>
              <p className="text-xs font-medium">
                {urlMode === 'song' ? '楽曲タイトルを検索中...' : 'クリエイター担当作品を厳格抽出中...'}
              </p>
            </div>
          ) : filteredSongs.length === 0 ? (
            <div
              className={`min-h-[25vh] rounded-3xl border border-dashed flex flex-col items-center justify-center p-8 text-center gap-3 ${
                isDark ? 'border-slate-800 text-slate-400' : 'border-slate-300 text-slate-600'
              }`}
            >
              <div className="text-2xl mb-1">🔍</div>
              <p className="text-sm font-bold">
                {urlQuery ? '条件に一致する楽曲が見つかりませんでした' : '表示できる楽曲がありません'}
              </p>
              <p className="text-xs opacity-60">
                {urlQuery 
                  ? '検索キーワードや職域フィルターを変更して再度お試しください。' 
                  : '上の検索窓から曲名やクリエイター名を入力して探索を始めてください。'}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {filteredSongs.map((song) => (
                  <Link
                    key={song.id}
                    href={`/songs/${song.id}`}
                    onClick={() => {
                      try {
                        sessionStorage.setItem(`song_${song.id}`, JSON.stringify(song));
                      } catch (e) {
                        console.error(e);
                      }
                    }}
                    className={`group relative flex flex-col rounded-3xl overflow-hidden border transition-all duration-300 transform hover:-translate-y-1.5 shadow-sm hover:shadow-xl ${
                      isDark
                        ? 'bg-slate-900/50 hover:bg-slate-900/90 border-slate-800/80 hover:border-cyan-500/40 hover:shadow-cyan-500/10'
                        : 'bg-white hover:bg-slate-50/90 border-slate-200/90 hover:border-cyan-400 hover:shadow-slate-200'
                    }`}
                  >
                    <div className="relative aspect-video w-full bg-slate-950 overflow-hidden">
                      {song.thumbUrl ? (
                        <img
                          src={song.thumbUrl}
                          alt={song.title}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : null}

                      <div className="absolute inset-0 -z-10 flex items-center justify-center text-slate-600 text-xs font-mono bg-slate-950">
                        NO IMAGE
                      </div>

                      <div className="absolute top-2.5 left-2.5 flex gap-1">
                        {song.youtubeId && (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-red-500 text-white shadow">
                            YT
                          </span>
                        )}
                        {song.niconicoId && (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-950/80 text-cyan-400 border border-cyan-500/30">
                            Nico
                          </span>
                        )}
                      </div>

                      <div className="absolute bottom-2.5 right-2.5">
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full border backdrop-blur-md ${
                            song.isLive
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-slate-950/80 text-slate-300 border-slate-700/80'
                          }`}
                        >
                          {song.isLive ? '🌐 Live' : song.songType}
                        </span>
                      </div>
                    </div>

                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <div>
                        <h3
                          className={`text-sm font-bold line-clamp-2 leading-snug group-hover:text-cyan-400 transition-colors ${
                            isDark ? 'text-slate-100' : 'text-slate-900'
                          }`}
                        >
                          {song.title}
                        </h3>
                        <p className="text-[11px] opacity-60 truncate mt-1">{song.artistString}</p>
                      </div>

                      {song.credits && song.credits.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {song.credits.slice(0, 3).map((c, i) => {
                            const config = ROLE_CONFIG[c.role] || {
                              darkBadge: 'bg-slate-950 text-slate-400 border-slate-800',
                              lightBadge: 'bg-slate-100 text-slate-600 border-slate-200',
                              label: c.role,
                            };
                            return (
                              <span
                                key={i}
                                className={`text-[9px] font-semibold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                                  isDark ? config.darkBadge : config.lightBadge
                                }`}
                              >
                                <span className="opacity-80 font-bold">{config.label.split(' ')[0]}</span>
                                <span className="truncate max-w-[65px]">{c.creatorName}</span>
                              </span>
                            );
                          })}
                        </div>
                      )}

                      <div
                        className={`pt-2.5 border-t flex items-center justify-between text-[11px] ${
                          isDark ? 'border-slate-800/80 text-slate-500' : 'border-slate-100 text-slate-400'
                        }`}
                      >
                        <span>
                          {song.publishDate
                            ? new Date(song.publishDate).toLocaleDateString('ja-JP')
                            : ''}
                        </span>
                        <span className="text-cyan-500 font-bold group-hover:translate-x-1 transition-transform flex items-center gap-0.5 text-xs">
                          詳細 ➔
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="pt-8 pb-4 flex items-center justify-center gap-2 flex-wrap">
                  <button
                    onClick={() => changePage(1)}
                    disabled={urlPage === 1}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      urlPage === 1
                        ? 'opacity-30 cursor-not-allowed border-transparent'
                        : isDark
                        ? 'bg-slate-900 border-slate-800 hover:border-cyan-500'
                        : 'bg-white border-slate-200 hover:border-cyan-500'
                    }`}
                  >
                    « 最初
                  </button>

                  <button
                    onClick={() => changePage(urlPage - 1)}
                    disabled={urlPage === 1}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      urlPage === 1
                        ? 'opacity-30 cursor-not-allowed border-transparent'
                        : isDark
                        ? 'bg-slate-900 border-slate-800 hover:border-cyan-500'
                        : 'bg-white border-slate-200 hover:border-cyan-500'
                    }`}
                  >
                    ‹ 前へ
                  </button>

                  {getPageNumbers().map((num, idx) =>
                    num === '...' ? (
                      <span key={`dots-${idx}`} className="px-2 text-xs opacity-40 font-mono">
                        ...
                      </span>
                    ) : (
                      <button
                        key={`page-${num}`}
                        onClick={() => changePage(Number(num))}
                        className={`w-9 h-9 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          urlPage === num
                            ? 'bg-cyan-500 text-slate-950 font-black shadow-lg shadow-cyan-500/20 scale-105'
                            : isDark
                            ? 'bg-slate-900/80 border border-slate-800 hover:border-cyan-500/50 text-slate-300'
                            : 'bg-white border border-slate-200 hover:border-cyan-500 text-slate-700'
                        }`}
                      >
                        {num}
                      </button>
                    )
                  )}

                  <button
                    onClick={() => changePage(urlPage + 1)}
                    disabled={urlPage >= totalPages}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      urlPage >= totalPages
                        ? 'opacity-30 cursor-not-allowed border-transparent'
                        : isDark
                        ? 'bg-slate-900 border-slate-800 hover:border-cyan-500'
                        : 'bg-white border-slate-200 hover:border-cyan-500'
                    }`}
                  >
                    次へ ›
                  </button>

                  <button
                    onClick={() => changePage(totalPages)}
                    disabled={urlPage >= totalPages}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      urlPage >= totalPages
                        ? 'opacity-30 cursor-not-allowed border-transparent'
                        : isDark
                        ? 'bg-slate-900 border-slate-800 hover:border-cyan-500'
                        : 'bg-white border-slate-200 hover:border-cyan-500'
                    }`}
                  >
                    最後 ({totalPages}) »
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#090d16]" />}>
      <HomeContent />
    </Suspense>
  );
}
