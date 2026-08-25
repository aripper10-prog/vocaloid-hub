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

// YouTube検索を補助的に発動させる例外的なキーワード（必要に応じて追加・調整可能）
// ここに含まれる、またはVocaDBでヒットしにくい個人のペンネームなどのときだけYouTubeを叩く
function shouldSearchYouTube(query: string): boolean {
  const q = query.trim().toLowerCase();
  // 例: 「作詞師ari」や「ari」などの個人のペンネーム・サークル名などが含まれる場合
  const personalKeywords = ['作詞師ari', 'ari', 'alice and lemonade'];
  return personalKeywords.some((keyword) => q.includes(keyword));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query') || '';
    const sort = searchParams.get('sort') || 'PublishDate';
    const maxResults = searchParams.get('maxResults') || '48';
    const start = searchParams.get('start') || '0';
    const songTypes = searchParams.get('songTypes') || 'Original,Cover,Remix,Other,MusicPV';
    const role = searchParams.get('role');

    let ytItems: any[] = [];
    const apiKey = process.env.YOUTUBE_API_KEY;

    // --- 1. VocaDB検索を先に行う ---
    let vocaData: any = { items: [], totalCount: 0 };
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
        vocaData = await vocaRes.json();
      }
    } catch (vocaErr) {
      console.error('VocaDB fetch error:', vocaErr);
    }

    const vocaItems = vocaData.items || [];

    // --- 2. YouTube検索の判定 ---
    // 「VocaDBの検索結果が少ない」かつ「個人のペンネーム（作詞師ariなど）での検索である」場合のみYouTubeを補助発動
    const isPersonalQuery = shouldSearchYouTube(query);
    const shouldFetchYT = query.trim() && apiKey && (vocaItems.length === 0 || isPersonalQuery);

    if (shouldFetchYT) {
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
              ytItems = detailsData.items.map((item: any) => ({
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
            }
          }
        }
      } catch (err) {
        console.error('YouTube search error:', err);
      }
    }

    // 重複を避けてマージ
    const existingIds = new Set(vocaItems.map((item: any) => String(item.id)));
    const uniqueYtItems = ytItems.filter((yt: any) => !existingIds.has(String(yt.id)));

    const mergedItems = [...vocaItems, ...uniqueYtItems];
    const totalCount = (vocaData.totalCount || vocaItems.length) + uniqueYtItems.length;

    return NextResponse.json(
      {
        items: mergedItems,
        totalCount: totalCount,
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
