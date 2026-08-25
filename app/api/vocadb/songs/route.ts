import { NextResponse } from 'next/server';

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

    if (mode === 'creator' && query.trim() && !artistId) {
      try {
        const artistSearchUrl = `https://vocadb.net/api/artists?query=${encodeURIComponent(
          query.trim()
        )}&nameMatchMode=Auto&maxResults=10&lang=Japanese`;

        const aController = new AbortController();
        const aTimer = setTimeout(() => aController.abort(), 2500);
        const aRes = await fetch(artistSearchUrl, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VocaHub/1.0',
          },
          signal: aController.signal,
          cache: 'no-store',
        });
        clearTimeout(aTimer);

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
      fields: 'Artists,PVs,ThumbUrl,Tags',
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(vocaUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VocaHub/1.0',
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return NextResponse.json({ items: [], totalCount: 0 }, { status: 200 });
    }

    const data = await res.json();
    let rawItems = data.items || [];

    // フロント側が配列の .length 等で絶対にクラッシュしないよう、各アイテムに必須の配列プロパティを安全に保証
    const items = rawItems.map((item: any) => ({
      ...item,
      artists: Array.isArray(item.artists) ? item.artists : [],
      pvs: Array.isArray(item.pvs) ? item.pvs : [],
      tags: Array.isArray(item.tags) ? item.tags : [],
      artistsString: item.artistString || item.artistsString || '',
    }));

    return NextResponse.json({
      items,
      totalCount: data.totalCount || items.length,
    });
  } catch (error) {
    return NextResponse.json({ items: [], totalCount: 0 }, { status: 200 });
  }
}
