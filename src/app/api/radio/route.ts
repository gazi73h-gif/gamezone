import { NextRequest } from 'next/server';

const STREAMS: Record<string, string> = {
  shqip: 'https://' + '://sednastream.com' + '/proxy/radioshqip/stream',
  dukagjini: 'https://' + '://voscast.com' + '/radiodukagjini',
};

export async function GET(req: NextRequest) {
  const station = req.nextUrl.searchParams.get('station') || 'shqip';
  const targetUrl = STREAMS[station] || STREAMS.shqip;

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': station === 'shqip' ? 'https://shqipfm.al' : 'https://dukagjini.com',
      },
      cache: 'no-store',
    });

    if (!upstream.ok || !upstream.body) {
      return new Response('Stream unavailable', { status: 502 });
    }

    return new Response(upstream.body, {
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'audio/mpeg',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch {
    return new Response('Stream error', { status: 502 });
  }
}
