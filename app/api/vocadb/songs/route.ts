import { NextResponse } from 'next/server';

// 外部APIのエンドポイント（安全な直定義）
const API_ENDPOINTS = {
  VOCADB_SONGS: 'https://vocadb.net/api/songs',
  VOCADB_ARTISTS: 'https://vocadb.net/api/artists',
  GEMINI_FLASH: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
  YOUTUBE_SEARCH: 'https://www.googleapis.com/youtube/v3/search',
  YOUTUBE_VIDEOS: 'https://www.googleapis.com/youtube/v3/videos',
};

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

function sanitizeDescription(description: string = ''): string {
  return description
    .replace(/```/g, '')
    .slice(0, 1000);
}

// クレジット抽出 ＆ 関連度判定
async function parseCreditsWithGemini(
  description: string = '', 
  channelTitle: string = '', 
  query: string = ''
): Promise<{ credits: any[]; isRelevant: boolean }> {
  const apiKey = process.env.GEMINI_API_KEY;
  const safeDescription = sanitizeDescription(description);

  if (!apiKey || !safeDescription.trim()) {
    return {
      credits: [
        { role: 'lyrics', creatorName: query.trim() || 'Unknown' },
        { role: 'music', creatorName: channelTitle },
      ],
      isRelevant: true,
    };
  }

  try {
    const prompt = 
      '以下の情報はYouTube動画のメタデータです。\n' +
      '検索クエリ: "' + query + '"\n' +
      'チャンネル名: "' + channelTitle + '"\n' +
      '概要欄:\n' + safeDescription + '\n\n' +
      '【タスク1：関連度判定 (isRelevant)】\n' +
      'この動画は、検索クエリ "' + query + '" に関連する音楽作品、あるいは関係するクリエイター（本人や関連アーティスト、個人制作など）の動画と言えますか？\n' +
      '無関係な有名アーティストの公式MV等でない限り、できるだけ true にしてください（完全に無関係な場合のみ false）。\n\n' +
      '【タスク2：クレジット抽出 (credits)】\n' +
      '音楽制作に関わったクリエイターのクレジットを抽出してください。\n' +
      '使用可能な8種類のロール: "music", "lyrics", "tuning", "singer", "mix", "illust", "movie", "dance"\n\n' +
      '【出力形式の指定】\n' +
      '余計な挨拶やマークダウンは一切含めず、純粋なJSON形式のみを返してください。\n' +
      '{\n  "isRelevant": true,\n  "credits": [\n    {"role": "lyrics", "creatorName": "〇〇"}\n  ]\n}';

    const res = await fetch(API_ENDPOINTS.GEMINI_FLASH + '?key=' + apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '{}';
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const cleanJson = jsonMatch ? jsonMatch[0] : text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      const parsed = JSON.parse(cleanJson);

      return {
        isRelevant: typeof parsed.isRelevant === 'boolean' ? parsed.isRelevant : true,
        credits: Array.isArray(parsed.credits) ? parsed.credits : [],
      };
    }
  } catch (e) {
    console.error('Gemini parse & relevance error:', e);
  }

  return {
    credits: [
      { role: 'lyrics', creatorName: query.trim() || 'Unknown' },
      { role: 'music', creatorName: channelTitle },
    ],
    isRelevant: true,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query'] || searchParams.get('q') || '';
    const mode = searchParams.get('mode') || 'song';
    const sort = searchParams.get('sort') || 'PublishDate';
    const maxResults = searchParams.get('maxResults') || '48';
    const start = searchParams.get('start') || '0';
    const parentVersionId = searchParams.get('parentVersionId');
    let artistId = searchParams.get('artistId');
    const role = searchParams.get('role');
    const songTypes = searchParams.get('songTypes') || 'Original,Cover,Remix,Other,MusicPV';

    // ★ 追加：タグ検索用のパラメータ（tagId, tag）をフロントエンドから正しく受け取る
    const tagId = searchParams.get('tagId');
    const tag = searchParams.get('tag');

    // --- 1. クリエイター検索モード時: アーティストIDの確実な自動解決 ---
    if (mode === 'creator' && query.trim() && !artistId) {
      try {
        const artistSearchUrl = API_ENDPOINTS.VOCADB_ARTISTS + '?query=' + encodeURIComponent(query.trim()) + '&nameMatchMode=Auto&maxResults=10&lang=Japanese';

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
        console.error('Artist ID resolution error:', e);
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

      if (query.trim()) {
        vocaParams.set('query', query.trim());
        vocaParams.set('nameMatchMode', 'Auto');
      }

      if (artistId && !isNaN(Number(artistId))) {
        vocaParams.append('artistId[]', artistId);
        vocaParams.set('artistParticipationStatus', 'Everything');
      }

      // ★ 追加：タグ検索のパラメータが指定されている場合、VocaDBのクエリに反映する
      if (tagId) {
        vocaParams.set('tagId', tagId);
      }
      if (tag) {
        vocaParams.set('tag', tag);
      }

      if (role && role !== 'all' && VOCADB_ROLE_MAP[role]) {
        vocaParams.append('artistRole', VOCADB_ROLE_MAP[role]);
      }

      if (parentVersionId && !isNaN(Number(parentVersionId))) {
        vocaParams.set('parentVersionId', parentVersionId);
        vocaParams.set('childTags', 'true');
      }

      const vocaUrl = API_ENDPOINTS.VOCADB_SONGS + '?' + vocaParams.toString();
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

    const vocaItems = (vocaData.items || []).map((item: any) => {
      const youtubePv = (item.pvs || []).find((p: any) => p.service === 'Youtube');
      const niconicoPv = (item.pvs || []).find((p: any) => p.service === 'NicoNicoDouga');

      const mappedCredits = (item.artists || []).map((art: any) => {
        const roles = art.roles || [];
        let derivedRole = 'music';
        if (roles.includes('Lyricist')) derivedRole = 'lyrics';
        else if (roles.includes('Composer')) derivedRole = 'music';
        else if (roles.includes('Vocalist')) derivedRole = 'singer';
        else if (roles.includes('Mixer')) derivedRole = 'mix';
        else if (roles.includes('Illustrator')) derivedRole = 'illust';
        else if (roles.includes('Animator')) derivedRole = 'movie';
        else if (roles.includes('VoiceManipulator')) derivedRole = 'tuning';

        return {
          role: derivedRole,
          creatorName: art.name || art.artist?.name || 'Unknown',
        };
      });

      return {
        ...item,
        title: item.name || item.title || 'Untitled',
        thumbUrl: item.thumbUrl || youtubePv?.thumbUrl || niconicoPv?.thumbUrl || '',
        youtubeId: youtubePv?.pvId || item.youtubeId,
        niconicoId: niconicoPv?.pvId || item.niconicoId,
        artists: Array.isArray(item.artists) ? item.artists : [],
        pvs: Array.isArray(item.pvs) ? item.pvs : [],
        tags: Array.isArray(item.tags) ? item.tags : [],
        credits: mappedCredits.length > 0 ? mappedCredits : (Array.isArray(item.credits) ? item.credits : []),
        artistString: item.artistString || '',
      };
    });

    // --- 3. YouTube検索の統合判定 ---
    let ytItems: any[] = [];
    const apiKey = process.env.YOUTUBE_API_KEY;
    const shouldFetchYT = Boolean(query.trim() && apiKey && (vocaItems.length === 0 || mode === 'creator'));

    if (shouldFetchYT) {
      try {
        const exactQuery = '"' + query.trim() + '"';
        const ytUrl = API_ENDPOINTS.YOUTUBE_SEARCH + '?part=snippet&type=video&q=' + encodeURIComponent(exactQuery) + '&maxResults=20&key=' + apiKey;

        const ytRes = await fetch(ytUrl);
        const ytData = await ytRes.json();

        if (ytData.items && Array.isArray(ytData.items)) {
          const videoIds = ytData.items
            .map((item: any) => item.id?.videoId)
            .filter(Boolean)
            .join(',');

          if (videoIds) {
            const detailsUrl = API_ENDPOINTS.YOUTUBE_VIDEOS + '?part=snippet,statistics&id=' + videoIds + '&key=' + apiKey;
            const detailsRes = await fetch(detailsUrl);
            const detailsData = await detailsRes.json();

            if (detailsData.items && Array.isArray(detailsData.items)) {
              const mappedYtItems = await Promise.all(
                detailsData.items.map(async (item: any) => {
                  const channelTitle = item.snippet?.channelTitle || 'Unknown';
                  const description = item.snippet?.description || '';
                  
                  const { credits: parsedCredits, isRelevant } = await parseCreditsWithGemini(description, channelTitle, query);

                  if (!isRelevant) {
                    return null;
                  }

                  return {
                    id: 'yt_' + item.id,
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
                        url: '[https://www.youtube.com/watch?v=](https://www.youtube.com/watch?v=)' + item.id,
                        pvId: item.id,
                      },
                    ],
                    tags: [],
                    albums: [],
                    lyrics: [],
                    webLinks: [],
                    youtubeId: item.id,
                    niconicoId: undefined,
                    credits: parsedCredits,
                    viewCount: item.statistics?.viewCount ? parseInt(item.statistics.viewCount, 10) : 0,
                    ratingScore: 0,
                    favoritedTimes: 0,
                    commentCount: 0,
                    listCount: 0,
                  };
                })
              );

              ytItems = mappedYtItems.filter(Boolean);
            }
          }
        }
      } catch (err) {
        console.error('YouTube search error:', err);
      }
    }

    // --- 4. 統合 ＆ 柔軟なフィルター ---
    let allItems = [...vocaItems, ...ytItems.filter((yt: any) => !vocaItems.some((v: any) => String(v.id) === String(yt.id)))];

    if (mode === 'creator' && query.trim()) {
      const targetQuery = query.trim().toLowerCase();

      allItems = allItems.filter((item: any) => {
        const isYouTubeItem = String(item.id).startsWith('yt_');
        if (isYouTubeItem) return true;

        const credits = item.credits || [];
        const artists = item.artists || [];
        const artistString = (item.artistString || '').toLowerCase();
        const title = (item.title || '').toLowerCase();

        const nameMatched = credits.some((c: any) => (c.creatorName || '').toLowerCase().includes(targetQuery)) ||
                            artists.some((a: any) => (a.name || '').toLowerCase().includes(targetQuery)) ||
                            artistString.includes(targetQuery) ||
                            title.includes(targetQuery);

        if (!nameMatched) return false;

        if (role && role !== 'all') {
          const hasExactRole = credits.some((c: any) => 
            c.role === role && (c.creatorName || '').toLowerCase().includes(targetQuery)
          ) || artists.some((a: any) => {
            const aName = (a.name || '').toLowerCase();
            const aRoles = a.roles || [];
            const matchesName = aName.includes(targetQuery);
            const targetDbRole = VOCADB_ROLE_MAP[role];
            const matchesRole = targetDbRole ? aRoles.includes(targetDbRole) : true;
            return matchesName && matchesRole;
          });

          return hasExactRole;
        }

        return true;
      });
    }

    const totalCount = vocaData.totalCount > 0 ? vocaData.totalCount : allItems.length;

    return NextResponse.json(
      {
        items: allItems,
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
