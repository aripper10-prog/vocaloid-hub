export interface VocaDBCredit {
  role: string;
  creatorName: string;
  isHumanSinger?: boolean;
  artistId?: string | number;
}

export interface VocaDBSong {
  id: string;
  title: string;
  artists: { name: string }[];
  artistString?: string;
  songType: string;
  thumbUrl?: string;
  publishDate?: string;
  youtubeId?: string;
  niconicoId?: string;
  credits: VocaDBCredit[];
  viewCount?: number;
  isLive?: boolean;
}

export interface VocaDBArtist {
  id: number;
  name: string;
  artistType: string;
  pictureUrl?: string;
  additionalNames?: string;
}

// 楽曲検索（自前のAPI経由）
export async function searchVocaDBSongs(
  query: string,
  mode: 'song' | 'creator',
  sort: string,
  page: number,
  pageSize: number,
  artistId?: string,
  role?: string,
  songTypes?: string
): Promise<{ items: VocaDBSong[]; totalCount: number }> {
  try {
    const params = new URLSearchParams({
      query: query,
      mode: mode,
      sort: sort,
      maxResults: String(pageSize),
      start: String((page - 1) * pageSize),
      _t: String(Date.now()),
    });

    if (artistId) params.set('artistId', artistId);
    if (role && role !== 'all') params.set('role', role);
    if (songTypes) params.set('songTypes', songTypes);

    const targetUrl = `/api/vocadb/songs?${params.toString()}`;
    // デバッグ用：実際にどのようなパラメータ（query等）でAPIへリクエストを飛ばしているかコンソールに表示
    console.log('🔍 [VocaHub Debug] Fetching API:', targetUrl);

    const res = await fetch(targetUrl, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });

    if (!res.ok) {
      console.error('API response not ok:', res.status, res.statusText);
      return { items: [], totalCount: 0 };
    }

    const data = await res.json();
    
    // ★ artists や credits が未定義でも絶対に落ちないよう配列を保証する
    const items = (data.items || []).map((song: any) => ({
      ...song,
      artists: Array.isArray(song.artists) ? song.artists : [],
      credits: Array.isArray(song.credits) ? song.credits : [],
      artistString:
        song.artistString ||
        (song.artists ? song.artists.map((a: any) => a.name).join(', ') : 'Unknown Artist'),
    }));

    return {
      items,
      totalCount: data.totalCount || items.length,
    };
  } catch (error) {
    console.error('Error fetching songs via local API:', error);
    return { items: [], totalCount: 0 };
  }
}

// クリエイター候補検索
export async function searchVocaDBArtists(query: string): Promise<VocaDBArtist[]> {
  if (!query.trim()) return [];
  try {
    const res = await fetch(`/api/vocadb/artists?query=${encodeURIComponent(query)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.items || [];
  } catch (error) {
    return [];
  }
}

// 楽曲詳細取得（配列プロパティを完全保証してクラッシュを防止）
export async function getVocaDBSongDetail(id: string): Promise<any> {
  try {
    if (id.startsWith('yt_')) {
      return null;
    }

    const res = await fetch(`https://vocadb.net/api/songs/${id}?fields=Artists,PVs,ThumbUrl,Tags`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VocaHub/1.0',
      },
      cache: 'no-store',
    });

    if (!res.ok) return null;
    const song = await res.json();

    const formattedSong: VocaDBSong = {
      id: String(song.id),
      title: song.name,
      artists: Array.isArray(song.artists) ? song.artists.map((a: any) => ({ name: a.name })) : [],
      artistString: song.artistString,
      songType: song.songType,
      thumbUrl: song.thumbUrl || (song.pvs && song.pvs[0] ? song.pvs[0].thumbUrl : undefined),
      publishDate: song.publishDate,
      youtubeId: song.pvs?.find((p: any) => p.service === 'Youtube')?.pvId,
      niconicoId: song.pvs?.find((p: any) => p.service === 'NicoNicoDouga')?.pvId,
      credits: [], // フロントが .length を叩いても落ちないよう空配列を保証
      viewCount: 0,
    };

    return {
      song: formattedSong,
      ...formattedSong,
    };
  } catch (error) {
    console.error('Error fetching song detail:', error);
    return null;
  }
}
