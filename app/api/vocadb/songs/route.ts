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

// YouTube検索を発動させるキーワードの判定
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
    const parentVersionId = searchParams.get('parentVersionId');
    let artistId = searchParams.get('artistId');
    const role = searchParams.get('role');
    const songTypes = searchParams.get('songTypes') || 'Original,Cover,Remix,Other,MusicPV';

    // --- 1. クリエイター検索モード時: アーティストIDの自動解決 ---
    if (mode === 'creator' && query.trim() && !artistId) {
      try {
        const artistSearchUrl = `https://vocadb.net/api/artists?query=${encodeURIComponent(
          query.trim()
        )}&nameMatchMode=Auto&maxResults=10&lang=Japanese`;

        const aController = new AbortController();
        const aTimer = setTimeout(() => aController.abort(), 2500);
        const aRes = await fetch(artistSearchUrl, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VocaHub/1.0',
          },
          signal: aController.signal,
          cache: 'no-store',
        });
        clearTimeout(aTimer);

        if (aRes.ok) {
          const aData = await aRes.json();
          const items = aData.items || [];
          const target = query.trim().toLowerCase();

          const exactMatch = items.find(
            (a: any) =>
              (a.name || '').toLowerCase() === target ||
              (a.additionalNames || '')
                .toLowerCase()
                .split(',')
                .map((n: string) => n.trim())
                .includes(target)
          );

          if (exactMatch) {
            artistId = String(exactMatch.id);
          } else if (items.length > 0) {
            artistId = String(items[0].id);
          }
        }
      } catch (e) {
        // ID解決失敗時はquery検索へフォールバック
      }
    }

    // --- 2. VocaDB楽曲検索の実行 ---
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

      if (mode === 'song' && query.trim()) {
        vocaParams.set('query', query.trim());
        vocaParams.set('nameMatchMode', 'Auto');
      }

      if (artistId && !isNaN(Number(artistId))) {
        vocaParams.append('artistId[]', artistId);
        vocaParams.set('artistParticipationStatus', 'Everything');
      } else if (mode === 'creator' && query.trim()) {
        vocaParams.set('query', query.trim());
        vocaParams.set('nameMatchMode', 'Auto');
      }

      if (role && VOCADB_ROLE_MAP[role]) {
        vocaParams.append('artistRole', VOCADB_ROLE_MAP[role]);
      }

      if (parentVersionId && !isNaN(Number(parentVersionId))) {
        vocaParams.set('parentVersionId', parentVersionId);
        vocaParams.set('childTags', 'true');
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
      credits: Array.isArray(item.credits) ? item.credits : [],
      artistString: item.artistString || '',
    }));

    // --- 3. YouTube検索の統合判定 ---
    let ytItems: any[] = [];
    const apiKey = process.env.YOUTUBE_API_KEY;
    const isPersonalQuery = shouldSearchYouTube(query);
    const shouldFetchYT = Boolean(query.trim() && apiKey && (vocaItems.length === 0 || isPersonalQuery));

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

    // 重複を除外してマージ
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
