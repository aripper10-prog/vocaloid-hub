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

// 楽曲検索：自前のAPIルート（/api/vocadb/songs）経由に変更し、YouTube結果もマージさせる
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
      _t: String(Date.now()), // キャッシュ回避用のダミーパラメータ
    });

    if (artistId) params.set('artistId', artistId);
    if (role && role !== 'all') params.set('role', role);
    if (songTypes) params.set('songTypes', songTypes);

    // 強制的にキャッシュをさせない設定
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
