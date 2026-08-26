import { NextResponse } from 'next/server';

const VOCADB_ROLE_MAP: Record<string, string> = {
  music: 'Composer',
  lyrics: 'Lyricist',
  instrument: 'Instrumentalist',
  tuning: 'VoiceManipulator',
  singer: 'Vocalist',
  mix: 'Mixer',
  illust: 'Illustrator',
  movie: 'Animator',
  dance: 'Other',
  other: 'Other',
};

// 10系統の有効なロール
const VALID_ROLES = ['music', 'lyrics', 'instrument', 'tuning', 'singer', 'mix', 'illust', 'movie', 'dance', 'other'];

// 10系統への汎用的なロール文字列の正規化
function normalizeRole(role: string = ''): string {
  const lower = role.trim().toLowerCase();
  if (VALID_ROLES.includes(lower)) return lower;

  if (lower.includes('composer') || lower.includes('arranger') || lower.includes('music') || lower.includes('作曲') || lower.includes('編曲')) return 'music';
  if (lower.includes('lyric') || lower.includes('作詞') || lower.includes('詩')) return 'lyrics';
  if (lower.includes('instrument') || lower.includes('guitar') || lower.includes('bass') || lower.includes('drum') || lower.includes('演奏') || lower.includes('ギター') || lower.includes('ベース')) return 'instrument';
  if (lower.includes('vocal') || lower.includes('singer') || lower.includes('歌') || lower.includes('ボーカル')) return 'singer';
  if (lower.includes('tun') || lower.includes('調声')) return 'tuning';
  if (lower.includes('mix') || lower.includes('master')) return 'mix';
  if (lower.includes('illust') || lower.includes('art') || lower.includes('イラスト')) return 'illust';
  if (lower.includes('movie') || lower.includes('animat') || lower.includes('video') || lower.includes('動画')) return 'movie';
  if (lower.includes('dance') || lower.includes('振付') || lower.includes('ダンス')) return 'dance';

  return 'other';
}

// Gemini APIを使った10系統対応の高精度クレジット抽出 ＆ 職域判定
async function parseCreditsWithGemini(description: string = '', channelTitle: string = '', query: string = '', videoTitle: string = ''): Promise<Array<{ role: string; creatorName: string }>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !description.trim()) {
    return [
      { role: 'lyrics', creatorName: query.trim() || 'Unknown' },
      { role: 'music', creatorName: channelTitle },
    ];
  }

  try {
    const prompt = `
以下のYouTube動画の概要欄とチャンネル名から、音楽制作に関わったクリエイターのクレジットを抽出し、純粋なJSONの配列形式でのみ出力してください。

【対象の職域ロール（10種類のみ使用可能）】
- "music" (作曲/編曲/ボカロP)
- "lyrics" (作詞)
- "instrument" (演奏・楽器隊/ギター/ベース等)
- "tuning" (調声)
- "singer" (ボーカル/歌唱/歌い手)
- "mix" (MIX/マスタリング)
- "illust" (イラスト/絵)
- "movie" (動画/映像/MV)
- "dance" (振付/ダンス)
- "other" (その他/デザイン/企画等)

【入力情報】
動画タイトル: ${videoTitle}
チャンネル名: ${channelTitle}
検索クエリ(関係者である可能性高): ${query}
概要欄:
${description}

【厳格なルール】
- 動画タイトル、曲名、ハッシュタグ（#...）、企画名などをクリエイター名（creatorName）に設定することは絶対に禁止です。
- 歌っている人（ボーカル）は必ず "singer" にしてください。
- ボカロPや作曲者は必ず "music" にしてください。Ado等の歌い手が作曲者に混入してはなりません。

【出力形式の指定】
余計な挨拶やマークダウンのバッククォート（\`\`\`など）は一切含めず、純粋なJSON配列のみを返してください。例：
[
  {"role": "lyrics", "creatorName": "〇〇"},
  {"role": "music", "creatorName": "〇〇"}
]
`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '[]';
      const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item: any) => ({
          role: normalizeRole(item.role),
          creatorName: String(item.creatorName || '').trim(),
        })).filter(c => c.creatorName && !c.creatorName.startsWith('#'));
      }
    }
  } catch (e) {
    console.error('Gemini credit parsing error:', e);
  }

  return [
    { role: 'lyrics', creatorName: query.trim() || 'Unknown' },
    { role: 'music', creatorName: channelTitle },
  ];
}

// YouTubeの動画詳細（概要欄）をYouTube Data APIで直接取得するヘルパー
async function fetchYouTubeDetails(videoId: string, apiKey: string): Promise<{ description: string; title: string; channelTitle: string } | null> {
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`);
    if (res.ok) {
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        const snippet = data.items[0].snippet;
        return {
          description: snippet.description || '',
          title: snippet.title || '',
          channelTitle: snippet.channelTitle || '',
        };
      }
    }
  } catch (e) {
    console.error('Failed to fetch YouTube details for override:', e);
  }
  return null;
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
      } catch (e) {}
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

      if (role && role !== 'all' && VOCADB_ROLE_MAP[role]) {
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

    const ytApiKey = process.env.YOUTUBE_API_KEY;

    // --- 3. VocaDB取得曲に対して、必ずYouTube概要欄をGeminiで再スキャンし、メタデータを完全に上書き・浄化する ---
    const vocaItems = await Promise.all(
      (vocaData.items || []).map(async (item: any) => {
        const youtubePv = (item.pvs || []).find((p: any) => p.service === 'Youtube');
        const niconicoPv = (item.pvs || []).find((p: any) => p.service === 'NicoNicoDouga');
        const ytId = youtubePv?.pvId || item.youtubeId;

        let parsedCredits: any[] = [];

        // YouTube PVがありAPIキーがあれば、概要欄をGeminiに強制スキャンさせてVocaDBの汚染されたロールを上書きする
        if (ytId && ytApiKey) {
          const ytDetails = await fetchYouTubeDetails(ytId, ytApiKey);
          if (ytDetails) {
            const geminiResult = await parseCreditsWithGemini(ytDetails.description, ytDetails.channelTitle, query, ytDetails.title);
            if (geminiResult && geminiResult.length > 0) {
              parsedCredits = geminiResult;
            }
          }
        }

        // Geminiスキャンに失敗した場合のみVocaDBのメタデータにフォールバック
        if (parsedCredits.length === 0) {
          parsedCredits = (item.artists || []).map((art: any) => {
            const roles = art.roles || [];
            const artistType = (art.artistType || '').toLowerCase();
            let derivedRole = 'other';

            if (roles.includes('Lyricist')) derivedRole = 'lyrics';
            else if (roles.includes('Composer') || roles.includes('Arranger') || artistType === 'producer') derivedRole = 'music';
            else if (roles.includes('Vocalist') || artistType === 'vocaloid') derivedRole = 'singer';
            else if (roles.includes('Instrumentalist') || artistType === 'instrumentalist') derivedRole = 'instrument';
            else if (roles.includes('Mixer')) derivedRole = 'mix';
            else if (roles.includes('Illustrator') || artistType === 'illustrator') derivedRole = 'illust';
            else if (roles.includes('Animator') || artistType === 'animator') derivedRole = 'movie';
            else if (roles.includes('VoiceManipulator')) derivedRole = 'tuning';

            return {
              role: derivedRole,
              creatorName: art.name || art.artist?.name || 'Unknown',
            };
          });
        }

        return {
          ...item,
          title: item.name || item.title || 'Untitled',
          thumbUrl: item.thumbUrl || youtubePv?.thumbUrl || niconicoPv?.thumbUrl || '',
          youtubeId: ytId,
          niconicoId: niconicoPv?.pvId || item.niconicoId,
          artists: Array.isArray(item.artists) ? item.artists : [],
          pvs: Array.isArray(item.pvs) ? item.pvs : [],
          tags: Array.isArray(item.tags) ? item.tags : [],
          credits: parsedCredits,
          artistString: item.artistString || '',
        };
      })
    );

    // --- 4. 完全一致の安全なYouTube検索による新規未登録曲の発掘枠 ---
    let ytItems: any[] = [];
    const shouldFetchYT = Boolean(query.trim() && ytApiKey);

    if (shouldFetchYT) {
      try {
        const exactQuery = `"${query.trim()}"`; // 検索汚染を防ぐ完全一致
        const ytUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(
          exactQuery
        )}&maxResults=20&key=${ytApiKey}`;

        const ytRes = await fetch(ytUrl);
        const ytData = await ytRes.json();

        if (ytData.items && Array.isArray(ytData.items)) {
          const videoIds = ytData.items
            .map((item: any) => item.id?.videoId)
            .filter(Boolean)
            .join(',');

          if (videoIds) {
            const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}&key=${ytApiKey}`;
            const detailsRes = await fetch(detailsUrl);
            const detailsData = await detailsRes.json();

            if (detailsData.items && Array.isArray(detailsData.items)) {
              ytItems = await Promise.all(
                detailsData.items.map(async (item: any) => {
                  const channelTitle = item.snippet?.channelTitle || 'Unknown';
                  const description = item.snippet?.description || '';
                  const videoTitle = item.snippet?.title || '';
                  
                  const parsedCredits = await parseCreditsWithGemini(description, channelTitle, query, videoTitle);

                  return {
                    id: `yt_${item.id}`,
                    title: videoTitle || 'Untitled',
                    artists: parsedCredits.map((c: any) => ({
                      name: c.creatorName,
                      isSupport: false,
                      roles: [VOCADB_ROLE_MAP[c.role] || 'Composer'],
                      artist: { id: 0, name: c.creatorName, artistType: 'Producer' },
                    })),
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
                    credits: parsedCredits,
                    viewCount: item.statistics?.viewCount ? parseInt(item.statistics.viewCount, 10) : 0,
                    ratingScore: 0,
                    favoritedTimes: 0,
                    commentCount: 0,
                    listCount: 0,
                  };
                })
              );
            }
          }
        }
      } catch (err) {
        console.error('YouTube search error:', err);
      }
    }

    // --- 5. 重複排除とマージ ---
    let allItems = [...vocaItems, ...ytItems.filter((yt: any) => !vocaItems.some((v: any) => String(v.id) === String(yt.id)))];

    if (mode === 'creator' && query.trim()) {
      const targetQuery = query.trim().toLowerCase();

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

    const totalCount = allItems.length;

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
