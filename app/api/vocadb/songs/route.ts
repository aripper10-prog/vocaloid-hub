import { NextResponse } from 'next/server';

const API_ENDPOINTS = {
  VOCADB_SONGS: 'https://vocadb.net/api/songs',
  VOCADB_ARTISTS: 'https://vocadb.net/api/artists',
  GEMINI_FLASH: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
  YOUTUBE_SEARCH: 'https://www.googleapis.com/youtube/v3/search',
  YOUTUBE_VIDEOS: 'https://www.googleapis.com/youtube/v3/videos',
};

const VALID_ROLES = ['music', 'lyrics', 'tuning', 'singer', 'mix', 'illust', 'movie', 'dance'];

function sanitizeDescription(description: string = ''): string {
  return description.replace(/```/g, '').slice(0, 1500);
}

// 職域文字列の厳密な正規化（Vocaloid P と Vocal の混線を完全に防止）
function normalizeRole(role: string = ''): string {
  const lower = role.trim().toLowerCase();
  if (VALID_ROLES.includes(lower)) return lower;

  // 1. 先に「Vocaloid P / ボカロP / P」を判定して music に確実に割り当てる
  if (lower.includes('vocaloid p') || lower.includes('ボカロp') || lower.includes('p') && (lower.includes('music') || lower.includes('作曲'))) {
    return 'music';
  }

  // 2. 作詞 (lyrics)
  if (lower.includes('lyric') || lower.includes('作詞') || lower.includes('詩')) {
    return 'lyrics';
  }

  // 3. ボーカル・歌唱 (singer) ※「vocaloid p」等を除外した上で単体の「vocal」や「singer」を判定
  if ((lower.includes('vocal') && !lower.includes('p')) || lower.includes('singer') || lower.includes('歌') || lower.includes('ボーカル') || lower.includes('歌い手')) {
    return 'singer';
  }

  // 4. MIX / Mastering
  if (lower.includes('mix') || lower.includes('master') || lower.includes('マスタリング') || lower.includes('整音')) {
    return 'mix';
  }

  // 5. イラスト (illust)
  if (lower.includes('illust') || lower.includes('art') || lower.includes('イラスト') || lower.includes('絵') || lower.includes('キャラクターデザイン') || lower.includes('jacket')) {
    return 'illust';
  }

  // 6. 動画・映像 (movie)
  if (lower.includes('movie') || lower.includes('animat') || lower.includes('video') || lower.includes('動画') || lower.includes('映像') || lower.includes('mv') || lower.includes('pv')) {
    return 'movie';
  }

  // 7. 調声 (tuning)
  if (lower.includes('tun') || lower.includes('調声') || lower.includes('vsqx')) {
    return 'tuning';
  }

  // 8. 振付・ダンス (dance)
  if (lower.includes('dance') || lower.includes('振付') || lower.includes('ダンス') || lower.includes('choreograph')) {
    return 'dance';
  }

  // 9. その他 作曲・編曲・楽器隊 (music)
  if (lower.includes('music') || lower.includes('composer') || lower.includes('arranger') || lower.includes('作編曲') || lower.includes('作曲') || lower.includes('編曲') || lower.includes('guitar') || lower.includes('bass') || lower.includes('piano')) {
    return 'music';
  }

  return 'music';
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
      '以下のYouTube動画の概要欄から、音楽制作に関わった【実際の個人・サークル名（クリエイター名）】と担当職域を厳密に区別して抽出してください。\n\n' +
      '動画タイトル: "' + videoTitle + '"\n' +
      'チャンネル名: "' + channelTitle + '"\n' +
      '検索クエリ: "' + query + '"\n' +
      '概要欄:\n' + safeDescription + '\n\n' +
      '【最重要ルール：ロールの混線防止】\n' +
      '- "Vocaloid P" や "ボカロP"、"Composer"、"Music" として記載されている人物は、必ず "music" ロールにしてください。\n' +
      '- "Vocal" や "歌唱"、"ボーカル" として記載されている人物（例: ヴァネッサ等）は、必ず "singer" ロールにしてください。「music」にしてはいけません。\n' +
      '- "Lyrics" / "作詞" は "lyrics"、"Illust" / "イラスト" は "illust"、"Movie" / "動画" は "movie"、"Mix" は "mix" にしてください。\n' +
      '- 動画タイトル、曲名、企画名（例: "Ido-Lumina"、"Projectフィクション"、#VocaDuo2026 など）をクリエイター名（creatorName）に設定することは絶対に禁止です。\n\n' +
      '【出力形式の指定】\n' +
      '余計な挨拶やマークダウンは一切含めず、純粋なJSON形式のみを返してください。\n' +
      '{\n  "isRelevant": true,\n  "credits": [\n    {"role": "music", "creatorName": "ローカスト"},\n    {"role": "lyrics", "creatorName": "作詞師ari"},\n    {"role": "singer", "creatorName": "ヴァネッサ"},\n    {"role": "mix", "creatorName": "Katsuhide"},\n    {"role": "illust", "creatorName": "島村"},\n    {"role": "movie", "creatorName": "室長 綾"}\n  ]\n}';

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
          if (
            !name ||
            cleanVideoTitle.includes(name.toLowerCase()) ||
            name.toLowerCase().includes('projectフィクション') ||
            name.startsWith('#')
          ) {
            name = channelTitle;
          }
          return {
            role: normalizeRole(c.role),
            creatorName: name,
          };
        })
        .filter((c: any) => c.creatorName);

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

    let ytItems: any[] = [];
    const apiKey = process.env.YOUTUBE_API_KEY;
    const shouldFetchYT = Boolean(query.trim() && apiKey);

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
                  const videoTitle = item.snippet?.title || '';
                  
                  const { credits: parsedCredits, isRelevant } = await parseCreditsWithGemini(description, channelTitle, query, videoTitle);

                  if (!isRelevant) {
                    return null;
                  }

                  const mappedArtists = parsedCredits.map((c: any) => {
                    let vdbRole = 'Composer';
                    if (c.role === 'lyrics') vdbRole = 'Lyricist';
                    else if (c.role === 'singer') vdbRole = 'Vocalist';
                    else if (c.role === 'mix') vdbRole = 'Mixer';
                    else if (c.role === 'illust') vdbRole = 'Illustrator';
                    else if (c.role === 'movie') vdbRole = 'Animator';
                    else if (c.role === 'tuning') vdbRole = 'VoiceManipulator';

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
                    artists: mappedArtists.length > 0 ? mappedArtists : [
                      {
                        name: channelTitle,
                        isSupport: false,
                        roles: ['Composer'],
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
