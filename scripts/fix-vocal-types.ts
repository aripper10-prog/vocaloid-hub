import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// ボカロ・音声合成の特定キーワード辞書
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

async function fixVocalTypes() {
  console.log('[Fix Vocal Types] 既存楽曲のボーカル種別を再判定中...');
  const { data: songs, error } = await supabase.from('songs').select('id, title, vocal_type');

  if (error || !songs) {
    console.error('データ取得エラー:', error);
    return;
  }

  let updatedCount = 0;

  for (const song of songs) {
    const text = song.title.toLowerCase();

    let correctType: 'vocaloid' | 'human' | 'collab' = 'vocaloid';

    const isCover = COVER_KEYWORDS.some((kw) => text.includes(kw));
    const isSynth = SYNTH_KEYWORDS.some((kw) => text.includes(kw));

    if (isCover) {
      correctType = 'human';
    } else if (isSynth) {
      correctType = 'vocaloid';
    } else if (/feat\.|ft\.|コラボ|with/i.test(song.title)) {
      correctType = 'collab';
    } else {
      correctType = 'vocaloid';
    }

    if (correctType !== song.vocal_type) {
      await supabase.from('songs').update({ vocal_type: correctType }).eq('id', song.id);
      console.log(`[更新] "${song.title}" -> ${correctType}`);
      updatedCount++;
    }
  }

  console.log(`[Fix Vocal Types] 完了！ 合計 ${updatedCount} 件を修正しました。`);
}

fixVocalTypes();