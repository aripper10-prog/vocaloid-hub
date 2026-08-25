import { NextResponse } from 'next/server';
import { searchYouTubeOnDemand } from '@/lib/youtubeSearch';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query') || '';
    const mode = searchParams.get('mode') || 'song';
    const sort = searchParams.get('sort') || 'PublishDate';
    const maxResults = searchParams.get('maxResults') || '48';
    const start = searchParams.get('start') || '0';
    const artistId = searchParams.get('artistId');
    const role = searchParams.get('role');
    const songTypes = searchParams.get('songTypes') || 'Original,Cover,Remix,Other,MusicPV';

    let items: any[] = [];
    let totalCount = 0;

    // 1. まず「作詞師ari」などのキーワードがある場合、YouTube Data APIを最優先で直撃して探す！
    if (query.trim()) {
      console.log(`[VocaHub] Searching YouTube directly for query: "${query.trim()}"`);
      try {
        const ytResults = await searchYouTubeOnDemand(query.trim());
        if (ytResults && ytResults.length > 0) {
          items = [...items, ...ytResults];
          console.log(`[VocaHub] Found ${ytResults.length} items from YouTube.`);
        }
      } catch (ytError) {
        console.error('[VocaHub] YouTube search failed:', ytError);
      }
    }

    // 2. 念のためVocaDB側からも検索してデータを混ぜる（VocaDBにある曲も拾うため）
    try {
      const vocaParams = new URLSearchParams({
        sort: sort,
        maxResults: maxResults,
        start: start,
        getTotalCount: 'true',
        fields: 'Artists,PVs,ThumbUrl',
        lang: 'Japanese',
        songTypes: songTypes,
      });

      if (query.trim()) {
        vocaParams.set('query', query.trim());
        vocaParams.set('nameMatchMode', 'Auto');
      }

      if (artistId && !isNaN(Number(artistId))) {
        vocaParams.append('artistId[]', artistId);
        vocaParams.set('artistParticipationStatus', 'Everything');
      }

      const vocaUrl = `https://vocadb.net/api/songs?${vocaParams.toString()}`;
      const res = await fetch(vocaUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VocaHub/1.0',
        },
        cache: 'no-store',
      });

      if (res.ok) {
        const data = await res.json();
        const vocaItems = data.items || [];
        
        // IDが被らないようにYouTubeの結果とマージ
        const existingIds = new Set(items.map(item => String(item.id)));
        const uniqueVocaItems = vocaItems.filter((v: any) => !existingIds.has(String(v.id)));
        
        items = [...items, ...uniqueVocaItems];
        totalCount = data.totalCount ? data.totalCount + (items.length - vocaItems.length) : items.length;
      }
    } catch (vocaError) {
      console.error('[VocaHub] VocaDB search error (ignored):', vocaError);
    }

    return NextResponse.json({
      items,
      totalCount: totalCount || items.length,
    });
  } catch (error) {
    console.error('[VocaHub] API fatal error:', error);
    return NextResponse.json({ items: [], totalCount: 0 }, { status: 200 });
  }
}
