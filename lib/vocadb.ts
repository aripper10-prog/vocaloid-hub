export interface VocaDBCredit {
  role: string;
  creatorName: string;
  categories: string;
  artistId?: number;
  isHumanSinger?: boolean;
}

export interface VocaDBSong {
  id: number | string;
  title: string;
  artistString: string;
  songType: string;
  publishDate?: string;
  thumbUrl?: string;
  youtubeId?: string;
  niconicoId?: string;
  credits: VocaDBCredit[];
  originalVersionId?: number;
  isLive?: boolean;
}

export interface VocaDBSearchResult {
  items: VocaDBSong[];
  totalCount: number;
}

export interface VocaDBSongDetailResult {
  song: VocaDBSong;
  derivedSongs: VocaDBSong[];
  originalSong: VocaDBSong | null;
}

export interface VocaDBArtist {
  id: number;
  name: string;
  artistType: string;
  additionalNames?: string;
  pictureUrl?: string;
}

const ROLE_MAP: Record<string, string> = {
  Composer: 'music',
  Arranger: 'music',
  Remixer: 'music',
  Music: 'music',
  music: 'music',
  Lyricist: 'lyrics',
  Lyrics: 'lyrics',
  lyrics: 'lyrics',
  VoiceManipulator: 'tuning',
  Tuning: 'tuning',
  tuning: 'tuning',
  Illustrator: 'illust',
  Illustration: 'illust',
  illust: 'illust',
  Animator: 'movie',
  Movie: 'movie',
  movie: 'movie',
  Mixer: 'mix',
  Mastering: 'mix',
  mix: 'mix',
  Vocalist: 'singer',
  Chorus: 'singer',
  singer: 'singer',
  Encoder: 'movie',
};

const HUMAN_VOCALIST_TYPES = [
  'Human',
  'Artist',
  'CoverArtist',
  'Utaite',
  'Circle',
  'Band',
];

export function transformVocaDBSong(item: any): VocaDBSong {
  if (!item) {
    throw new Error('Item is undefined');
  }

  const pvs = item.pvs || [];
  const ytPv = pvs.find((p: any) => p.service === 'Youtube' && !p.disabled);
  const nicoPv = pvs.find((p: any) => p.service === 'NicoNicoDouga' && !p.disabled);

  let nicoThumb = '';
  if (nicoPv?.pvId) {
    const numId = nicoPv.pvId.replace(/\D/g, '');
    if (numId) {
      nicoThumb = `https://nicovideo.cdn.nimg.jp/thumbnails/${numId}/${numId}`;
    }
  }

  const thumb = item.thumbUrl || ytPv?.thumbUrl || nicoThumb || '';
  const credits: VocaDBCredit[] = [];
  const artistsList = item.artists || [];

  artistsList.forEach((a: any) => {
    const creatorName = a.name || a.artist?.name || '不明';
    const categories = a.categories || '';
    const artistId = a.artist?.id;
    const artistType = a.artist?.artistType || '';
    const isHumanSinger = HUMAN_VOCALIST_TYPES.includes(artistType);

    const rawRoles = (a.roles || '')
      .split(',')
      .map((r: string) => r.trim())
      .filter(Boolean);

    const matchedRoles = new Set<string>();

    for (const r of rawRoles) {
      if (ROLE_MAP[r]) {
        matchedRoles.add(ROLE_MAP[r]);
      }
    }

    if (matchedRoles.size === 0 || rawRoles.includes('Default')) {
      if (categories.includes('Producer')) matchedRoles.add('music');
      if (categories.includes('Vocalist')) matchedRoles.add('singer');
      if (categories.includes('Illustrator')) matchedRoles.add('illust');
      if (categories.includes('Animator')) matchedRoles.add('movie');
      if (categories.includes('Lyricist')) matchedRoles.add('lyrics');
      if (categories.includes('VoiceManipulator')) matchedRoles.add('tuning');
    }

    if (matchedRoles.size === 0) {
      matchedRoles.add('music');
    }

    matchedRoles.forEach((role) => {
      if (!credits.some((c) => c.artistId === artistId && c.creatorName === creatorName && c.role === role)) {
        credits.push({
          role,
          creatorName,
          categories,
          artistId,
          isHumanSinger: role === 'singer' ? isHumanSinger : undefined,
        });
      }
    });
  });

  return {
    id: item.id,
    title: item.name || item.defaultName || 'タイトル不明',
    artistString: item.artistString || '',
    songType: item.songType || 'Original',
    publishDate: item.publishDate,
    thumbUrl: thumb,
    youtubeId: ytPv?.pvId,
    niconicoId: nicoPv?.pvId,
    credits,
    originalVersionId: item.originalVersionId,
  };
}

export async function searchVocaDBSongs(
  query = '',
  mode: 'song' | 'creator' = 'song',
  sort = 'PublishDate',
  page = 1,
  pageSize = 48,
  artistId?: string | number | null,
  role?: string | null,
  songTypes = 'Original,Cover,Remix,Other,MusicPV'
): Promise<VocaDBSearchResult> {
  const start = (page - 1) * pageSize;

  const params = new URLSearchParams({
    mode,
    sort,
    maxResults: String(pageSize),
    start: String(start),
    songTypes,
  });

  if (query.trim()) params.set('query', query.trim());
  if (artistId) params.set('artistId', String(artistId));
  if (role && role !== 'all') params.set('role', role);

  let vocaResults: VocaDBSong[] = [];
  let totalCount = 0;

  try {
    const res = await fetch(`/api/vocadb/songs?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      vocaResults = (data.items || []).map(transformVocaDBSong);
      totalCount = data.totalCount || vocaResults.length;
    }
  } catch (err) {
    console.error('VocaDB search error:', err);
  }

  // 曲名検索時：タイトル完全一致の原曲（Original）を先頭に昇格
  if (mode === 'song' && query.trim() && page === 1 && vocaResults.length > 1) {
    const target = query.trim().toLowerCase();
    const exactOriginalIdx = vocaResults.findIndex(
      (s) => s.title.trim().toLowerCase() === target && s.songType === 'Original'
    );
    if (exactOriginalIdx > 0) {
      const [exactSong] = vocaResults.splice(exactOriginalIdx, 1);
      vocaResults.unshift(exactSong);
    }
  }

  // VocaDBに登録がない、または結果が非常に少ない場合のみWeb動画フォールバックを発動
  if (query.trim() && !artistId && vocaResults.length < 5) {
    try {
      const liveParams = new URLSearchParams({
        q: query.trim(),
        mode,
        limit: String(pageSize),
        offset: String(start),
      });

      const liveRes = await fetch(`/api/search/live?${liveParams.toString()}`);
      if (liveRes.ok) {
        const liveData = await liveRes.json();
        const liveResults: VocaDBSong[] = liveData.items || [];
        const liveTotal = liveData.totalCount || liveResults.length;

        const existingNico = new Set(vocaResults.map((s) => s.niconicoId).filter(Boolean));
        const existingYt = new Set(vocaResults.map((s) => s.youtubeId).filter(Boolean));

        const uniqueLive = liveResults.filter((s) => {
          if (s.niconicoId && existingNico.has(s.niconicoId)) return false;
          if (s.youtubeId && existingYt.has(s.youtubeId)) return false;
          return true;
        });

        return {
          items: [...vocaResults, ...uniqueLive],
          totalCount: Math.max(totalCount, liveTotal, vocaResults.length + uniqueLive.length),
        };
      }
    } catch (err) {
      console.error('Live fallback search error:', err);
    }
  }

  return {
    items: vocaResults,
    totalCount,
  };
}

export async function getVocaDBSongDetail(id: number | string): Promise<VocaDBSongDetailResult | null> {
  const res = await fetch(`/api/vocadb/songs/${id}`);
  if (!res.ok) return null;
  const songData = await res.json();
  const transformed = transformVocaDBSong(songData);

  let derivedSongs: VocaDBSong[] = [];
  if (typeof id === 'number' || !isNaN(Number(id))) {
    const derivedRes = await fetch(
      `/api/vocadb/songs?parentVersionId=${id}&sort=PublishDate&maxResults=20&songTypes=Original,Cover,Remix,Other,MusicPV`
    );
    if (derivedRes.ok) {
      const derivedData = await derivedRes.json();
      derivedSongs = (derivedData.items || []).map(transformVocaDBSong);
    }
  }

  return {
    song: transformed,
    derivedSongs,
    originalSong: songData.originalVersion ? transformVocaDBSong(songData.originalVersion) : null,
  };
}

export async function searchVocaDBArtists(query: string): Promise<VocaDBArtist[]> {
  if (!query.trim()) return [];
  const res = await fetch(`/api/vocadb/artists?query=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items || []).map((a: any) => ({
    id: a.id,
    name: a.name,
    artistType: a.artistType,
    additionalNames: a.additionalNames,
    pictureUrl: a.mainPicture?.urlThumb || a.mainPicture?.urlSmall || '',
  }));
}