export interface VocaDBCredit {
  role: string;
  creatorName: string;
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

    const res = await fetch(`/api/vocadb/songs?${params.toString()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });

    if (!res.ok) {
      return { items: [], totalCount: 0 };
    }

    const data = await res.json();
    
    const items = (data.items || []).map((song: any) => ({
      ...song,
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

// 楽曲詳細取得（型エラーを回避する安全な定義）
export async function getVocaDBSongDetail(id: string): Promise<any> {
  try {
    if (id.startsWith('yt_')) {
      return null;
    }

    const res = await fetch(`https://vocadb.net/api/songs/${id}?fields=Artists,PVs,ThumbUrl`, {
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
      artists: song.artists ? song.artists.map((a: any) => ({ name: a.name })) : [],
      artistString: song.artistString,
      songType: song.songType,
      thumbUrl: song.thumbUrl || (song.pvs && song.pvs[0] ? song.pvs[0].thumbUrl : undefined),
      publishDate: song.publishDate,
      youtubeId: song.pvs?.find((p: any) => p.service === 'Youtube')?.pvId,
      niconicoId: song.pvs?.find((p: any) => p.service === 'NicoNicoDouga')?.pvId,
      credits: [],
      viewCount: 0,
    };

    // page.tsxの `data.song` と `data`（直接データ）の両方に対応できるようにする
    return {
      song: formattedSong,
      ...formattedSong,
    };
  } catch (error) {
    console.error('Error fetching song detail:', error);
    return null;
  }
}
