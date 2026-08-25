import { NextResponse } from 'next/server';

function sanitizeText(html: string): string {
  return html
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

const VOCALOID_KEYWORDS = [
  'vocaloid', 'ボカロ', '初音ミク', '鏡音リン', '鏡音レン', '巡音ルカ',
  'meiko', 'kaito', 'gumi', '重音テト', '可不', '花隈千冬', '小春六花',
  '結月ゆかり', 'ia', 'flower', 'v flower', '歌愛ユキ', 'ずんだもん',
  'synthesizerv', 'cevio', 'utau', 'ボカロオリジナル曲', 'オリジナル楽曲',
  'ボカロp', 'ボカコレ', '無色透名祭',
];

const NOISE_BLACKLIST = [
  '歌枠切り抜き', '歌枠', 'カラオケ音源', 'dam音源', 'joysound',
  '作業用bgm', '作業用', 'メドレー', 'メドレー動画', '叩いてみた',
  '弾いてみたメドレー', 'j-popカバー', 'アニソンカバー',
];

const ROLE_RULES = [
  { role: 'lyrics', regex: /(?:作詞|Lyric(?:s|ist)?|Words|作詞者|作詞担当|Text)/i },
  { role: 'music', regex: /(?:作[曲編]|Music|Compose(?:r)?|Track|Sound|Beat|作編曲|音楽|Vocaloid\s*P|ボカロP|Producer|Prod\.?|Arrang(?:e|er|ement)|BGM|編曲)/i },
  { role: 'tuning', regex: /(?:調声|調声師|Tuning|Manipulat(?:e|or)|ボカロ調声|VSQ)/i },
  { role: 'illust', regex: /(?:イラスト|絵|Illust(?:ration|rator)?|Art(?:work)?|絵師|画|Design(?:er)?|デザイン|原画|キャラデザ|キャラクターデザイン)/i },
  { role: 'movie', regex: /(?:動画|映像|Movie|Video|Animation|Animator|アニメーション|アニメ|動画師|MV|Visual|3D|MMD|CG)/i },
  { role: 'mix', regex: /(?:MIX|Mix(?:ing)?|Mastering|マスタリング|MIX師|Engineering|エンジニア|REC|録音|音響)/i },
  { role: 'singer', regex: /(?:Vocal(?:ist)?|Vo\.?|歌|歌唱|Singer|唄|歌い手|Vocaloid|ボーカル)/i },
  { role: 'dance', regex: /(?:振付|振付師|ダンス|Dance|Choreograph(?:y|er)?|踊り|踊り手|モーション)/i },
];

function cleanCreatorName(raw: string): string {
  return raw
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[[［【(（].*?(?:https?:\/\/|twitter|x\.com|@|pixiv).*?[\]］】)）]/gi, '')
    .replace(/[[［【(（][\s]*[\]］】)）]/g, '')
    .replace(/[@＠][a-zA-Z0-9_]+/g, '')
    .replace(/[\s ]+(?:様|さん|くん|ちゃん|氏)$/g, '')
    .replace(/(?:様|さん)$/g, '')
    .replace(/^[・\-\s:：】\]］)）＝=]+/, '')
    .replace(/[・\-\s:：【\[［(（＝=]+$/, '')
    .trim();
}

function parseCreditsFromText(rawText: string) {
  const cleanText = sanitizeText(rawText);
  const credits: { role: string; creatorName: string; categories: string }[] = [];
  const lines = cleanText.split(/\r?\n/);

  const addCredit = (role: string, namePart: string) => {
    const rawNames = namePart.split(/[\/／・,&＆+、|｜]|(?:\s+and\s+)|\s{2,}/);

    for (const rawName of rawNames) {
      const cleaned = cleanCreatorName(rawName);
      if (
        cleaned &&
        cleaned.length >= 1 &&
        cleaned.length <= 40 &&
        !credits.some((c) => c.role === role && c.creatorName.toLowerCase() === cleaned.toLowerCase())
      ) {
        credits.push({ role, creatorName: cleaned, categories: '' });
      }
    }
  };

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    if (line.startsWith('http://') || line.startsWith('https://')) continue;
    if (line.toLowerCase().includes('meet the team')) continue;

    let rolePart = '';
    let namePart = '';

    const bracketMatch = line.match(/^[[［【(（](.*?)[\]］】)）]\s*[:：=＝]?\s*(.+)$/);
    if (bracketMatch) {
      rolePart = bracketMatch[1].trim();
      namePart = bracketMatch[2].trim();
    } else {
      const colonIndex = line.search(/[:：=＝]/);
      if (colonIndex !== -1) {
        rolePart = line.slice(0, colonIndex).trim();
        namePart = line.slice(colonIndex + 1).trim();
      }
    }

    if (rolePart && namePart) {
      const subRoles = rolePart.split(/[\/／・,&＆+、|｜\s]+/);
      let matchedAny = false;

      for (const token of subRoles) {
        for (const rule of ROLE_RULES) {
          if (rule.regex.test(token)) {
            addCredit(rule.role, namePart);
            matchedAny = true;
          }
        }
      }

      if (!matchedAny) {
        for (const rule of ROLE_RULES) {
          if (rule.regex.test(rolePart)) {
            addCredit(rule.role, namePart);
          }
        }
      }
    }
  }

  return credits;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || '';
  const mode = searchParams.get('mode') || 'song';
  const limit = searchParams.get('limit') || '48';
  const offset = searchParams.get('offset') || '0';

  if (!query.trim()) {
    return NextResponse.json({ items: [], totalCount: 0 });
  }

  try {
    const nicoParams = new URLSearchParams({
      q: query.trim(),
      _context: 'vocahub_app',
      // 曲名検索時はタイトルのみを対象（文章中の拾い食い停止）
      targets: mode === 'song' ? 'title' : 'title,description,tags',
      fields: 'contentId,title,description,tags,viewCounter,startTime,thumbnailUrl',
      _sort: '-startTime',
      _limit: limit,
      _offset: offset,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const nicoRes = await fetch(
      `https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?${nicoParams.toString()}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VocaHub/1.0',
        },
        signal: controller.signal,
        cache: 'no-store',
      }
    );

    clearTimeout(timeoutId);

    if (!nicoRes.ok) {
      return NextResponse.json({ items: [], totalCount: 0 });
    }

    const json = await nicoRes.json();
    const rawItems = json.data || [];

    let filteredItems = rawItems.filter((item: any) => {
      const tagsStr = (item.tags || '').toLowerCase();
      const titleStr = (item.title || '').toLowerCase();
      const descStr = (item.description || '').toLowerCase();
      const fullText = `${item.title}\n${item.description || ''}`;

      if (NOISE_BLACKLIST.some((kw) => titleStr.includes(kw) || tagsStr.includes(kw))) {
        return false;
      }

      const credits = parseCreditsFromText(fullText);

      const hasVocaloidContext = VOCALOID_KEYWORDS.some(
        (kw) => tagsStr.includes(kw) || titleStr.includes(kw) || descStr.includes(kw)
      );

      const isCover =
        tagsStr.includes('歌ってみた') ||
        titleStr.includes('歌ってみた') ||
        tagsStr.includes('cover') ||
        titleStr.includes('cover');

      if (isCover) {
        const hasOriginalReference = /(?:本家|原曲|sm\d+|so\d+|Music\s*[:：]|作[曲編]\s*[:：])/i.test(fullText);
        const hasTeamCredits = credits.some((c) =>
          ['mix', 'illust', 'movie', 'music', 'dance', 'lyrics'].includes(c.role)
        );

        if (!hasVocaloidContext && !hasOriginalReference && !hasTeamCredits) {
          return false;
        }
      }

      // クリエイター検索時は、クレジット行の中に担当者として名前が存在することを必須化
      if (mode === 'creator') {
        const target = query.trim().toLowerCase();
        return credits.some((c) => c.creatorName.toLowerCase() === target);
      }

      return hasVocaloidContext || credits.length > 0;
    });

    const items = filteredItems.map((item: any) => {
      const fullText = `${item.title}\n${item.description || ''}`;
      const credits = parseCreditsFromText(fullText);

      return {
        id: item.contentId,
        title: item.title,
        artistString:
          credits.map((c) => c.creatorName).join(', ') || 'ニコニコ動画',
        songType: 'LiveWeb',
        publishDate: item.startTime,
        thumbUrl: item.thumbnailUrl,
        niconicoId: item.contentId,
        credits: credits,
        isLive: true,
      };
    });

    return NextResponse.json({
      items,
      totalCount: mode === 'creator' ? items.length : json.meta?.totalCount || items.length,
    });
  } catch (err) {
    return NextResponse.json({ items: [], totalCount: 0 });
  }
}