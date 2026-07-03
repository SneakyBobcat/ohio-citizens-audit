// netlify/functions/scoring.js
// Fetches Representative Effectiveness Scores from
// ohiocitizensaudit.org/member_participation.aspx (titled "Member Scoring").
//
// IMPORTANT — UNVERIFIED PARSER:
// As of this writing the score table rows are not present in the server-rendered
// HTML returned by a plain fetch (the methodology text is, the rows are not),
// which strongly suggests the table is populated client-side by JavaScript on the
// main site. If that is the case, no server-side scrape can read the values and
// this function will correctly return an empty list, and the app shows an
// informative "scores live on the main site" state rather than fabricated data.
//
// This parser is written against OCA's standard member-link pattern so that IF
// the scores are (or become) server-rendered as member links with a numeric
// score, it will pick them up. The reliable long-term fix is a JSON feed from
// Cardinal Core. Verify on deploy: hit /.netlify/functions/scoring and check
// `count`; if 0, the data is JS-rendered and a feed is required.

const BASE = 'https://ohiocitizensaudit.org';
const URL  = `${BASE}/member_participation.aspx`;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Referer': BASE,
};

function clean(s) {
  return (s||'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'")
    .replace(/&quot;/g,'"').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
}

function oca_slug(name) {
  const OVERRIDES = { 'J. Kyle Koehler': 'kyle_koehler' };
  if (OVERRIDES[name]) return OVERRIDES[name];
  return name.replace(/\./g,'').toLowerCase().replace(/ +/g,'_');
}

function parseScores(html) {
  const members = [];
  const seen = {};
  // Match only the member link; read the surrounding row text from a separate
  // slice so the trailing context never consumes the NEXT member's link.
  const rx = /<a\b[^>]*href="[^"]*member_details\.aspx\?id=(\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = rx.exec(html)) !== null && members.length < 200) {
    const id = parseInt(m[1], 10);
    if (seen[id]) continue;
    const linkText = clean(m[2]);
    const trailing = clean(html.slice(m.index + m[0].length, m.index + m[0].length + 200));
    const context  = linkText + ' ' + trailing;

    let name = linkText;
    const dIdx = name.search(/\bDistrict\b/);
    if (dIdx > 0) name = name.slice(0, dIdx);
    name = name.replace(/[\-–|,\s]+$/, '').trim();
    if (!name) continue;

    const distM  = context.match(/District\D*(\d+)/);
    const partyM = context.match(/Republican|Democrat/i);
    const chamM  = context.match(/\b(Senate|House)\b/);
    // Score: a decimal like 1.234 sitting near the member (LES baseline ~1.000).
    const scoreM = context.match(/\b([0-3]\.\d{2,3})\b/);
    if (!scoreM) continue; // no score -> not a score row; skip (avoids false rows)

    const party = partyM ? partyM[0].charAt(0).toUpperCase() + partyM[0].slice(1).toLowerCase() : '';
    seen[id] = true;
    members.push({
      id,
      name,
      district: distM ? parseInt(distM[1], 10) : 0,
      party,
      ps: party === 'Republican' ? 'R' : 'D',
      chamber: chamM ? (chamM[1][0].toUpperCase() + chamM[1].slice(1).toLowerCase()) : '',
      score: parseFloat(scoreM[1]),
      portraitUrl: `${BASE}/Pictures/member_portraits/${oca_slug(name)}.jpg`,
      profileUrl:  `${BASE}/member_details.aspx?id=${id}`,
    });
  }
  return members;
}

exports.handler = async () => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600',
  };
  try {
    const res = await fetch(URL, { headers: HEADERS });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    const members = parseScores(html);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        fetchedAt: new Date().toISOString(),
        source: 'ohiocitizensaudit.org/member_participation.aspx',
        count: members.length,
        members,
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

exports._parseScores = parseScores;
