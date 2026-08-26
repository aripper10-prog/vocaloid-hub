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

function normalizeRole(role: string = ''): string {
  const lower = role.trim().toLowerCase();
  if (VALID_ROLES.includes(lower)) return lower;
  
  if (lower.includes('lyric') || lower.includes('作詞') || lower.includes('詩')) return 'lyrics';
  if (lower.includes('vocal') || lower.includes('singer') || lower.includes('歌') || lower.includes('ボーカル') || lower.includes('vocaloid') || lower.includes('初音ミク') || lower.includes('重音テト')) return 'singer';
  if (lower.includes('mix') || lower.includes('master') || lower.includes('マスタリング') || lower.includes('整音')) return 'mix';
  if (lower.includes('illust') || lower.includes('art') || lower.includes('イラスト') || lower.includes('絵') || lower.includes('キャラクターデザイン') || lower.includes('jacket')) return 'illust';
  if (lower.includes('movie') || lower.includes('animat') || lower.includes('video') || lower.includes('動画') || lower.includes('映像') || lower.includes('MV') || lower.includes('mv')) return 'movie';
  if (lower.includes('tun') || lower.includes('調声') || lower.includes('vsqx')) return 'tuning';
  if (lower.includes('dance') || lower.includes('振付') || lower.includes('ダンス') || lower.includes('choreograph')) return 'dance';
  
  if (lower.includes('music') || lower.includes('composer') || lower.includes('arranger') || lower.includes('作編曲') || lower.includes('作曲') || lower.includes('編曲') || lower.includes('guitar')|| lower.includes('bass') || lower.includes('piano')) return 'music';

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
      '以下のYouTube動画のメタデータから、音楽制作に関わった【実際の個人・サークル名（クリエイター名）】と担当職域を余さず漏れなく抽出してください。\n\n' +
      '動画タイトル: "' + videoTitle + '"\n' +
      'チャンネル名: "' + channelTitle + '"\n' +
      '検索クエリ: "' + query + '"\n' +
      '概要欄:\n' + safeDescription + '\n\n' +
      '【重要ルール：誤認の禁止】\n' +
      '1. 動画タイトルや曲名（例: "Ido-Lumina" など）、企画名・チーム名（例: "Projectフィクション"）、ハッシュタグ（#VocaDuo2026など）を、そのまま作詞者や作曲者の名前（creatorName）に設定することは絶対に禁止です。\n' +
      '2. クリエイター名には、必ず概要欄に書かれている具体的な「個人のペンネーム・アーティスト名・サークル主宰者名」を入れてください。分からない場合はチャンネル名や推測できる名前にしてください。\n' +
      '3. 曲名やタイトルが作詞者や作曲者の欄に入ってしまっている出力を絶対に避けてください。\n\n' +
      '【タスク1：関連度判定 (isRelevant)】\n' +
      'この動画は、検索クエリ "' + query + '" に本当に関連する音楽作品と言えますか？無関係なら false、関連するなら true にしてください。\n\n' +
      '【タスク2：全クレジット抽出 (credits)】\n' +
      '使用可能な8種類のロール:\n' +
      '- "music" (作曲、編曲、作編曲、楽器)\n' +
      '- "lyrics" (作詞)\n' +
      '- "tuning" (調声)\n' +
      '- "singer" (ボーカル、歌唱、歌い手、ボカロイド名)\n' +
      '- "mix" (MIX、マスタリング)\n' +
      '- "illust" (イラスト、アートワーク)\n' +
      '- "movie" (動画、映像、MV)\n' +
      '- "dance" (振付、ダンス)\n\n' +
      '【出力形式の指定】\n' +
      '余計な挨拶やマークダウンは一切含めず、純粋なJSON形式のみを返してください。\n' +
      '{\n  "isRelevant": true,\n  "credits": [\n    {"role": "music", "creatorName": "〇〇"}\n  ]}';

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
      
      // バックエンド側でも、曲名やタイトルと酷似している文字列がクリエイター名になっていたら除外・修正する防衛コード
      const cleanVideoTitle = videoTitle.toLowerCase();
      const normalizedCredits = rawCredits
        .map((c: any) => {
          let name = (c.creatorName || '').trim();
          // もしクリエイター名に動画タイトルそのものや「Projectフィクション」などのチーム名、ハッシュタグが混ざっていたらチャンネル名にフォールバック
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
                  
                  // videoTitleを渡して、タイトル名がクリエイター名に入らないように防御する
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
