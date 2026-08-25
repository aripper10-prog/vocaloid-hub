'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTheme } from './context/ThemeContext';
import { searchVocaDBSongs, searchVocaDBArtists, getVocaDBSongDetail, VocaDBSong, VocaDBArtist } from '../lib/vocadb';

const PAGE_SIZE = 48;

const ROLE_CONFIG: Record<
  string,
  { label: string; icon: string; darkBadge: string; lightBadge: string }
> = {
  music: {
    label: '🎵 作曲 / 編曲',
    icon: '🎵',
    darkBadge: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
    lightBadge: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  },
  lyrics: {
    label: '✍️ 作詞',
    icon: '✍️',
    darkBadge: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
    lightBadge: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  tuning: {
    label: '🎛️ 調声',
    icon: '🎛️',
    darkBadge: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    lightBadge: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  singer: {
    label: '🎙️ ボーカル',
    icon: '🎙️',
    darkBadge: 'bg-pink-500/10 text-pink-300 border-pink-500/30',
    lightBadge: 'bg-pink-50 text-pink-700 border-pink-200',
  },
  mix: {
    label: '🎧 MIX / Mastering',
    icon: '🎧',
    darkBadge: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
    lightBadge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  illust: {
    label: '🎨 イラスト',
    icon: '🎨',
    darkBadge: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
    lightBadge: 'bg-orange-50 text-orange-700 border-orange-200',
  },
  movie: {
    label: '🎬 動画・映像',
    icon: '🎬',
    darkBadge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    lightBadge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  dance: {
    label: '💃 振付・ダンス',
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

const SORT_OPTIONS = [
  { key: 'PublishDate', label: '🕒 新着投稿順' },
  { key: 'FavoritedTimes', label: '🌟 歴代人気順' },
];

// --- 楽曲詳細モーダルコンポーネント ---
function SongModal({
  songId,
  initialSong,
  onClose,
  isDark,
}: {
  songId: string;
  initialSong: VocaDBSong | null;
  onClose: () => void;
  isDark: boolean;
}) {
  const [detail, setDetail] = useState<{
    song: VocaDBSong;
    derivedSongs: VocaDBSong[];
    originalSong: VocaDBSong | null;
  } | null>(initialSong ? { song: initialSong, derivedSongs: [], originalSong: null } : null);
  const [loading, setLoading] = useState(!initialSong);

  useEffect(() => {
    if (!songId) return;

    async function loadData() {
      setLoading(true);
      try {
        const data = await getVocaDBSongDetail(songId);
        if (data && data.song) {
          if (
            initialSong &&
            initialSong.credits &&
            (initialSong.credits.length || 0) >= (data.song.credits?.length || 0)
          ) {
            data.song.credits = initialSong.credits;
            data.song.artistString = initialSong.artistString || data.song.artistString;
          }
          setDetail({
            song: data.song,
            derivedSongs: Array.isArray(data.derivedSongs) ? data.derivedSongs : [],
            originalSong: data.originalSong || null,
          });
        } else if (initialSong) {
          setDetail({ song: initialSong, derivedSongs: [], originalSong: null });
        }
      } catch (err) {
        console.error('Failed to load modal detail:', err);
        if (initialSong) {
          setDetail({ song: initialSong, derivedSongs: [], originalSong: null });
        }
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [songId]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!detail && loading) {
    return (
      <div onClick={handleBackdropClick} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
        <div className={`p-8 rounded-3xl border flex flex-col items-center gap-3 ${isDark ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-700'}`}>
          <div className="w-8 h-8 rounded-full border-3 border-cyan-500 border-t-transparent animate-spin"></div>
          <p className="text-xs font-medium">詳細情報を読み込み中...</p>
        </div>
      </div>
    );
  }

  const song = detail?.song || initialSong;
  if (!song) return null;

  const songAny = song as any;
  const typeBadge = SONG_TYPE_MAP[song.songType] || { label: song.songType, color: 'bg-slate-800 text-slate-300' };

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 sm:p-6 overflow-y-auto"
    >
      <div
        className={`relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border shadow-2xl p-6 sm:p-8 space-y-6 ${
          isDark ? 'bg-[#0b101b] border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="flex items-center justify-between sticky top-0 z-20 pb-3 border-b backdrop-blur-md -mx-6 -mt-6 px-6 pt-6 bg-inherit">
          <span className="text-xs font-bold opacity-60">楽曲詳細プレイヤー</span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800/50 hover:bg-slate-800 text-slate-300 flex items-center justify-center text-xs font-bold cursor-pointer transition-all"
          >
            ✕
          </button>
        </div>

        {/* プレイヤー */}
        <div className="space-y-3">
          <div className="relative aspect-video w-full rounded-2xl overflow-hidden shadow-lg border bg-black border-slate-800">
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
              <img src={song.thumbUrl} alt={song.title} className="w-full h-full object-cover" />
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
                className="px-3 py-1.5 rounded-xl bg-red-600/10 text-red-400 hover:bg-red-600/20 border border-red-500/20 font-bold transition-all"
              >
                YouTubeで開く ↗
              </a>
            )}
            {song.niconicoId && (
              <a
                href={`https://www.nicovideo.jp/watch/${song.niconicoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-xl bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 border border-cyan-500/20 font-bold transition-all"
              >
                ニコニコ動画で開く ↗
              </a>
            )}
          </div>
        </div>

        {/* タイトルと情報 */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[11px] font-bold px-3 py-1 rounded-full border ${typeBadge.color}`}>
              {typeBadge.label}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight leading-snug">{song.title}</h2>
          <p className="text-xs opacity-50 font-medium">アーティスト表記: {song.artistString}</p>
        </div>

        {/* 職域クレジット */}
        <div className={`pt-4 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
          <h3 className="text-xs font-bold opacity-60 uppercase tracking-wider mb-3">職域クレジット</h3>
          {song.credits && song.credits.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {song.credits.map((c, i) => {
                const config = ROLE_CONFIG[c.role] || {
                  label: c.role,
                  icon: '✨',
                  darkBadge: 'bg-slate-950 text-slate-300 border-slate-800',
                  lightBadge: 'bg-slate-100 text-slate-700 border-slate-200',
                };
                const roleLabel = c.role === 'singer' && c.isHumanSinger ? '🎙️ 歌唱 (歌い手)' : config.label;
                const searchUrl = c.artistId
                  ? `/?mode=creator&artistId=${c.artistId}&query=${encodeURIComponent(c.creatorName)}&role=${c.role}&page=1`
                  : `/?mode=creator&query=${encodeURIComponent(c.creatorName)}&role=${c.role}&page=1`;

                return (
                  <a
                    key={i}
                    href={searchUrl}
                    onClick={() => onClose()}
                    className={`group p-3 rounded-2xl border flex items-center justify-between transition-all ${
                      isDark
                        ? 'bg-slate-950/60 border-slate-800 hover:border-cyan-500/50 hover:bg-slate-900'
                        : 'bg-slate-50 border-slate-200 hover:border-cyan-400 hover:bg-white'
                    }`}
                  >
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${isDark ? config.darkBadge : config.lightBadge}`}>
                      <span>{config.icon}</span>
                      <span>{roleLabel}</span>
                    </span>
                    <span className="text-xs font-bold truncate group-hover:text-cyan-400 transition-colors ml-2">
                      {c.creatorName} ➔
                    </span>
                  </a>
                );
              })}
            </div>
          ) : (
            <p className="text-xs opacity-50">クレジット情報が登録されていません。</p>
          )}
        </div>

        {/* タグ表示セクション */}
        {songAny.tags && songAny.tags.length > 0 && (
          <div className={`pt-4 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
            <h3 className="text-xs font-bold opacity-60 uppercase tracking-wider mb-3">タグ</h3>
            <div className="flex flex-wrap gap-1.5">
              {songAny.tags.map((t: any, idx: number) => {
                const tagName = typeof t === 'string' ? t : t.tag?.name || t.name || '';
                const tagUrl = `/?mode=song&query=${encodeURIComponent(tagName)}&page=1`;

                return (
                  <a
                    key={idx}
                    href={tagUrl}
                    onClick={() => onClose()}
                    className={`text-[10px] font-bold px-3 py-1 rounded-full border transition-all ${
                      isDark
                        ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/20'
                        : 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100'
                    }`}
                  >
                    #{tagName}
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* 派生ツリー */}
        {detail && (detail.originalSong || (detail.derivedSongs && detail.derivedSongs.length > 0)) && (
          <div className={`pt-4 border-t space-y-4 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
            <h3 className="text-xs font-bold opacity-60 uppercase tracking-wider">派生ツリー</h3>
            {detail.originalSong && (
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-cyan-400">⬆ 原曲</span>
                <div className={`p-3 rounded-2xl border text-xs font-bold ${isDark ? 'bg-slate-950 border-cyan-500/30' : 'bg-cyan-50 border-cyan-200'}`}>
                  {detail.originalSong.title} ({detail.originalSong.artistString})
                </div>
              </div>
            )}
            {detail.derivedSongs && detail.derivedSongs.length > 0 && (
              <div className="space-y-2">
                <span className="text-[10px] font-bold opacity-60">⬇ この曲の派生作品 ({detail.derivedSongs.length}件)</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {detail.derivedSongs.map((d) => (
                    <div key={d.id} className={`p-2.5 rounded-xl border text-xs truncate ${isDark ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                      <div className="font-bold truncate">{d.title}</div>
                      <div className="text-[10px] opacity-50 truncate">{d.artistString}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- メインホーム画面 ---
function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme, toggleTheme } = useTheme();

  const urlMode = (searchParams.get('mode') as 'song' | 'creator') || 'song';
  const urlQuery = searchParams.get('query') || searchParams.get('q') || '';
  
  // ★ 職域フィルタ用パラメータ
  const urlRole = searchParams.get('role') || 'all';
  const [selectedRole, setSelectedRole] = useState(urlRole);

  const urlArtistId = searchParams.get('artistId') || '';
  const urlPage = parseInt(searchParams.get('page') || '1', 10);
  
  // ★ 原曲フィルタ用パラメータ
  const urlSongType = searchParams.get('songType') || 'all';

  const [songQueryInput, setSongQueryInput] = useState(urlMode === 'song' ? urlQuery : '');
  const [creatorQueryInput, setCreatorQueryInput] = useState(urlMode === 'creator' ? urlQuery : '');

  const [songs, setSongs] = useState<VocaDBSong[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('PublishDate');

  const [activeModalSongId, setActiveModalSongId] = useState<string | null>(null);
  const [activeModalSongData, setActiveModalSongData] = useState<VocaDBSong | null>(null);

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

        // ★ 原曲フィルタの反映
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

  // ★ 職域フィルタ変更ハンドラ
  const handleRoleChange = (role: string) => {
    setSelectedRole(role);
    const params = new URLSearchParams(searchParams.toString());
    params.set('role', role);
    router.replace(`/?${params.toString()}`);
  };

  // ★ 原曲フィルタ変更ハンドラ
  const handleSongTypeChange = (type: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('songType', type);
    params.set('page', '1');
    router.replace(`/?${params.toString()}`);
  };

  const handleSortChange = (newSort: string) => {
    setSort(newSort);
  };

  // --- ★ 手元での厳格なフィルタリング（原曲フィルタ ＆ 職域フィルタの適用） ---
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

    // ★ 職域フィルタ（role）の厳格な手元適用
    if (urlMode === 'creator' && selectedRole !== 'all') {
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
            isDark ? 'bg-slate-900/60 border-slate-800/80' : 'bg-white/80 border-slate-200/80 shadow-slate-200/50'
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
              isDark ? 'bg-slate-900 border-slate-700 text-amber-300 hover:bg-slate-800' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span>{isDark ? '🌙' : '☀️'}</span>
            <span>{isDark ? 'Dark' : 'Light'}</span>
          </button>
        </header>

        {/* 検索パネル等 */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-5 relative z-30">
          <div className={`p-5 sm:p-6 rounded-3xl border backdrop-blur-xl shadow-lg space-y-3 transition-all ${
            urlMode === 'song' && urlQuery ? 'ring-2 ring-cyan-500/50 border-cyan-500/50' : isDark ? 'bg-slate-900/40 border-slate-800/80' : 'bg-white/80 border-slate-200/80'
          }`}>
            <div className="flex items-center gap-2">
              <span className="text-base">🎵</span>
              <span className="text-xs font-black uppercase tracking-wider text-cyan-400">曲名で検索</span>
            </div>
            <form onSubmit={handleSongSearch} className="flex gap-2 relative">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="曲名を入力..."
                  value={songQueryInput}
                  onChange={(e) => setSongQueryInput(e.target.value)}
                  className={`w-full rounded-2xl px-4 py-3 text-xs transition-all focus:outline-none focus:ring-2 focus:ring-cyan-500/30 ${
                    isDark ? 'bg-slate-950/80 border border-slate-800 text-slate-100' : 'bg-slate-50 border border-slate-200 text-slate-900'
                  }`}
                />
              </div>
              <button type="submit" className="px-5 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-black text-xs rounded-2xl shadow cursor-pointer shrink-0">
                検索 ➔
              </button>
            </form>
          </div>

          <div className={`p-5 sm:p-6 rounded-3xl border backdrop-blur-xl shadow-lg space-y-3 transition-all relative ${
            urlMode === 'creator' && urlQuery ? 'ring-2 ring-purple-500/50 border-purple-500/50' : isDark ? 'bg-slate-900/40 border-slate-800/80' : 'bg-white/80 border-slate-200/80'
          }`} ref={suggestBoxRef}>
            <div className="flex items-center gap-2">
              <span className="text-base">👤</span>
              <span className="text-xs font-black uppercase tracking-wider text-purple-400">クリエイター名・職域で検索</span>
            </div>
            <form onSubmit={handleCreatorSearch} className="flex gap-2 relative">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="クリエイター名を入力..."
                  value={creatorQueryInput}
                  onChange={(e) => {
                    setCreatorQueryInput(e.target.value);
                    if (e.target.value.trim().length > 1) setShowSuggestions(true);
                  }}
                  className={`w-full rounded-2xl px-4 py-3 text-xs transition-all focus:outline-none focus:ring-2 focus:ring-purple-500/30 ${
                    isDark ? 'bg-slate-950/80 border border-slate-800 text-slate-100' : 'bg-slate-50 border border-slate-200 text-slate-900'
                  }`}
                />
              </div>
              <button type="submit" className="px-5 py-3 bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-black text-xs rounded-2xl shadow cursor-pointer shrink-0">
                発掘 ➔
              </button>
            </form>

            {showSuggestions && artistSuggestions.length > 0 && (
              <div className={`absolute top-full left-0 right-0 mt-2 rounded-2xl border shadow-2xl backdrop-blur-2xl z-50 overflow-hidden max-h-72 overflow-y-auto ${
                isDark ? 'bg-slate-950/98 border-slate-800' : 'bg-white/98 border-slate-200'
              }`}>
                {artistSuggestions.map((artist) => (
                  <div
                    key={artist.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectArtist(artist);
                    }}
                    className={`w-full p-2.5 px-3 flex items-center justify-between transition-all cursor-pointer ${
                      isDark ? 'hover:bg-slate-900 text-slate-200' : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="text-xs font-bold">{artist.name}</div>
                    <span className="text-[9px] px-2 py-0.5 rounded-full border bg-purple-500/10 text-purple-300">{artist.artistType}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ★ ソート ＆ フィルターパネル（原曲フィルタ・職域フィルタを完全復活） */}
        <section
          className={`p-5 rounded-3xl border backdrop-blur-xl shadow-lg space-y-4 relative z-10 ${
            isDark ? 'bg-slate-900/40 border-slate-800/80' : 'bg-white/80 border-slate-200/80'
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

          {/* 曲名検索モード時の「原曲フィルタ」 */}
          {urlMode === 'song' ? (
            <div className={`flex flex-wrap gap-2 items-center pt-3 border-t ${isDark ? 'border-slate-800/80' : 'border-slate-100'}`}>
              <button
                onClick={() => handleSongTypeChange('all')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  urlSongType === 'all'
                    ? isDark ? 'bg-white text-slate-950 shadow' : 'bg-slate-900 text-white shadow'
                    : isDark ? 'bg-slate-950/60 text-slate-400 border border-slate-800' : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                🌟 すべての作品（カバー・歌ってみた含む）
              </button>

              <button
                onClick={() => handleSongTypeChange('original')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                  urlSongType === 'original'
                    ? 'bg-cyan-500 text-slate-950 font-black shadow-md shadow-cyan-500/20 scale-105 border-cyan-400'
                    : isDark ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/20' : 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100'
                }`}
              >
                🎵 原曲のみ（本家のみに限定）
              </button>
            </div>
          ) : (
            /* クリエイター検索モード時の「職域フィルタ」 */
            <div className={`flex flex-wrap gap-2 items-center pt-3 border-t ${isDark ? 'border-slate-800/80' : 'border-slate-100'}`}>
              <button
                onClick={() => handleRoleChange('all')}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  selectedRole === 'all'
                    ? isDark ? 'bg-white text-slate-950 shadow' : 'bg-slate-900 text-white shadow'
                    : isDark ? 'bg-slate-950/60 text-slate-400 border border-slate-800' : 'bg-slate-100 text-slate-600 border border-slate-200'
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
          {loading ? (
            <div className="min-h-[35vh] flex flex-col items-center justify-center gap-3 text-slate-400">
              <div className="w-8 h-8 rounded-full border-3 border-cyan-500 border-t-transparent animate-spin"></div>
              <p className="text-xs font-medium">楽曲を検索中...</p>
            </div>
          ) : filteredSongs.length === 0 ? (
            <div className={`min-h-[25vh] rounded-3xl border border-dashed flex flex-col items-center justify-center p-8 text-center gap-3 ${isDark ? 'border-slate-800 text-slate-400' : 'border-slate-300 text-slate-600'}`}>
              <p className="text-sm font-bold">条件に一致する楽曲が見つかりませんでした</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {filteredSongs.map((song) => (
                <div
                  key={song.id}
                  onClick={() => {
                    setActiveModalSongId(String(song.id));
                    setActiveModalSongData(song);
                  }}
                  className={`group relative flex flex-col rounded-3xl overflow-hidden border transition-all duration-300 transform hover:-translate-y-1.5 shadow-sm hover:shadow-xl cursor-pointer ${
                    isDark ? 'bg-slate-900/50 hover:bg-slate-900/90 border-slate-800 hover:border-cyan-500/40' : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-cyan-400'
                  }`}
                >
                  <div className="relative aspect-video w-full bg-slate-950 overflow-hidden">
                    {song.thumbUrl && (
                      <img src={song.thumbUrl} alt={song.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    )}
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div>
                      <h3 className={`text-sm font-bold line-clamp-2 leading-snug group-hover:text-cyan-400 transition-colors ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                        {song.title}
                      </h3>
                      <p className="text-[11px] opacity-60 truncate mt-1">{song.artistString}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* モーダル表示 */}
      {activeModalSongId && (
        <SongModal
          songId={activeModalSongId}
          initialSong={activeModalSongData}
          onClose={() => {
            setActiveModalSongId(null);
            setActiveModalSongData(null);
          }}
          isDark={isDark}
        />
      )}
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
