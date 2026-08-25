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
  const credits: { role: string; creatorName: string }[] = [];
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
        credits.push({ role, creatorName: cleaned });
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

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const id = params.id;

    if (!id) {
      return NextResponse.json({ error: 'ID is missing' }, { status: 400 });
    }

    if (id.startsWith('sm') || id.startsWith('so')) {
      const nicoRes = await fetch(`https://ext.nicovideo.jp/api/getthumbinfo/${id}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VocaHub/1.0',
        },
        cache: 'no-store',
      });

      if (nicoRes.ok) {
        const xml = await nicoRes.text();
        const titleMatch = xml.match(/<title>(.*?)<\/title>/);
        const descMatch = xml.match(/<description>([\s\S]*?)<\/description>/);
        const thumbMatch = xml.match(/<thumbnail_url>(.*?)<\/thumbnail_url>/);
        const dateMatch = xml.match(/<first_retrieve>(.*?)<\/first_retrieve>/);

        const title = titleMatch ? titleMatch[1] : id;
        const fullText = `${title}\n${descMatch ? descMatch[1] : ''}`;
        const parsedCredits = parseCreditsFromText(fullText);

        const artists = parsedCredits.map((c) => ({
          name: c.creatorName,
          roles: c.role,
          categories: c.role === 'singer' ? 'Vocalist' : (c.role === 'music' ? 'Producer' : 'Other'),
          artist: {
            id: undefined,
            name: c.creatorName,
            artistType: c.role === 'singer' ? 'Human' : 'Unknown',
          },
        }));

        return NextResponse.json({
          id: id,
          name: title,
          artistString: parsedCredits.map((c) => c.creatorName).join(', ') || 'ニコニコ動画',
          songType: 'LiveWeb',
          publishDate: dateMatch ? dateMatch[1] : undefined,
          thumbUrl: thumbMatch ? thumbMatch[1] : '',
          pvs: [{ service: 'NicoNicoDouga', pvId: id, disabled: false }],
          artists: artists,
          originalVersion: null,
        });
      }
    }

    const res = await fetch(
      `https://vocadb.net/api/songs/${id}?fields=Artists,PVs,ThumbUrl,Names,Tags&lang=Japanese`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VocaHub/1.0',
        },
        cache: 'no-store',
      }
    );

    if (!res.ok) {
      return NextResponse.json({ error: 'Song not found' }, { status: res.status });
    }

    const songData = await res.json();
    let originalVersion = null;
    if (songData.originalVersionId) {
      try {
        const origRes = await fetch(
          `https://vocadb.net/api/songs/${songData.originalVersionId}?fields=Artists,PVs,ThumbUrl&lang=Japanese`,
          {
            headers: {
              Accept: 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VocaHub/1.0',
            },
            cache: 'no-store',
          }
        );
        if (origRes.ok) {
          originalVersion = await origRes.json();
        }
      } catch (err) {
        console.error('Failed to fetch original version:', err);
      }
    }

    return NextResponse.json({
      ...songData,
      originalVersion,
    });
  } catch (error) {
    console.error('[VocaDB Song Detail Proxy Exception]:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}