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

// YouTube検索を発動させるキーワードの判定（必要に応じて調整可能）
function shouldSearchYouTube(query: string): boolean {
  const q = query.trim().toLowerCase();
  const personalKeywords = ['作詞師ari', 'ari', 'alice and lemonade'];
  return personalKeywords.some((keyword) => q.includes(keyword));
}

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
    let artistId = searchParams.get('artistId');

    console.log(`[VocaHub Debug] Search Query: "${query}", Mode: "${mode}", ArtistId: "${artistId}"`);

    let ytItems: any[] = [];
    const apiKey = process.env.YOUTUBE_API_KEY;
    console.log(`[VocaHub Debug] YouTube API Key exists: ${Boolean(apiKey)}`);

    // --- 1. VocaDB検索 ---
    let vocaData: any = { items: [], totalCount: 0 };
    try {
      const vocaParams = new URLSearchParams({
        sort: sort,
        maxResults: maxResults,
        start: start,
        getTotalCount: 'true',
        fields: 'Artists,PVs,ThumbUrl,Tags',
        lang: 'Japanese',
        songTypes: songTypes,
      });

      if (query.trim()) {
        vocaParams.set('query', query.trim());
        vocaParams.set('nameMatchMode', 'Auto');
      }

      if (artistId && !isNaN(Number(artistId))) {
        vocaParams.append('artistId[]', artistId);
        vocaParams.set('artistParticipationStatus', 'Everything');
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

    const vocaItems = (vocaData.items || []).map((item: any) => ({
      ...item,
      artists: Array.isArray(item.artists) ? item.artists : [],
      pvs: Array.isArray(item.pvs) ? item.pvs : [],
      tags: Array.isArray(item.tags) ? item.tags : [],
      artistString: item.artistString || '',
    }));

    // --- 2. YouTube検索の判定 ---
    const isPersonalQuery = shouldSearchYouTube(query);
    const shouldFetchYT = Boolean(query.trim() && apiKey && (vocaItems.length === 0 || isPersonalQuery));

    console.log(`[VocaHub Debug] shouldFetchYT: ${shouldFetchYT} (isPersonal: ${isPersonalQuery}, vocaCount: ${vocaItems.length})`);

    if (shouldFetchYT) {
      try {
        const exactQuery = `"${query.trim()}"`;
        const ytUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(
          exactQuery
        )}&maxResults=20&key=${apiKey}`;

        const ytRes = await fetch(ytUrl);
        const ytData = await ytRes.json();
        console.log(`[VocaHub Debug] YouTube API Response items count: ${ytData.items?.length || 0}`);

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
              ytItems = detailsData.items.map((item: any) => {
                const channelTitle = item.snippet?.channelTitle || 'Unknown';
                return {
                  id: `yt_${item.id}`,
                  title: item.snippet?.title || 'Untitled',
                  artists: [
                    {
                      name: channelTitle,
                      isSupport: false,
                      roles: ['Producer'],
                      artist: { id: 0, name: channelTitle, artistType: 'Producer' },
                    },
                  ],
                  artistString: channelTitle,
                  songType: 'Original',
                  thumbUrl: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || '',
                  publishDate: item.snippet?.publishedAt || new Date().toISOString(),
                  pvs: [
                    {
                      service: 'Youtube',
                      url: `https://www.youtube.com/watch?v=${item.id}`,
                      pvId: item.id,
                    },
                  ],
                  tags: [],
                  albums: [],
                  lyrics: [],
                  webLinks: [],
                  youtubeId: item.id,
                  niconicoId: undefined,
                  credits: [
                    {
                      role: 'Lyricist',
                      creatorName: query.trim(),
                    },
                  ],
                  viewCount: item.statistics?.viewCount ? parseInt(item.statistics.viewCount, 10) : 0,
                  ratingScore: 0,
                  favoritedTimes: 0,
                  commentCount: 0,
                  listCount: 0,
                };
              });
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
