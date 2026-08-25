import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from './context/ThemeContext';

export const metadata: Metadata = {
  title: 'VocaHub - ボカロ・歌い手・職域クレジット総合検索',
  description: '作詞、作曲、絵師、MIX師、動画師、振付まで。ボカロ・インディーズ音楽の職域クレジットと派生ツリーを発掘・数珠つなぎ検索できる統合エンジン。',
  openGraph: {
    title: 'VocaHub',
    description: 'ボカロ・歌い手・クリエイターの職域クレジット総合検索エンジン',
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
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}