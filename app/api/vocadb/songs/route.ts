import { NextResponse } from 'next/server';

const VOCADB_ROLE_MAP: Record<string, string> = {
  music: 'Composer',
  lyrics: 'Lyricist',
  tuning: 'VoiceManipulator',
  illust: 'Illustrator',
  movie: 'Animator',
  mix: 'Mixer',
  singer: 'Vocalist',
  dance: 'Other',
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query') || '';
    const mode = searchParams.get('mode') || 'song';
    const sort = searchParams.get('sort') || 'PublishDate';
    const maxResults = searchParams.get('maxResults') || '48';
    const start = searchParams.get('start') || '0';
    const songTypes = searchParams.get('songTypes') || 'Original,Cover,Remix,Other,MusicPV';
    const role = searchParams.get('role');

    let items: any[] = [];
    const apiKey = process.env.YOUTUBE_API_KEY;

    // --- 1. YouTube検索：余計なヒットを防ぐ「完全一致」 ---
    if (query.trim() && apiKey) {
      try {
        const exactQuery = `"${query.trim()}"`;
        const ytUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(
          exactQuery
        )}&maxResults=20&key=${apiKey}`;

        const ytRes = await fetch(ytUrl);
        const ytData = await ytRes.json();

        if (ytData.items && Array.isArray(ytData.items)) {
          const videoIds = ytData.items
            .map((item: any) => item.id?.videoId)
            .filter(Boolean)
            .join(',');

          if (videoIds) {
            const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}&key=${apiKey}`;
            const detailsRes = await fetch(detailsUrl);
            const detailsData = await detailsRes.json();

            if (detailsData.items && Array.isArray(detailsData.items)) {
              const ytSongs = detailsData.items.map((item: any) => ({
                id: `yt_${item.id}`,
                title: item.snippet?.title || 'Untitled',
                artists: [{ name: item.snippet?.channelTitle || 'Unknown' }],
                artistString: item.snippet?.channelTitle || 'Unknown Artist',
                songType: 'Original',
                thumbUrl: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || '',
                publishDate: item.snippet?.publishedAt || new Date().toISOString(),
                youtubeId: item.id,
                niconicoId: undefined,
                credits: [
                  {
                    role: 'Lyricist',
                    creatorName: query.trim(),
                  },
                ],
                viewCount: item.statistics?.viewCount ? parseInt(item.statistics.viewCount, 10) : undefined,
              }));

              items = [...items, ...ytSongs];
            }
          }
        }
      } catch (err) {
        console.error('YouTube search error:', err);
      }
    }

    // --- 2. VocaDB検索：カスリ傷でも広範囲に拾う「あいまい・柔軟検索」 ---
    try {
      const vocaParams = new URLSearchParams({
        sort: sort,
        maxResults: maxResults,
        start: start,
        getTotalCount: 'true',
        fields: 'Artists,PVs,ThumbUrl',
        lang: 'Japanese',
        songTypes: songTypes,
      });

      if (query.trim()) {
        // VocaDB側はあえて完全一致にせず、かすったデータも引っ張るために通常のAutoマッチにする
        vocaParams.set('query', query.trim());
        vocaParams.set('nameMatchMode', 'Auto');
      }

      if (role && VOCADB_ROLE_MAP[role]) {
        vocaParams.append('artistRole', VOCADB_ROLE_MAP[role]);
      }

      const vocaUrl = `https://vocadb.net/api/songs?${vocaParams.toString()}`;
      const vocaRes = await fetch(vocaUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VocaHub/1.0',
        },
        cache: 'no-store',
      });

      if (vocaRes.ok) {
        const vocaData = await vocaRes.json();
        const vocaItems = vocaData.items || [];

        // IDの重複を防ぎながら、YouTubeの結果とVocaDB（ニコニコPV等）の結果を合体
        const existingIds = new Set(items.map((item) => String(item.id)));
        const uniqueVocaItems = vocaItems.filter((v: any) => !existingIds.has(String(v.id)));

        items = [...items, ...uniqueVocaItems];
      }
    } catch (vocaErr) {
      console.error('VocaDB fetch error:', vocaErr);
    }

    return NextResponse.json(
      {
        items,
        totalCount: items.length,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error) {
    console.error('Fatal error:', error);
    return NextResponse.json({ items: [], totalCount: 0 }, { status: 200 });
  }
}
