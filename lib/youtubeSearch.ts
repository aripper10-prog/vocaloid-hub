export async function searchYouTubeOnDemand(query: string): Promise<any[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.warn('YouTube API Key is not set.');
    return [];
  }

  try {
    // 検索クエリを調整（「作詞師」などを削って純粋な名前や関連ワードでもヒットしやすくする）
    const cleanQuery = query.replace(/作詞師/g, '').trim() || query;

    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(
        cleanQuery
      )}&maxResults=10&key=${apiKey}`
    );
    const data = await res.json();

    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      console.log(`[YouTube Search] No items found for query: ${cleanQuery}`);
      return [];
    }

    const videoIds = data.items.map((item: any) => item.id.videoId).filter(Boolean).join(',');
    if (!videoIds) return [];

    const detailsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}&key=${apiKey}`
    );
    const detailsData = await detailsRes.json();

    if (!detailsData.items) return [];

    const results: any[] = detailsData.items.map((item: any) => {
      const snippet = item.snippet;
      const stats = item.statistics;
      
      return {
        id: `yt_${item.id}`,
        title: snippet.title || 'Untitled',
        artists: snippet.channelTitle ? [{ name: snippet.channelTitle }] : [],
        artistString: snippet.channelTitle || 'Unknown Artist',
        songType: 'Original',
        thumbUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || '',
        publishDate: snippet.publishedAt,
        youtubeId: item.id,
        niconicoId: undefined,
        credits: [
          {
            role: 'Lyricist',
            creatorName: query, // ご自身のペンネームをクレジットとして強制付与
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
