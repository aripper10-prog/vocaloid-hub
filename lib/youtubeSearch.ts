import { VocaDBSong } from './vocadb';
import { parseDescription } from './parser';

export async function searchYouTubeOnDemand(query: string): Promise<VocaDBSong[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.warn('YouTube API Key is not set.');
    return [];
  }

  try {
    // クリエイター名やキーワードでYouTubeを検索
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(
        query
      )}&maxResults=10&key=${apiKey}`
    );
    const data = await res.json();

    if (!data.items || !Array.isArray(data.items)) {
      return [];
    }

    // 各動画の詳細（再生数や説明文などを取得するために動画IDで詳細を取得）
    const videoIds = data.items.map((item: any) => item.id.videoId).join(',');
    if (!videoIds) return [];

    const detailsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}&key=${apiKey}`
    );
    const detailsData = await detailsRes.json();

    if (!detailsData.items) return [];

    // VocaDBSong形式に変換
    const results: VocaDBSong[] = detailsData.items.map((item: any) => {
      const snippet = item.snippet;
      const stats = item.statistics;
      const description = snippet.description || '';
      const title = snippet.title || '';

      // 既存のパーサーでクレジット（作詞・作曲など）を自動抽出
      const parsed = parseDescription(description, title, snippet.tags || []);

      return {
        id: `yt_${item.id}`,
        title: title,
        artists: snippet.channelTitle ? [{ name: snippet.channelTitle }] : [],
        songType: 'Original',
        thumbUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || '',
        publishDate: snippet.publishedAt,
        youtubeId: item.id,
        niconicoId: undefined,
        bpm: parsed.bpm,
        vocalType: parsed.vocalType,
        isEventCollab: parsed.isEventCollab,
        credits: parsed.credits.map(c => ({
          role: c.role,
          creatorName: c.name,
        })),
        viewCount: stats?.viewCount ? parseInt(stats.viewCount, 10) : undefined,
      };
    });

    return results;
  } catch (error) {
    console.error('Error searching YouTube on demand:', error);
    return [];
  }
}
