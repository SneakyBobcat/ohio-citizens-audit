// netlify/functions/committee_detail.js
// Fetches a committee detail page from ohiocitizensaudit.org
// Returns: name, chamber, members (with roles), bills

const BASE = 'https://ohiocitizensaudit.org';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Referer': BASE,
};

function clean(s) {
  return (s||'').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&#39;/g,"'")
    .replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
}

function oca_slug(name) {
  const OVERRIDES = { 'J. Kyle Koehler': 'kyle_koehler' };
  if (OVERRIDES[name]) return OVERRIDES[name];
  return name.replace(/\./g,'').toLowerCase().replace(/ +/g,'_');
}

function parseCommitteeDetail(html, id) {
  // Name
  const nameM = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const name  = nameM ? clean(nameM[1]) : '';

  // Chamber from name
  const chamber = name.toLowerCase().startsWith('senate') ? 'Senate' : 'House';

  // Members section
  const members = [];
  const memSecM = html.match(/id="committee_members"[\s\S]*?(?=id="committee_bills"|$)/);
  if (memSecM) {
    const secHtml = memSecM[0];
    // Current role tracking - roles appear as text before the member link
    // Parse as table cells
    const cellRx = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let cm;
    let currentRole = '';
    while ((cm = cellRx.exec(secHtml)) !== null) {
      const cell = cm[1];
      // Check if this cell is a role label (contains role text before the link)
      const roleM = cell.match(/^(Chair|Vice Chair|Ranking Member)/);
      const idM   = cell.match(/member_details\.aspx\?id=(\d+)/);
      const nameTextM = cell.match(/data_detail_name[^>]*>([\s\S]*?)<\/div>/);

      if (roleM) currentRole = roleM[1];

      if (idM) {
        const mid   = parseInt(idM[1]);
        // Extract name from the cell
        const nameRaw = nameTextM ? clean(nameTextM[1]) : '';
        // Fallback: find name before District
        const nameAlt = clean(cell.split('District')[0]).replace(/^.*\|/,'').trim();
        const memberName = nameRaw || nameAlt.split('\n')[0].trim();

        // District and party
        const distM  = cell.match(/District\s*\|\s*(\d+)/s);
        const partyM = cell.match(/Political Party\s*\|\s*(Republican|Democrat)/s);

        const dist  = distM  ? parseInt(distM[1])  : 0;
        const party = partyM ? partyM[1].trim()    : '';

        if (memberName) {
          const role = currentRole;
          members.push({
            id: mid, name: memberName, role, district: dist, party,
            ps: party === 'Republican' ? 'R' : 'D',
            portraitUrl: `${BASE}/Pictures/member_portraits/${oca_slug(memberName)}.jpg`,
            profileUrl:  `${BASE}/member_details.aspx?id=${mid}`,
          });
          currentRole = ''; // reset after use
        }
      }
    }
  }

  // Bills section
  const bills = [];
  const billSecM = html.match(/id="committee_bills"[\s\S]*?(?=<div id="Footer"|$)/);
  if (billSecM) {
    const rx = /bill_details\.aspx\?id=(\d+)[^>]*>([\s\S]*?)<\/a>/g;
    let bm;
    while ((bm = rx.exec(billSecM[0])) !== null && bills.length < 20) {
      const block = bm[2];
      const cleanBlock = clean(block);
      const lines = cleanBlock.split(/\s{3,}/).map(s=>s.trim()).filter(s=>s.length>10);
      const title = lines[0] || '';
      const rows  = (block.match(/<tr[\s\S]*?<\/tr>/g)||[]);
      const fields = {};
      rows.forEach(row=>{
        const cells=(row.match(/<td[^>]*>([\s\S]*?)<\/td>/g)||[]).map(c=>clean(c));
        if(cells.length>=2) fields[cells[0]]=cells[1];
      });
      if (title) {
        bills.push({
          id:    parseInt(bm[1]),
          name:  title,
          num:   fields['Number']||'',
          ga:    fields['General Assembly']||'136',
          type:  fields['Type']||'',
          href:  `${BASE}/bill_details.aspx?id=${bm[1]}`,
        });
      }
    }
  }

  return { id, name, chamber, members, bills, fetchedAt: new Date().toISOString() };
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=1800',
  };
  const id = event.queryStringParameters?.id;
  if (!id || isNaN(parseInt(id))) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valid ?id= required' }) };
  }
  try {
    const res = await fetch(`${BASE}/committee_details.aspx?id=${id}`, { headers: HEADERS });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    const detail = parseCommitteeDetail(html, parseInt(id));
    return { statusCode: 200, headers, body: JSON.stringify(detail) };
  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
