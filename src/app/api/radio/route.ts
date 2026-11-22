import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': '*/*',
        'Icy-MetaData': '0',
      },
      cache: 'no-store',
    });

    if (!upstream.ok || !upstream.body) {
      return new Response('Stream unavailable', { status: 502 });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'keep-alive',
      },
    });
  } catch {
    return new Response('Stream error', { status: 502 });
  }
}
