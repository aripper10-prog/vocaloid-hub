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

function shouldSearchYouTube(query: string): boolean {
  const q = query.trim().toLowerCase();
  const personalKeywords = ['作詞師ari', 'ari', 'alice and lemonade'];
  return personalKeywords.some((keyword) => q.includes(keyword));
}

function sanitizeDescription(description: string = ''): string {
  return description
    .replace(/```/g, '')
    .slice(0, 1000);
}

// 拡張版：Gemini APIを使った「クレジット抽出 ＆ 検索クエリとの関連度（ノイズ）判定」の同時実行
async function parseCreditsAndRelevanceWithGemini(
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
    const prompt = `
以下の情報はYouTube動画のメタデータです。
検索クエリ: "${query}"
チャンネル名: "${channelTitle}"
概要欄:
${safeDescription}

【タスク1：関連度判定 (isRelevant)】
この動画は、検索クエリ "${query}" に関連する音楽作品、あるいは関係するクリエイター（本人や関連アーティスト）の動画と言えますか？
全く関係のない動画（例: 検索ワードと無関係な有名アーティストの公式MVや、単なるレコメンド違いなど）である場合は false、関連している（または本人の作品・カバー・関連曲の可能性が高い）場合は true にしてください。

【タスク2：クレジット抽出 (credits)】
音楽制作に関わったクリエイターのクレジットを抽出してください。
使用可能な8種類のロール: "music", "lyrics", "tuning", "singer", "mix", "illust", "movie", "dance"

【出力形式の指定】
余計な挨拶やマークダウンのバッククォートは一切含めず、純粋なJSON形式のみを返してください。例：
{
  "isRelevant": true,
  "credits": [
    {"role": "lyrics", "creatorName": "作詞師ari"},
    {"role": "music", "creatorName": "〇〇"}
  ]
}
`;

    const res = await fetch(`[https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$](https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$){apiKey}`, {
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
    const query = searchParams.get('query') || searchParams.get('q') || '';
    const rawQuery = searchParams.get('query') || '';
    const mode = searchParams.get('mode') || 'song';
    const sort = searchParams.get('sort') || 'PublishDate';
    const maxResults = searchParams.get('maxResults') || '48';
    const start = searchParams.get('start') || '0';
    const parentVersionId = searchParams.get('parentVersionId');
    let artistId = searchParams.get('artistId');
    const role = searchParams.get('role');
    const songTypes = searchParams.get('songTypes') || 'Original,Cover,Remix,Other,MusicPV';

    // --- 1. クリエイター検索モード時: アーティストIDの確実な自動解決 ---
    if (mode === 'creator' && rawQuery.trim() && !artistId) {
      try {
        const artistSearchUrl = `[https://vocadb.net/api/artists?query=$](https://vocadb.net/api/artists?query=$){encodeURIComponent(
          rawQuery.trim()
        )}&nameMatchMode=Auto&maxResults=5&lang=Japanese`;

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
          if (items.length > 0) {
            const matchedArtist = items.find((a: any) => (a.artistType || '').toLowerCase() === 'producer') || items[0];
            artistId = String(matchedArtist.id);
          }
        }
      } catch (e) {
        console.error('Artist ID resolution error:', e);
      }
    }

    // --- 2. VocaDB楽曲検索の実行 ---
    let vocaData: any = { items: [], totalCount: 0 };
    try {
      if (!artistId && rawQuery.trim() && mode === 'creator') {
        try {
          const fallbackUrl = `[https://vocadb.net/api/artists?query=$](https://vocadb.net/api/artists?query=$){encodeURIComponent(
            rawQuery.trim()
          )}&nameMatchMode=Auto&maxResults=5&lang=Japanese`;

          const fRes = await fetch(fallbackUrl, {
            headers: {
              Accept: 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VocaHub/1.0',
            },
            cache: 'no-store',
          });

          if (fRes.ok) {
            const fData = await fRes.json();
            const fItems = fData.items || [];
            if (fItems.length > 0) {
              const matchedFallback = fItems.find((a: any) => (a.artistType || '').toLowerCase() === 'producer') || fItems[0];
              artistId = String(matchedFallback.id);
            }
          }
        } catch (fErr) {
          console.error('Fallback artist ID resolution error:', fErr);
        }
      }

      const vocaParams = new URLSearchParams({
        sort: sort,
        maxResults: maxResults,
        start: start,
        getTotalCount: 'true',
        fields: 'Artists,PVs,ThumbUrl,Tags',
        lang: 'Japanese',
        songTypes: songTypes,
      });

      if (artistId && !isNaN(Number(artistId))) {
        vocaParams.append('artistId[]', artistId);
        vocaParams.set('artistParticipationStatus', 'Everything');
      } else if (rawQuery.trim()) {
        vocaParams.set('query', rawQuery.trim());
        vocaParams.set('nameMatchMode', 'Partial');
      }

      if (role && role !== 'all' && VOCADB_ROLE_MAP[role]) {
        vocaParams.append('artistRole', VOCADB_ROLE_MAP[role]);
      }

      if (parentVersionId && !isNaN(Number(parentVersionId))) {
        vocaParams.set('parentVersionId', parentVersionId);
        vocaParams.set('childTags', 'true');
      }

      const vocaUrl = `[https://vocadb.net/api/songs?$](https://vocadb.net/api/songs?$){vocaParams.toString()}`;
      console.log('🌐 VocaDB API Request:', vocaUrl);

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
    const isPersonalQuery = shouldSearchYouTube(rawQuery);
    
    const shouldFetchYT = Boolean(
      rawQuery.trim() && 
      apiKey && 
      (vocaItems.length === 0 || isPersonalQuery || mode === 'creator')
    );

    if (shouldFetchYT) {
      try {
        const ytQuery = rawQuery.trim();
        const ytUrl = `[https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=$](https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=$){encodeURIComponent(
          ytQuery
        )}&maxResults=20&key=${apiKey}`;

        const ytRes = await fetch(ytUrl);
        const ytData = await ytRes.json();

        if (ytData.items && Array.isArray(ytData.items)) {
          const videoIds = ytData.items
            .map((item: any) => item.id?.videoId)
            .filter(Boolean)
            .join(',');

          if (videoIds) {
            const detailsUrl = `[https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=$](https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=$){videoIds}&key=${apiKey}`;
            const detailsRes = await fetch(detailsUrl);
            const detailsData = await detailsRes.json();

            if (detailsData.items && Array.isArray(detailsData.items)) {
              // Geminiによる「関連度判定 ＆ クレジット抽出」を各動画ごとに実行
              const mappedYtItems = await Promise.all(
                detailsData.items.map(async (item: any) => {
                  const channelTitle = item.snippet?.channelTitle || 'Unknown';
                  const description = item.snippet?.description || '';
                  
                  const { credits: parsedCredits, isRelevant } = await parseCreditsAndRelevanceWithGemini(description, channelTitle, rawQuery);

                  // 関連度が false（無関係なノイズ作品）と判定された場合は除外する
                  if (!isRelevant) {
                    return null;
                  }

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
                        url: `[https://www.youtube.com/watch?v=$](https://www.youtube.com/watch?v=$){item.id}`,
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

              // null（ノイズ判定で弾かれたもの）を除外
              ytItems = mappedYtItems.filter(Boolean);
            }
          }
        }
      } catch (err) {
        console.error('YouTube search error:', err);
      }
    }

    // --- 4. 統合 ＆ 職域・曲名フィルター ---
    let allItems = [...vocaItems, ...ytItems.filter((yt: any) => !vocaItems.some((v: any) => String(v.id) === String(yt.id)))];
    
    if (mode === 'creator' && rawQuery.trim() && !artistId) {
      const targetQuery = rawQuery.trim().toLowerCase();

      allItems = allItems.filter((item: any) => {
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

    const totalCount = typeof vocaData.totalCount === 'number' && vocaData.totalCount > 0 
      ? vocaData.totalCount 
      : allItems.length;

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
