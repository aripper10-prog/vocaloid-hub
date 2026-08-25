import { NextResponse } from 'next/server';
import { searchYouTubeOnDemand } from '@/lib/youtubeSearch';

const VOCADB_ROLE_MAP: Record<string, string> = {
  music: 'Composer',
  lyrics: 'Lyricist',
  tuning: 'VoiceManipulator',
  illust: 'Illustrator',
  movie: 'Animator',
  mix: 'Mixer',
  singer: 'Vocalist',
  dance: 'Other',
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query') || '';
    const mode = searchParams.get('mode') || 'song';
    const sort = searchParams.get('sort') || 'PublishDate';
    const maxResults = searchParams.get('maxResults') || '48';
    const start = searchParams.get('start') || '0';
    const parentVersionId = searchParams.get('parentVersionId');
    let artistId = searchParams.get('artistId');
    const role = searchParams.get('role');
    const songTypes = searchParams.get('songTypes') || 'Original,Cover,Remix,Other,MusicPV';

    // クリエイター検索モード時: アーティストIDの自動解決
    if (mode === 'creator' && query.trim() && !artistId) {
      try {
        const artistSearchUrl = `https://vocadb.net/api/artists?query=${encodeURIComponent(
          query.trim()
        )}&nameMatchMode=Auto&maxResults=10&lang=Japanese`;

        const aRes = await fetch(artistSearchUrl, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VocaHub/1.0',
          },
          cache: 'no-store',
        });

        if (aRes.ok) {
          const aData = await aRes.json();
          const items = aData.items || [];
          const target = query.trim().toLowerCase();

          const exactMatch = items.find(
            (a: any) =>
              (a.name || '').toLowerCase() === target ||
              (a.additionalNames || '')
                .toLowerCase()
                .split(',')
                .map((n: string) => n.trim())
                .includes(target)
          );

          if (exactMatch) {
            artistId = String(exactMatch.id);
          } else if (items.length > 0) {
            artistId = String(items[0].id);
          }
        }
      } catch (e) {
        // ID解決失敗時はquery検索へ
      }
    }

    const vocaParams = new URLSearchParams({
      sort: sort,
      maxResults: maxResults,
      start: start,
      getTotalCount: 'true',
      fields: 'Artists,PVs,ThumbUrl',
      lang: 'Japanese',
      songTypes: songTypes,
    });

    if (mode === 'song' && query.trim()) {
      vocaParams.set('query', query.trim());
      vocaParams.set('nameMatchMode', 'Auto');
    }

    if (artistId && !isNaN(Number(artistId))) {
      vocaParams.append('artistId[]', artistId);
      vocaParams.set('artistParticipationStatus', 'Everything');
    } else if (mode === 'creator' && query.trim()) {
      vocaParams.set('query', query.trim());
      vocaParams.set('nameMatchMode', 'Auto');
    }

    if (role && VOCADB_ROLE_MAP[role]) {
      vocaParams.append('artistRole', VOCADB_ROLE_MAP[role]);
    }

    if (parentVersionId && !isNaN(Number(parentVersionId))) {
      vocaParams.set('parentVersionId', parentVersionId);
      vocaParams.set('childTags', 'true');
    }

    const vocaUrl = `https://vocadb.net/api/songs?${vocaParams.toString()}`;

    const res = await fetch(vocaUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VocaHub/1.0',
      },
      cache: 'no-store',
    });

    let items: any[] = [];
    let totalCount = 0;

    if (res.ok) {
      const data = await res.json();
      items = data.items || [];
      totalCount = data.totalCount || items.length;
    }

    // ★ 常にYouTubeオンデマンド検索を並行して実行し、Vercelログに結果を出力する
    if (query.trim()) {
      console.log(`[VocaHub Debug] Triggering YouTube search for query: "${query.trim()}"`);
      try {
        const ytResults = await searchYouTubeOnDemand(query.trim());
        console.log(`[VocaHub Debug] YouTube search returned ${ytResults.length} items`);
        
        if (ytResults && ytResults.length > 0) {
          const existingIds = new Set(items.map(item => String(item.id)));
          const uniqueYtItems = ytResults.filter(yt => !existingIds.has(String(yt.id)));
          items = [...items, ...uniqueYtItems];
          totalCount = items.length;
        }
      } catch (ytError) {
        console.error('[VocaHub Debug] YouTube search error:', ytError);
      }
    }

    return NextResponse.json({
      items,
      totalCount,
    });
  } catch (error) {
    console.error('[VocaHub Debug] API route fatal error:', error);
    return NextResponse.json({ items: [], totalCount: 0 }, { status: 200 });
  }
}
