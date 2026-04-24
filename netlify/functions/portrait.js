// netlify/functions/portrait.js
// Proxies member portrait images from ohiocitizensaudit.org
// Usage: /.netlify/functions/portrait?slug=matt_huffman

exports.handler = async (event) => {
  const slug = event.queryStringParameters && event.queryStringParameters.slug;
  if (!slug || !/^[a-z0-9_,\-\.]+$/.test(slug)) {
    return { statusCode: 400, body: 'Invalid slug' };
  }

  const url = 'https://ohiocitizensaudit.org/Pictures/member_portraits/' + slug + '.jpg';

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':  'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer':     'https://ohiocitizensaudit.org/',
        'Accept':      'image/jpeg,image/*',
      }
    });

    if (!res.ok) {
      return { statusCode: 404, body: 'Not found' };
    }

    const buf = await res.arrayBuffer();
    const b64 = Buffer.from(buf).toString('base64');

    return {
      statusCode: 200,
      headers: {
        'Content-Type':  'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
      body:            b64,
      isBase64Encoded: true,
    };
  } catch (err) {
    return { statusCode: 502, body: 'Fetch failed: ' + err.message };
  }
};
