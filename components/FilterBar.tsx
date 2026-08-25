'use client';

interface FilterBarProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  vocalType: string;
  setVocalType: (t: string) => void;
  selectedRole: string;
  setSelectedRole: (r: string) => void;
}

const ROLES = [
  { label: 'すべて', value: '' },
  { label: '作詞', value: 'lyrics' },
  { label: '作曲', value: 'music' },
  { label: '調声', value: 'tuning' },
  { label: '歌唱/Vo', value: 'singer' },
  { label: 'MIX', value: 'mix' },
  { label: 'イラスト', value: 'illust' },
  { label: '動画', value: 'movie' },
];

export function FilterBar({
  searchQuery,
  setSearchQuery,
  vocalType,
  setVocalType,
  selectedRole,
  setSelectedRole,
}: FilterBarProps) {
  return (
    <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 mb-8 backdrop-blur-md shadow-lg space-y-4">
      <div className="flex flex-col md:flex-row gap-4">
        {/* 検索窓 */}
        <div className="flex-1">
          <input
            type="text"
            placeholder="楽曲名、クリエイター名で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-900/90 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
          />
        </div>

        {/* ボーカル種別タブ */}
        <div className="flex bg-slate-900/90 p-1 rounded-lg border border-slate-700 self-start">
          {[
            { label: 'すべて', value: 'all' },
            { label: 'ボカロ原曲', value: 'vocaloid' },
            { label: '歌ってみた/人間', value: 'human' },
            { label: '公式コラボ', value: 'collab' },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setVocalType(tab.value)}
              className={`px-3 py-1.5 text-xs md:text-sm font-medium rounded-md transition-all ${
                vocalType === tab.value
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 職域タグフィルター */}
      <div>
        <div className="text-xs font-semibold text-slate-400 mb-2">職域クレジットで絞り込み:</div>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((role) => (
            <button
              key={role.value}
              onClick={() => setSelectedRole(role.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                selectedRole === role.value
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 shadow-sm shadow-cyan-500/10'
                  : 'bg-slate-900/60 text-slate-400 border border-slate-700/60 hover:border-slate-600 hover:text-slate-300'
              }`}
            >
              {role.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}