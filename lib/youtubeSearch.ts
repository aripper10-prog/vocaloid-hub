export async function searchYouTubeOnDemand(query: string): Promise<any[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  
  console.log(`[YouTube Debug] API Key exists? ${!!apiKey} (Length: ${apiKey?.length || 0})`);
  console.log(`[YouTube Debug] Searching query: "${query}"`);

  if (!apiKey) {
    console.error('[YouTube Debug ERROR] YOUTUBE_API_KEY is missing in environment variables!');
    return [];
  }

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(
      query
    )}&maxResults=5&key=${apiKey}`;

    const res = await fetch(url);
    const data = await res.json();

    console.log(`[YouTube Debug] API Response status: ${res.status}`);
    console.log(`[YouTube Debug] API Response items count: ${data.items?.length || 0}`);
    if (data.error) {
      console.error('[YouTube Debug ERROR from Google]:', JSON.stringify(data.error));
    }

    if (!data.items || !Array.isArray(data.items)) {
      return [];
    }

    return data.items.map((item: any) => ({
      id: `yt_${item.id.videoId}`,
      title: item.snippet.title,
      artists: [{ name: item.snippet.channelTitle }],
      artistString: item.snippet.channelTitle,
      songType: 'Original',
      thumbUrl: item.snippet.thumbnails?.high?.url || '',
      publishDate: item.snippet.publishedAt,
      youtubeId: item.id.videoId,
      niconicoId: undefined,
      credits: [{ role: 'Lyricist', creatorName: query }],
    }));
  } catch (error) {
    console.error('[YouTube Debug FATAL ERROR]:', error);
    return [];
  }
}
