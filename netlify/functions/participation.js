// netlify/functions/participation.js
// Fetches all pages of member_participation.aspx from ohiocitizensaudit.org
// Uses ASP.NET ViewState POST pagination to navigate through all pages.

const BASE = 'https://ohiocitizensaudit.org';
const URL  = `${BASE}/member_participation.aspx`;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; OhioCitizensAuditApp/1.0)',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': BASE,
};

function extractField(html, id) {
  const m = html.match(new RegExp(`id="${id}"[^>]*value="([^"]*)"`));
  return m ? m[1] : '';
}

function buildPostBody(html, action) {
  const vs  = extractField(html, '__VIEWSTATE');
  const vsg = extractField(html, '__VIEWSTATEGENERATOR');
  const ev  = extractField(html, '__EVENTVALIDATION');
  const params = new URLSearchParams({
    '__EVENTTARGET': '',
    '__EVENTARGUMENT': '',
    '__LASTFOCUS': '',
    '__VIEWSTATE': vs,
    '__VIEWSTATEGENERATOR': vsg,
    '__EVENTVALIDATION': ev,
    'ctl00$body$tbRepresentative_Participation_Search': '',
    'ctl00$body$ddlRepresentative_Participation_Party_Filter': 'None',
    'ctl00$body$rblView_Toggle': 'individual',
    [action]: action === 'ctl00$body$btnnext_part' ? '>' : '',
  });
  return params.toString();
}

function parseMembers(html) {
  const members = [];
  // Split on bold rank numbers inside the table
  const chunks = html.split(/<b>(\d+)<\/b>/);
  for (let i = 1; i < chunks.length; i += 2) {
    const rank = parseInt(chunks[i]);
    const block = chunks[i + 1] || '';

    const idM    = block.match(/member_details\.aspx\?id=(\d+)/);
    const nameM  = block.match(/data_detail_name[^>]*>\s*([\s\S]*?)\s*<\/div>/);
    const distM  = block.match(/<td>District<\/td>\s*<td[^>]*>(\d+)<\/td>/);
    const partyM = block.match(/<td>Party<\/td>\s*<td>(.*?)<\/td>/);
    const chamM  = block.match(/<td>Chamber<\/td>\s*<td[^>]*>(.*?)<\/td>/);
    const psM    = block.match(/<td[^>]*>\s*(\d+)\s*\/\s*(\d+)\s*<\/td>/);
    const pctM   = block.match(/<td[^>]*>\s*([\d.]+)%\s*<\/td>/);
    const coms   = [...block.matchAll(/<li>(.*?)<\/li>/g)].map(m => m[1].trim());

    const id      = idM    ? parseInt(idM[1])       : 0;
    const name    = nameM  ? nameM[1].replace(/<[^>]+>/g, '').trim() : '';
    const district = distM  ? parseInt(distM[1])    : 0;
    const party   = partyM ? partyM[1].trim()       : '';
    const chamber = chamM  ? chamM[1].trim()        : '';
    const passed  = psM    ? parseInt(psM[1])       : 0;
    const sponsored = psM  ? parseInt(psM[2])       : 0;
    const pct     = pctM   ? parseFloat(pctM[1])    : 0;

    if (name && id && rank) {
      members.push({
        rank, id, name, district,
        party,
        ps: party === 'Republican' ? 'R' : 'D',
        chamber, passed, sponsored, pct,
        committees: coms,
        profileUrl: `${BASE}/member_details.aspx?id=${id}`,
      });
    }
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
    const allMembers = [];
    const seenIds = new Set();

    // Page 1 — GET
    const r1 = await fetch(URL, { headers: HEADERS });
    if (!r1.ok) throw new Error(`Page 1 GET failed: ${r1.status}`);
    let html = await r1.text();

    const p1 = parseMembers(html);
    p1.forEach(m => { if (!seenIds.has(m.id)) { seenIds.add(m.id); allMembers.push(m); } });

    // Pages 2–14 — POST with "next" button
    for (let pg = 2; pg <= 14; pg++) {
      try {
        const body = buildPostBody(html, 'ctl00$body$btnnext_part');
        const r = await fetch(URL, {
          method: 'POST',
          headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        });
        if (!r.ok) break;
        html = await r.text();
        const members = parseMembers(html);
        if (!members.length) break;
        members.forEach(m => { if (!seenIds.has(m.id)) { seenIds.add(m.id); allMembers.push(m); } });
      } catch (e) {
        console.warn(`Page ${pg} failed:`, e.message);
        break;
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        source: 'ohiocitizensaudit.org',
        fetchedAt: new Date().toISOString(),
        count: allMembers.length,
        members: allMembers,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
