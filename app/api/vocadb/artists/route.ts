import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query') || '';
    const artistTypes = searchParams.get('artistTypes') || '';

    if (!query.trim()) {
      return NextResponse.json({ items: [] });
    }

    const vocaParams = new URLSearchParams({
      query: query.trim(),
      nameMatchMode: 'Auto',
      maxResults: '10',
      lang: 'Japanese',
      fields: 'MainPicture',
    });

    if (artistTypes) {
      vocaParams.set('artistTypes', artistTypes);
    }

    const res = await fetch(`https://vocadb.net/api/artists?${vocaParams.toString()}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VocaHub/1.0',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json({ items: [] });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[VocaDB Artists Proxy Exception]:', error);
    return NextResponse.json({ items: [] }, { status: 500 });
  }
}