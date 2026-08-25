import { CreatorRole, Platform, RelationType, VocalType } from './types';

export interface ParsedCredit {
  role: CreatorRole;
  name: string;
}

export interface ParsedOriginalSource {
  platform: Platform;
  videoId: string;
  relationType: RelationType;
}

export interface ParsedVideoInfo {
  credits: ParsedCredit[];
  bpm: number | null;
  vocalType: VocalType;
  isEventCollab: boolean;
  originalSource: ParsedOriginalSource | null;
}

export function parseDescription(desc: string, title: string = '', tags: string[] = []): ParsedVideoInfo {
  const credits: ParsedCredit[] = [];

  const rules: { role: CreatorRole; patterns: RegExp[] }[] = [
    { role: 'music', patterns: [/(?:Music|作[曲編]|Sound|Track|Composed)[\s:：]+([^\n\r,、/|]+)/i] },
    { role: 'lyrics', patterns: [/(?:Lyrics?|作詞|Words)[\s:：]+([^\n\r,、/|]+)/i] },
    { role: 'tuning', patterns: [/(?:Tuning|調声|調律)[\s:：]+([^\n\r,、/|]+)/i] },
    { role: 'singer', patterns: [/(?:Vocal|Vo|歌(?:唱)?|Singer|歌い手)[\s:：]+([^\n\r,、/|]+)/i] },
    { role: 'mix', patterns: [/(?:Mix|Mastering|マスタリング|音響)[\s:：]+([^\n\r,、/|]+)/i] },
    { role: 'illust', patterns: [/(?:Illust(?:ation)?|絵|画|Art)[\s:：]+([^\n\r,、/|]+)/i] },
    { role: 'movie', patterns: [/(?:Movie|Video|動画|映像|Animation)[\s:：]+([^\n\r,、/|]+)/i] },
  ];

  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      const match = desc.match(pattern);
      if (match && match[1]) {
        credits.push({ role: rule.role, name: match[1].trim() });
        break;
      }
    }
  }

  // BPM 抽出
  const bpmMatch = desc.match(/BPM[\s:：=]+(\d{2,3})/i);
  const bpm = bpmMatch ? parseInt(bpmMatch[1], 10) : null;

  // イベント・コラボ判定
  const isEventCollab = /ボカデュオ|Vocaduo|ボカコレ/i.test(desc) || tags.some(t => /ボカデュオ|Vocaduo/i.test(t));

  // ボーカル種別判定
  const hasSinger = credits.some(c => c.role === 'singer');
  const hasTuning = credits.some(c => c.role === 'tuning');
  let vocalType: VocalType = 'vocaloid';

  if (isEventCollab || (hasSinger && hasTuning)) {
    vocalType = 'collab';
  } else if (hasSinger || tags.includes('ニコニコインディーズ') || tags.includes('歌ってみた')) {
    vocalType = 'human';
  }

  // 原曲・本家リンクの検出
  const originalSource = parseOriginalSource(desc, title);

  return { credits, bpm, vocalType, isEventCollab, originalSource };
}

function parseOriginalSource(desc: string, title: string): ParsedOriginalSource | null {
  const originalKeywords = /(?:本家(?:様)?|原曲(?:様)?|Original|Covered|Original\s*Song)[\s:：\n\r]+([^\n\r]+)/i;
  const match = desc.match(originalKeywords);
  const targetText = match ? match[1] : desc;

  // 1. YouTube URL（sフラグを外し、[\s\S]*?で改行を含めて安全にマッチ）
  const ytMatch = targetText.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/i)
              || desc.match(/(?:本家|原曲)[\s\S]*?(?:youtu\.be\/|youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/i);

  if (ytMatch && ytMatch[1]) {
    return {
      platform: 'youtube',
      videoId: ytMatch[1],
      relationType: detectRelationType(desc, title),
    };
  }

  // 2. ニコニコ動画 (sm/so/nm)
  const nicoMatch = targetText.match(/(?:https?:\/\/)?(?:www\.)?nicovideo\.jp\/watch\/(sm\d+|so\d+|nm\d+)/i)
                 || targetText.match(/\b(sm\d+|so\d+|nm\d+)\b/i)
                 || desc.match(/(?:本家|原曲)[\s\S]*?\b(sm\d+|so\d+|nm\d+)\b/i);

  if (nicoMatch && nicoMatch[1]) {
    return {
      platform: 'niconico',
      videoId: nicoMatch[1],
      relationType: detectRelationType(desc, title),
    };
  }

  return null;
}

function detectRelationType(desc: string, title: string): RelationType {
  const combined = `${title} ${desc}`.toLowerCase();
  if (/remix|リミックス/i.test(combined)) return 'remix';
  if (/踊ってみた|dance/i.test(combined)) return 'dance';
  if (/(?:手描き|勝手にpv|自主制作pv|オリジナルmv)/i.test(combined)) return 'pv_remake';
  if (/歌ってみた|cover|歌わせていただきました/i.test(combined)) return 'cover';
  return 'cover';
}