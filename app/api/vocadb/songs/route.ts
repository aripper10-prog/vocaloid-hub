import { NextResponse } from 'next/server';

const VALID_ROLES = ['music', 'lyrics', 'instrument', 'tuning', 'singer', 'mix', 'illust', 'movie', 'dance', 'other'];

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
- ボカロPや作曲者は必ず "music" にしてください。歌い手やチャンネル名単体を誤って "music" にしてはなりません。

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query') || '';
    const mode = searchParams.get('mode') || 'song';
    const sort = searchParams.get('sort') || 'PublishDate';
    const maxResults = searchParams.get('maxResults') || '48';
    const start = searchParams.get('start') || '0';
    const role = searchParams.get('role');

    const ytApiKey = process.env.YOUTUBE_API_KEY;
    let items: any[] = [];

    // ==========================================
    // 👑 プライマリ・オンリーエンジン: YouTube完全一致検索 ＋ Gemini概要欄解析
    // (VocaDBのartistId等は一切無視し、常にYouTubeのライブ概要欄から10系統を構築する)
    // ==========================================
    if (query.trim() && ytApiKey) {
      try {
        const exactQuery = `"${query.trim()}"`; // 検索汚染を防ぐ完全一致
        const ytUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(
          exactQuery
        )}&maxResults=30&key=${ytApiKey}`;

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
              items = await Promise.all(
                detailsData.items.map(async (item: any) => {
                  const channelTitle = item.snippet?.channelTitle || 'Unknown';
                  const description = item.snippet?.description || '';
                  const videoTitle = item.snippet?.title || '';
                  
                  // Geminiによる概要欄10系統スキャン
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
        console.error('YouTube primary search error:', err);
      }
    }

    // --- 職域フィルターの適用 ---
    if (query.trim()) {
      const targetQuery = query.trim().toLowerCase();

      items = items.filter((item: any) => {
        const credits = item.credits || [];
        const artistString = (item.artistString || '').toLowerCase();
        const title = (item.title || '').toLowerCase();

        const nameMatched = credits.some((c: any) => (c.creatorName || '').toLowerCase().includes(targetQuery)) ||
                            artistString.includes(targetQuery) ||
                            title.includes(targetQuery);

        if (!nameMatched) return false;

        if (role && role !== 'all') {
          const hasExactRole = credits.some((c: any) => 
            c.role === role && (c.creatorName || '').toLowerCase().includes(targetQuery)
          );
          return hasExactRole;
        }

        return true;
      });
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
