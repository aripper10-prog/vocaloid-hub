import { NextResponse } from 'next/server';

const API_ENDPOINTS = {
  VOCADB_SONGS: 'https://vocadb.net/api/songs',
  VOCADB_ARTISTS: 'https://vocadb.net/api/artists',
  GEMINI_FLASH: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
  YOUTUBE_SEARCH: 'https://www.googleapis.com/youtube/v3/search',
  YOUTUBE_VIDEOS: 'https://www.googleapis.com/youtube/v3/videos',
};

const VALID_ROLES = ['music', 'lyrics', 'instrument', 'tuning', 'singer', 'mix', 'illust', 'movie', 'dance', 'other'];

function sanitizeDescription(description: string = ''): string {
  return description.replace(/```/g, '').slice(0, 1500);
}

// 10系統への汎用的な正規化・振り分け関数（個別名ハードコードなし）
function normalizeRole(role: string = ''): string {
  const lowerRole = role.trim().toLowerCase();

  if (VALID_ROLES.includes(lowerRole)) return lowerRole;

  if (
    lowerRole.includes('vocal') || 
    lowerRole.includes('singer') || 
    lowerRole.includes('歌唱') || 
    lowerRole.includes('ボーカル') || 
    lowerRole.includes('歌い手') ||
    lowerRole.includes('vocaloid') ||
    lowerRole.includes('vo.')
  ) {
    if (!lowerRole.includes('p') && !lowerRole.includes('producer')) {
      return 'singer';
    }
  }

  if (
    lowerRole.includes('instrument') || 
    lowerRole.includes('guitar') || 
    lowerRole.includes('bass') || 
    lowerRole.includes('drum') || 
    lowerRole.includes('piano') || 
    lowerRole.includes('keyboard') || 
    lowerRole.includes('strings') || 
    lowerRole.includes('演奏') || 
    lowerRole.includes('ギター') || 
    lowerRole.includes('ベース') || 
    lowerRole.includes('ドラム') ||
    lowerRole.includes('ピアノ') ||
    lowerRole.includes('gt.') ||
    lowerRole.includes('ba.') ||
    lowerRole.includes('dr.')
  ) {
    return 'instrument';
  }

  if (lowerRole.includes('lyric') || lowerRole.includes('作詞') || lowerRole.includes('詩') || lowerRole.includes('詞')) {
    return 'lyrics';
  }
  if (lowerRole.includes('tun') || lowerRole.includes('調声') || lowerRole.includes('vsqx') || lowerRole.includes('ust')) {
    return 'tuning';
  }
  if (lowerRole.includes('mix') || lowerRole.includes('master') || lowerRole.includes('マスタリング') || lowerRole.includes('整音')) {
    return 'mix';
  }
  if (lowerRole.includes('illust') || lowerRole.includes('art') || lowerRole.includes('イラスト') || lowerRole.includes('絵') || lowerRole.includes('キャラクターデザイン') || lowerRole.includes('jacket') || lowerRole.includes('art work')) {
    return 'illust';
  }
  if (lowerRole.includes('movie') || lowerRole.includes('animat') || lowerRole.includes('video') || lowerRole.includes('動画') || lowerRole.includes('映像') || lowerRole.includes('mv') || lowerRole.includes('pv')) {
    return 'movie';
  }
  if (lowerRole.includes('dance') || lowerRole.includes('振付') || lowerRole.includes('ダンス') || lowerRole.includes('choreograph')) {
    return 'dance';
  }
  if (
    lowerRole.includes('music') || 
    lowerRole.includes('composer') || 
    lowerRole.includes('arranger') || 
    lowerRole.includes('作編曲') || 
    lowerRole.includes('作曲') || 
    lowerRole.includes('編曲') ||
    lowerRole.includes('producer') ||
    lowerRole.includes('ボカロp') ||
    lowerRole.includes('music producer') ||
    lowerRole === 'p'
  ) {
    return 'music';
  }

  return 'other';
}

async function parseCreditsWithGemini(
  description: string = '', 
  channelTitle: string = '', 
  query: string = '',
  videoTitle: string = ''
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
      'あなたは極めて厳格な音楽メタデータ抽出パーサーです。以下のYouTube動画の概要欄から、音楽制作に関わった【実際のクリエイター（個人・サークル名）】のみを抽出してください。\n\n' +
      '動画タイトル: "' + videoTitle + '"\n' +
      'チャンネル名: "' + channelTitle + '"\n' +
      '検索クエリ: "' + query + '"\n' +
      '概要欄:\n' + safeDescription + '\n\n' +
      '【最重要の抽出・判定ルール】\n' +
      '1. 【人名の物理的特定】必ず「作詞：」「作曲：」「Music:」「Vocal:」「Guitar:」などの役割ラベルの【直後（または同一行）に書かれている具体的な個人名・サークル名】だけを抽出してください。役割ラベルの近くに書かれていない単語（曲名や企画名）を勝手に作詞者や作曲者として捏造してはなりません。\n' +
      '2. 【除外すべき対象】動画タイトル、曲名、アルバム名、イベント名、ハッシュタグ（#で始まるもの）、企画名・チーム名（例: "Ido-Lumina"、"Projectフィクション"、"VocaDuo" など）は、どのような場合でも絶対にクリエイター名（creatorName）に含めてはなりません。これらは曲のタイトルやイベント名であり、人名ではありません。\n' +
      '3. 【ロールの完全分離】\n' +
      '   - 歌っている人、ボーカル、歌唱、Vocalとして記載されている人物は、100% "singer" ロールにしてください。「music」や「lyrics」にしては絶対いけません。\n' +
      '   - ボカロP、Composer、作編曲として記載されている人物は "music" にしてください。\n' +
      '   - 作詞者として記載されている人物は "lyrics" にしてください。\n\n' +
      '【使用可能な10種類のロール】\n' +
      '- "music" (作曲, 編曲, ボカロP, Composer, Arranger)\n' +
      '- "lyrics" (作詞, Lyricist)\n' +
      '- "instrument" (ギター, ベース, ドラム等の演奏者, 楽器隊)\n' +
      '- "singer" (ボーカル, 歌唱, 歌い手, Vocal)\n' +
      '- "tuning" (調声)\n' +
      '- "mix" (MIX, マスタリング)\n' +
      '- "illust" (イラスト, アートワーク)\n' +
      '- "movie" (動画, 映像, MV)\n' +
      '- "dance" (振付, ダンス)\n' +
      '- "other" (その他：デザイン, ロゴ, 企画, その他スタッフ等)\n\n' +
      '【出力形式の指定】\n' +
      '余計な挨拶やマークダウンは一切含めず、純粋なJSON形式のみを返してください。\n' +
      '{\n  "isRelevant": true,\n  "credits": [\n    {"role": "music", "creatorName": "〇〇"},\n    {"role": "singer", "creatorName": "〇〇"}\n  ]}';

    const res = await fetch(API_ENDPOINTS.GEMINI_FLASH + '?key=' + apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "json"
        }
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '{}';
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const cleanJson = jsonMatch ? jsonMatch[0] : text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      const parsed = JSON.parse(cleanJson);

      const rawCredits = Array.isArray(parsed.credits) ? parsed.credits : [];
      const cleanVideoTitle = videoTitle.toLowerCase();
      
      const normalizedCredits = rawCredits
        .map((c: any) => {
          let name = (c.creatorName || '').trim();
          let role = normalizeRole(c.role);

          if (
            !name ||
            cleanVideoTitle.includes(name.toLowerCase()) ||
            name.startsWith('#') ||
            name.length > 50
          ) {
            return null;
          }

          return {
            role: role,
            creatorName: name,
          };
        })
        .filter(Boolean);

      const uniqueCredits = Array.from(
        new Map(normalizedCredits.map((c: any) => [`${c.role}_${c.creatorName}`, c])).values()
      );

      return {
        isRelevant: typeof parsed.isRelevant === 'boolean' ? parsed.isRelevant : true,
        credits: uniqueCredits.length > 0 ? uniqueCredits : [
          { role: 'lyrics', creatorName: query.trim() || 'Unknown' },
          { role: 'music', creatorName: channelTitle },
        ],
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

// YouTubeの動画詳細（概要欄）をYouTube Data APIで直接取得するヘルパー
async function fetchYouTubeDetails(videoId: string, apiKey: string): Promise<{ description: string; title: string; channelTitle: string } | null> {
  try {
    const res = await fetch(`${API_ENDPOINTS.YOUTUBE_VIDEOS}?part=snippet&id=${videoId}&key=${apiKey}`);
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
    const query = searchParams.get('query') || searchParams.get('q') || '';
    const mode = searchParams.get('mode') || 'song';
    const sort = searchParams.get('sort') || 'PublishDate';
    const maxResults = searchParams.get('maxResults') || '48';
    const start = searchParams.get('start') || '0';
    const parentVersionId = searchParams.get('parentVersionId');
    let artistId = searchParams.get('artistId');
    const songTypes = searchParams.get('songTypes') || 'Original,Cover,Remix,Other,MusicPV';

    const tagId = searchParams.get('tagId');
    const tag = searchParams.get('tag');

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

      if (query.trim() && mode === 'song') {
        vocaParams.set('query', query.trim());
        vocaParams.set('nameMatchMode', 'Auto');
      }

      if (artistId && !isNaN(Number(artistId))) {
        vocaParams.append('artistId[]', artistId);
        vocaParams.set('artistParticipationStatus', 'Everything');
      }

      if (tagId) vocaParams.set('tagId', tagId);
      if (tag) vocaParams.set('tag', tag);

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

    const ytApiKey = process.env.YOUTUBE_API_KEY;

    // ★ 【最重要変更】VocaDB由来の曲であっても、YouTube PVがあれば概要欄をGeminiで絶対優先スキャンして上書きする
    const vocaItems = await Promise.all(
      (vocaData.items || []).map(async (item: any) => {
        const youtubePv = (item.pvs || []).find((p: any) => p.service === 'Youtube');
        const niconicoPv = (item.pvs || []).find((p: any) => p.service === 'NicoNicoDouga');
        const ytId = youtubePv?.pvId || item.youtubeId;

        let parsedCredits: any[] = [];

        // もしYouTube IDがあり、YouTube APIキーがあれば、概要欄をGeminiにスキャンさせる
        if (ytId && ytApiKey) {
          const ytDetails = await fetchYouTubeDetails(ytId, ytApiKey);
          if (ytDetails) {
            const geminiResult = await parseCreditsWithGemini(ytDetails.description, ytDetails.channelTitle, query, ytDetails.title);
            if (geminiResult && geminiResult.credits && geminiResult.credits.length > 0) {
              parsedCredits = geminiResult.credits;
            }
          }
        }

        // Geminiスキャンできなかった（またはYouTubeがない）場合のみVocaDBのメタデータにフォールバック
        if (parsedCredits.length === 0) {
          parsedCredits = (item.artists || []).map((art: any) => {
            const rawRoles = art.roles || art.effectiveRoles || [];
            const roles = Array.isArray(rawRoles) ? rawRoles.map((r: any) => String(r).toLowerCase()) : [];
            const artistType = (art.artistType || art.artist?.artistType || '').toLowerCase();
            
            let derivedRole = 'other';
            const isLyricist = roles.includes('lyricist') || roles.includes('作詞');
            const isComposer = roles.includes('composer') || roles.includes('arranger') || roles.includes('作曲') || roles.includes('編曲');
            const isVocalist = roles.includes('vocalist') || roles.includes('vocal') || roles.includes('singer') || roles.includes('ボーカル') || roles.includes('歌唱') || artistType === 'vocaloid' || artistType === 'vocalist' || artistType === 'utau';
            const isInstrumentalist = roles.includes('instrumentalist') || roles.includes('guitarist') || roles.includes('bassist') || roles.includes('drummer') || artistType === 'instrumentalist';
            const isMixer = roles.includes('mixer') || roles.includes('mastering') || roles.includes('mix');
            const isIllustrator = roles.includes('illustrator') || roles.includes('art') || artistType === 'illustrator';
            const isAnimator = roles.includes('animator') || roles.includes('vj') || artistType === 'animator';
            const isTuning = roles.includes('voicemanipulator') || roles.includes('tuning') || roles.includes('調声');

            if (isComposer || artistType === 'producer' || artistType === 'circle') derivedRole = 'music';
            else if (isLyricist && !isComposer) derivedRole = 'lyrics';
            else if (isVocalist || artistType === 'vocaloid' || artistType === 'utau') derivedRole = 'singer';
            else if (isInstrumentalist) derivedRole = 'instrument';
            else if (isIllustrator) derivedRole = 'illust';
            else if (isAnimator) derivedRole = 'movie';
            else if (isMixer) derivedRole = 'mix';
            else if (isTuning) derivedRole = 'tuning';

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

    let ytItems: any[] = [];
    const shouldFetchYT = Boolean(query.trim() && ytApiKey);

    if (shouldFetchYT) {
      try {
        const exactQuery = '"' + query.trim() + '"';
        const ytUrl = API_ENDPOINTS.YOUTUBE_SEARCH + '?part=snippet&type=video&q=' + encodeURIComponent(exactQuery) + '&maxResults=20&key=' + ytApiKey;

        const ytRes = await fetch(ytUrl);
        const ytData = await ytRes.json();

        if (ytData.items && Array.isArray(ytData.items)) {
          const videoIds = ytData.items
            .map((item: any) => item.id?.videoId)
            .filter(Boolean)
            .join(',');

          if (videoIds) {
            const detailsUrl = API_ENDPOINTS.YOUTUBE_VIDEOS + '?part=snippet,statistics&id=' + videoIds + '&key=' + ytApiKey;
            const detailsRes = await fetch(detailsUrl);
            const detailsData = await detailsRes.json();

            if (detailsData.items && Array.isArray(detailsData.items)) {
              const mappedYtItems = await Promise.all(
                detailsData.items.map(async (item: any) => {
                  const channelTitle = item.snippet?.channelTitle || 'Unknown';
                  const description = item.snippet?.description || '';
                  const videoTitle = item.snippet?.title || '';
                  
                  const { credits: parsedCredits, isRelevant } = await parseCreditsWithGemini(description, channelTitle, query, videoTitle);

                  if (!isRelevant) {
                    return null;
                  }

                  const mappedArtists = parsedCredits.map((c: any) => {
                    let vdbRole = 'Composer';
                    if (c.role === 'lyrics') vdbRole = 'Lyricist';
                    else if (c.role === 'singer') vdbRole = 'Vocalist';
                    else if (c.role === 'instrument') vdbRole = 'Instrumentalist';
                    else if (c.role === 'mix') vdbRole = 'Mixer';
                    else if (c.role === 'illust') vdbRole = 'Illustrator';
                    else if (c.role === 'movie') vdbRole = 'Animator';
                    else if (c.role === 'tuning') vdbRole = 'VoiceManipulator';
                    else if (c.role === 'other') vdbRole = 'Other';

                    return {
                      name: c.creatorName,
                      isSupport: false,
                      roles: [vdbRole],
                      artist: { id: 0, name: c.creatorName, artistType: 'Producer' },
                    };
                  });

                  return {
                    id: 'yt_' + item.id,
                    title: videoTitle || 'Untitled',
                    artists: mappedArtists,
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

    const mergedMap = new Map();

    vocaItems.forEach((item: any) => {
      mergedMap.set(String(item.id), item);
    });

    ytItems.forEach((ytItem: any) => {
      const foundDuplicate = Array.from(mergedMap.values()).some((v: any) => {
        const vYtId = v.youtubeId || (v.pvs || []).find((p: any) => p.service === 'Youtube')?.pvId;
        return vYtId && vYtId === ytItem.youtubeId;
      });

      if (!foundDuplicate) {
        mergedMap.set(ytItem.id, ytItem);
      }
    });

    const allItems = Array.from(mergedMap.values());
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
