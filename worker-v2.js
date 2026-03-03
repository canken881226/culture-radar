const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version, x-action',
};

const REDDIT_HEADERS = {
  'User-Agent': 'CultureRadar/2.0',
  'Accept': 'application/json',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const action = request.headers.get('x-action');
    const apiKey = request.headers.get('x-api-key');

    // ── Reddit: fetch hot or rising posts ──
    if (action === 'reddit-posts') {
      try {
        const { subreddit, sort } = await request.json();
        const sortType = sort || 'hot';
        const url = `https://www.reddit.com/r/${subreddit}/${sortType}.json?limit=25&raw_json=1`;
        const res = await fetch(url, { headers: REDDIT_HEADERS });
        if (!res.ok) throw new Error('Reddit ' + res.status);
        const data = await res.json();
        const posts = data.data.children.map(p => ({
          id: p.data.id,
          title: p.data.title,
          score: p.data.score,
          comments: p.data.num_comments,
          sr: p.data.subreddit,
          url: p.data.permalink,
          selftext: (p.data.selftext || '').slice(0, 300),
        }));
        return new Response(JSON.stringify({ posts }), {
          headers: { 'Content-Type': 'application/json', ...CORS }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...CORS }
        });
      }
    }

    // ── Reddit: fetch comments for a post ──
    if (action === 'reddit-comments') {
      try {
        const { permalink } = await request.json();
        const url = `https://www.reddit.com${permalink}.json?limit=50&depth=2&raw_json=1`;
        const res = await fetch(url, { headers: REDDIT_HEADERS });
        if (!res.ok) throw new Error('Reddit ' + res.status);
        const data = await res.json();
        // data[1] is comments listing
        const comments = [];
        const extractComments = (children) => {
          for (const c of children) {
            if (c.kind === 't1' && c.data.body && c.data.body !== '[deleted]') {
              comments.push({
                body: c.data.body.slice(0, 500),
                score: c.data.score,
                author: c.data.author,
              });
              if (c.data.replies && c.data.replies.data) {
                extractComments(c.data.replies.data.children);
              }
            }
          }
        };
        if (data[1] && data[1].data) extractComments(data[1].data.children);
        return new Response(JSON.stringify({ comments: comments.slice(0, 60) }), {
          headers: { 'Content-Type': 'application/json', ...CORS }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...CORS }
        });
      }
    }

    // ── Claude API proxy ──
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: CORS });
    }
    try {
      const body = await request.json();
      if (!apiKey || !apiKey.startsWith('sk-ant')) {
        return new Response(JSON.stringify({ error: { message: 'Invalid API key' } }), {
          status: 401, headers: { 'Content-Type': 'application/json', ...CORS }
        });
      }
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { 'Content-Type': 'application/json', ...CORS }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: { message: e.message } }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }
  }
};
