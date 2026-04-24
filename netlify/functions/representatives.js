// netlify/functions/representatives.js
// Fetches all 33 constituent panels from general_assembly_members.aspx

const BASE = 'https://ohiocitizensaudit.org';
const URL  = `${BASE}/general_assembly_members.aspx`;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; OhioCitizensAuditApp/1.0)',
  'Accept': 'text/html,application/xhtml+xml',
  'Referer': BASE,
};

function parseMember(block) {
  const idM    = block.match(/member_details\.aspx\?id=(\d+)/);
  const nameM  = block.match(/data_detail_name[^>]*>\s*([\s\S]*?)\s*<\/div>/);
  const distM  = block.match(/District[^|]*?(\d+)/);
  const partyM = block.match(/Political Party[^|]*?(Republican|Democrat)/);
  if (!idM || !nameM) return null;
  const name  = nameM[1].replace(/<[^>]+>/g, '').trim();
  const id    = parseInt(idM[1]);
  const dist  = distM  ? parseInt(distM[1])  : 0;
  const party = partyM ? partyM[1].trim()    : '';
  // Build portrait slug from name
  const slug  = name.toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, '_')
    .replace(/jr$|sr$|iii$|ii$/, '')
    .replace(/_+$/, '');
  return {
    id, name, district: dist, party,
    ps: party === 'Republican' ? 'R' : 'D',
    profileUrl: `${BASE}/member_details.aspx?id=${id}`,
    portraitUrl: `${BASE}/Pictures/member_portraits/${slug}.jpg`,
  };
}

function parsePanels(html) {
  const panels = [];
  // The panels are inside the main DataList table
  // Each panel has "Constituent Panel N" header, a senator, and up to 3 reps
  const panelRx = /Constituent Panel (\d+)([\s\S]*?)(?=Constituent Panel \d+|<\/table>|$)/g;
  let pm;
  while ((pm = panelRx.exec(html)) !== null) {
    const panelNum = parseInt(pm[1]);
    const block    = pm[2];

    // Find all member links within this panel block
    const memberLinks = [];
    const linkRx = /href="member_details\.aspx\?id=(\d+)"[\s\S]*?data_detail_name[^>]*>\s*([\s\S]*?)\s*<\/div>[\s\S]*?District[\s\S]*?(\d+)[\s\S]*?Political Party[\s\S]*?(Republican|Democrat)/g;
    let lm;
    while ((lm = linkRx.exec(block)) !== null) {
      const id    = parseInt(lm[1]);
      const name  = lm[2].replace(/<[^>]+>/g, '').trim();
      const dist  = parseInt(lm[3]);
      const party = lm[4].trim();
      if (!name || !id) continue;
      const slug = name.toLowerCase()
        .replace(/[^a-z\s]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_(jr|sr|iii|ii)$/, '')
        .replace(/_+$/, '');
      memberLinks.push({
        id, name, district: dist, party,
        ps: party === 'Republican' ? 'R' : 'D',
        profileUrl: `${BASE}/member_details.aspx?id=${id}`,
        portraitUrl: `${BASE}/Pictures/member_portraits/${slug}.jpg`,
      });
    }

    if (!memberLinks.length) continue;
    const senator = memberLinks[0];
    const reps    = memberLinks.slice(1, 4);
    panels.push({ panel: panelNum, senator, reps });
  }
  return panels.sort((a, b) => a.panel - b.panel);
}

exports.handler = async () => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600',
  };

  try {
    const res = await fetch(URL, { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const panels = parsePanels(html);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        source: 'ohiocitizensaudit.org',
        fetchedAt: new Date().toISOString(),
        count: panels.length,
        panels,
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
