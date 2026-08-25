import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from './context/ThemeContext';

export const metadata: Metadata = {
  title: 'VocaHub - ボカロ・作り手クレジット総合検索',
  description: '作詞、作曲、絵師、MIX師、動画師、振付まで。ボカロ・インディーズ音楽の職域クレジットと派生ツリーを発掘・数珠つなぎ検索できる統合エンジン。',
  openGraph: {
    title: 'VocaHub',
    description: 'ボカロ・クリエイターの職域クレジット総合検索エンジン',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="antialiased selection:bg-cyan-500 selection:text-slate-950">
        <ThemeProvider>
          {/* 画面全体の高さを確保し、中身が少なくてもフッターが一番下に沈むようにする仕組み */}
          <div className="min-h-screen flex flex-col">
            {/* メインコンテンツ */}
            <main className="flex-grow">
              {children}
            </main>

            {/* 常に表示されるフッター＆VocaDBクレジット */}
            <footer className="w-full py-6 px-4 border-t border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
              <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-2">
                <span>
                  データ提供：
                  <a
                    href="https://vocadb.net/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-600 dark:text-cyan-400 hover:underline ml-1 font-medium"
                  >
                    VocaDB (https://vocadb.net/)
                  </a>
                </span>
                <span className="hidden sm:inline text-slate-300 dark:text-slate-700">|</span>
                <span>VocaHub</span>
              </div>
            </footer>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
