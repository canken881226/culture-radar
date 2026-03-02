const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version, x-action',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const action = request.headers.get('x-action');

    // ── Reddit proxy ──
    if (action === 'reddit') {
      try {
        const { subreddit } = await request.json();
        const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=25&raw_json=1`;
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'CultureRadar/1.0 (by /u/cultureradar)',
            'Accept': 'application/json',
          }
        });
        if (!res.ok) throw new Error('Reddit HTTP ' + res.status);
        const data = await res.json();
        const posts = data.data.children.map(p => ({
          title: p.data.title,
          score: p.data.score,
          comments: p.data.num_comments,
          sr: p.data.subreddit,
        }));
        return new Response(JSON.stringify({ posts }), {
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }
    }

    // ── Claude API proxy ──
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
    }

    try {
      const body = await request.json();
      const apiKey = request.headers.get('x-api-key');

      if (!apiKey || !apiKey.startsWith('sk-ant')) {
        return new Response(JSON.stringify({ error: { message: 'Invalid API key' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });

    } catch (e) {
      return new Response(JSON.stringify({ error: { message: e.message } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    }
  }
};
