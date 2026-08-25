import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const youtubeApiKey = process.env.YOUTUBE_API_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase の環境変数が設定されていません');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ボカロ・音声合成の特定キーワード＆タグ辞書
const SYNTH_KEYWORDS = [
  'vocaloid', 'ボーカロイド', 'ボカロ', 'synthesizer v', 'synthv', 'cevio', 'cevio ai',
  'utau', 'neutrino', 'voicepeak', '初音ミク', '巡音ルカ', '鏡音リン', '鏡音レン',
  'kaito', 'meiko', '重音テト', '音街ウナ', '歌愛ユキ', 'gumi', '神威がくぽ',
  '結月ゆかり', '可不', 'kaf', '星界', '裏命', '狐子', '羽累', '知声', '花隈千冬',
  '小春六花', '夏色花梨', 'flower', 'v flower', 'ia', 'one', 'mai', '東北ずん子',
  '東北きりたん', '滲音かこい', '鳴花ヒメ', '鳴花ミコト', '足立レイ', '春日部つむぎ'
];

const COVER_KEYWORDS = [
  '歌ってみた', '歌わせていただきました', 'cover', 'covered by', '歌唱', 'sing'
];

const ROLE_PATTERNS = [
  { role: 'music', regex: /(?:Music|作[曲編]|Sound|Track|Song)\s*[:：／/]\s*([^\n\r,，/／|]+)/i },
  { role: 'lyrics', regex: /(?:Lyrics|作詞|Words|Lyric)\s*[:：／/]\s*([^\n\r,，/／|]+)/i },
  { role: 'tuning', regex: /(?:Tuning|調声|調声協力)\s*[:：／/]\s*([^\n\r,，/／|]+)/i },
  { role: 'illust', regex: /(?:Illust|Illustration|イラスト|絵|Art)\s*[:：／/]\s*([^\n\r,，/／|]+)/i },
  { role: 'movie', regex: /(?:Movie|Video|映像|動画|MV)\s*[:：／/]\s*([^\n\r,，/／|]+)/i },
  { role: 'mix', regex: /(?:Mix|Mastering|MIX・マスタリング|マスタリング)\s*[:：／/]\s*([^\n\r,，/／|]+)/i },
  { role: 'singer', regex: /(?:Vocal|Vo|歌|歌唱)\s*[:：／/]\s*([^\n\r,，/／|]+)/i },
];

// タグ・タイトル・概要欄から総合判定
function determineVocalType(title: string, description: string, tags: string[] = []): 'vocaloid' | 'human' | 'collab' {
  const fullText = `${title} ${description} ${tags.join(' ')}`.toLowerCase();

  // 1. 歌ってみた判定
  const isCover = COVER_KEYWORDS.some((kw) => fullText.includes(kw));
  if (isCover) {
    return 'human';
  }

  // 2. ボカロ・音声合成判定（タグにボカロ関連が存在するか最優先確認）
  const isSynth = SYNTH_KEYWORDS.some((kw) => fullText.includes(kw));
  if (isSynth) {
    return 'vocaloid';
  }

  // 3. ボカロ名以外の feat. / コラボ表記
  if (/feat\.|ft\.|コラボ|with/i.test(title)) {
    return 'collab';
  }

  return 'vocaloid';
}

async function fetchAndSaveYouTube() {
  if (!youtubeApiKey) {
    console.error('YOUTUBE_API_KEY が設定されていません。');
    return;
  }

  console.log('[YouTube Fetcher] 検索実行中...');
  const query = '初音ミク MV OR VOCALOID MV OR 重音テト MV -shorts -#shorts';
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
    query
  )}&type=video&videoDuration=medium&order=date&maxResults=15&key=${youtubeApiKey}`;

  const searchRes = await fetch(searchUrl);
  const searchData = await searchRes.json();

  if (!searchData.items || searchData.items.length === 0) {
    console.error('検索結果が見つかりませんでした:', searchData);
    return;
  }

  const videoIds = searchData.items.map((it: any) => it.id.videoId).join(',');

  // 動画の詳細情報（公式タグ tags を含む）を一括取得
  const detailUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoIds}&key=${youtubeApiKey}`;
  const detailRes = await fetch(detailUrl);
  const detailData = await detailRes.json();

  for (const item of detailData.items || []) {
    const videoId = item.id;
    const { title, description, publishedAt, thumbnails, tags = [] } = item.snippet;
    const thumbnailUrl = thumbnails?.high?.url || thumbnails?.default?.url;

    // タグを含めた精密判定
    const vocalType = determineVocalType(title, description, tags);

    const { data: songData, error: songError } = await supabase
      .from('songs')
      .upsert(
        {
          title,
          platform: 'youtube',
          video_id: videoId,
          thumbnail_url: thumbnailUrl,
          published_at: publishedAt,
          vocal_type: vocalType,
        },
        { onConflict: 'video_id' }
      )
      .select()
      .single();

    if (songError) {
      console.error(`保存エラー (${title}):`, songError.message);
      continue;
    }

    console.log(`[登録完了] [${vocalType}] ${title} (タグ数: ${tags.length})`);

    // クレジット登録
    for (const pattern of ROLE_PATTERNS) {
      const match = description.match(pattern.regex);
      if (match && match[1]) {
        const creatorName = match[1].trim().replace(/[\[\]()（）]/g, '');
        if (!creatorName || creatorName.length > 40) continue;

        const { data: creatorData } = await supabase
          .from('creators')
          .upsert({ name: creatorName }, { onConflict: 'name' })
          .select()
          .single();

        if (creatorData) {
          await supabase.from('song_credits').upsert(
            {
              song_id: songData.id,
              creator_id: creatorData.id,
              role: pattern.role,
            },
            { onConflict: 'song_id,creator_id,role' }
          );
        }
      }
    }
  }

  console.log('[YouTube Fetcher] タグスキャン完了＆全登録完了！');
}

fetchAndSaveYouTube();