// 完全に独立したYouTubeオンデマンド検索モジュール
export async function searchYouTubeOnDemand(query: string): Promise<any[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.warn('YouTube API Key is not set.');
    return [];
  }

  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(
        query
      )}&maxResults=10&key=${apiKey}`
    );
    const data = await res.json();

    if (!data.items || !Array.isArray(data.items)) {
      return [];
    }

    const videoIds = data.items.map((item: any) => item.id.videoId).join(',');
    if (!videoIds) return [];

    const detailsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}&key=${apiKey}`
    );
    const detailsData = await detailsRes.json();

    if (!detailsData.items) return [];

    const results: any[] = detailsData.items.map((item: any) => {
      const snippet = item.snippet;
      const stats = item.statistics;
      const description = snippet.description || '';
      const title = snippet.title || '';

      return {
        id: `yt_${item.id}`,
        title: title,
        artists: snippet.channelTitle ? [{ name: snippet.channelTitle }] : [],
        songType: 'Original',
        thumbUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || '',
        publishDate: snippet.publishedAt,
        youtubeId: item.id,
        niconicoId: undefined,
        credits: [
          {
            role: 'Composer',
            creatorName: snippet.channelTitle || 'Unknown',
          },
        ],
        viewCount: stats?.viewCount ? parseInt(stats.viewCount, 10) : undefined,
      };
    });

    return results;
  } catch (error) {
    console.error('Error searching YouTube on demand:', error);
    return [];
  }
}
