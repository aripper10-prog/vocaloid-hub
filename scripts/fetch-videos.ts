import { createClient } from '@supabase/supabase-js';

// URL と KEY の正規化
let rawUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
let rawKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

rawUrl = rawUrl.replace(/^["']|["']$/g, '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
rawKey = rawKey.replace(/^["']|["']$/g, '');

if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
  rawUrl = `https://${rawUrl}`;
}

console.log(`[Config] Connecting to Supabase at: ${rawUrl}`);

if (!rawUrl || !rawKey) {
  console.error('[Error] Supabase URLまたはAPIキーが設定されていません。');
  process.exit(1);
}

const supabase = createClient(rawUrl, rawKey);

interface RawVideo {
  platform: 'youtube' | 'niconico';
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  publishedAt: string;
}

// ニコニコ動画 スナップショット検索API v2
async function fetchNiconicoVideos(): Promise<RawVideo[]> {
  try {
    const url = new URL('https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search');
    url.searchParams.append('q', 'VOCALOID OR ボカロ');
    url.searchParams.append('targets', 'tagsExact');
    url.searchParams.append('fields', 'contentId,title,description,thumbnailUrl,startTime');
    url.searchParams.append('_sort', '-startTime');
    url.searchParams.append('_limit', '25');
    url.searchParams.append('_context', 'VocaHubApp');

    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'VocaHub/1.0 (Contact: local-dev)',
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = await res.json();
    if (!data.data) return [];

    return data.data.map((item: any) => ({
      platform: 'niconico' as const,
      videoId: item.contentId,
      title: item.title,
      description: item.description || '',
      thumbnailUrl: item.thumbnailUrl,
      publishedAt: item.startTime,
    }));
  } catch (error) {
    console.error('[Niconico] Fetch error:', error);
    return [];
  }
}

// 名前のクレンジング（カッコ残骸、役職混入、敬称、記号を完全除去）
function cleanName(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, ' ')                  // HTMLタグ除去
    .replace(/https?:\/\/[^\s]+/gi, '')        // 完全なURL除去
    .replace(/https?:?/gi, '')                 // 残骸の "https" や "http:" 除去
    .replace(/[@＠][a-zA-Z0-9_-]+/g, '')       // @ID 除去
    // 役職名（日本語・英語）のプレフィックスを除去
    .replace(/^(?:作?詞|作?曲|作編曲|編曲|動画|映像|イラスト|絵|MIX|Mixing|Mastering|マスタリング|調声|調律|Vocal|Vo|Lyrics|Music|Sound|Movie|Illust|Track)[:：\s―-]+/i, '')
    // カッコとその中身を除去、または開きカッコ・閉じカッコ単体を除去
    .replace(/[（(].*?[）)]/g, '')
    .replace(/[（()）「」『』【】\[\]]/g, '')
    // 敬称（様、さん、氏等）を除去
    .replace(/[様さん君くんちゃん氏]+(?=[\s＋+&＆]|$)/g, '')
    // 前後の不要な記号をトリム
    .replace(/^[・\-\s―／/：:|+,、]+|[・\-\s―／/：:|+,、]+$/g, '')
    .trim();
}

// クレジット正規表現解析
function parseCredits(description: string, title: string) {
  const credits: { name: string; role: string }[] = [];

  const normalizedDesc = description
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&amp;/g, '&');

  const patterns = [
    { role: 'music', regex: /(?:music|作?曲|作編曲|sound|track)[\s:：/／―\-]+([^\n\r,、/／]+)/i },
    { role: 'lyrics', regex: /(?:lyrics|作?詞|words)[\s:：/／―\-]+([^\n\r,、/／]+)/i },
    { role: 'tuning', regex: /(?:tuning|調声|調律)[\s:：/／―\-]+([^\n\r,、/／]+)/i },
    { role: 'singer', regex: /(?:vocal|singer|歌|唄|vo)[\s:：/／―\-]+([^\n\r,、/／]+)/i },
    { role: 'mix', regex: /(?:mix|mixing|mastering|マスタリング)[\s:：/／―\-]+([^\n\r,、/／]+)/i },
    { role: 'illust', regex: /(?:illust|illustration|イラスト|絵)[\s:：/／―\-]+([^\n\r,、/／]+)/i },
    { role: 'movie', regex: /(?:movie|video|映像|動画)[\s:：/／―\-]+([^\n\r,、/／]+)/i },
  ];

  for (const p of patterns) {
    const match = normalizedDesc.match(p.regex);
    if (match && match[1]) {
      const name = cleanName(match[1]);
      if (name.length > 0 && name.length <= 25 && !/^[.\-_/:|]+$/.test(name)) {
        credits.push({ name, role: p.role });
      }
    }
  }

  // BPM抽出
  const bpmMatch = normalizedDesc.match(/BPM[\s:：]*(\d{2,3})/i) || title.match(/BPM[\s:：]*(\d{2,3})/i);
  const bpm = bpmMatch ? parseInt(bpmMatch[1], 10) : null;

  // ピアプロURL抽出
  const piaproMatch = normalizedDesc.match(/https?:\/\/piapro\.jp\/t\/[a-zA-Z0-9_-]+/i);
  const piaproUrl = piaproMatch ? piaproMatch[0] : null;

  // ボーカル種別判定
  let vocalType = 'vocaloid';
  if (/歌ってみた|cover|covered/i.test(title) || /歌ってみた/i.test(normalizedDesc)) {
    vocalType = 'human';
  } else if (/collab|コラボ|feat\./i.test(title)) {
    vocalType = 'collab';
  }

  return { credits, bpm, piaproUrl, vocalType };
}

// メイン実行関数
async function run() {
  console.log('[Runner] Starting video fetch with enhanced cleaner...');
  const videos = await fetchNiconicoVideos();
  console.log(`[Runner] Fetched total ${videos.length} videos from Niconico.`);

  for (const v of videos) {
    const { credits, bpm, piaproUrl, vocalType } = parseCredits(v.description, v.title);

    // 1. 楽曲テーブルへ保存
    const { data: song, error: songErr } = await supabase
      .from('songs')
      .upsert(
        {
          platform: v.platform,
          video_id: v.videoId,
          title: v.title,
          thumbnail_url: v.thumbnailUrl,
          bpm,
          piapro_url: piaproUrl,
          vocal_type: vocalType,
          published_at: v.publishedAt,
        },
        { onConflict: 'video_id' }
      )
      .select()
      .single();

    if (songErr) {
      console.error(`[Error] Failed to insert song (${v.title}):`, songErr.message);
      continue;
    }

    console.log(`[Saved] [${v.platform}] ${v.title}`);

    // 古いクレジットを一度クリア（クレンジング後の綺麗なデータで再構築）
    await supabase.from('song_credits').delete().eq('song_id', song.id);

    // 2. クリエイター & クレジット保存
    for (const c of credits) {
      const { data: creator } = await supabase
        .from('creators')
        .upsert({ name: c.name, role: c.role }, { onConflict: 'name' })
        .select()
        .single();

      if (creator && song) {
        await supabase
          .from('song_credits')
          .upsert({
            song_id: song.id,
            creator_id: creator.id,
            role: c.role,
          }, { onConflict: 'song_id,creator_id,role' });
      }
    }
  }

  console.log('[Runner] Done! All credits cleaned.');
}

run();