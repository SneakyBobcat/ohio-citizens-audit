// netlify/functions/committee_detail.js
// Fetches a committee detail page from ohiocitizensaudit.org/committee_details.aspx?id=X
// Returns: name, chamber, members (with roles), bills.
//
// Parsing strategy: anchor on the member_details / bill_details links inside the
// #committee_members and #committee_bills sections, then read fields from the
// CLEANED text of each link ("Name District 32 Political Party Republican ...",
// "Title General Assembly 136 Number S. B. No. 435 Type Senate Bill"). This is
// markup-agnostic, so it works whether OCA wraps cards in tables or divs.
//
// Role-label trap: the Members section opens with DEFINITIONS of Chair, Vice
// Chair, and Ranking Member before the roster. Roles are therefore assigned
// only when the cleaned text immediately preceding a member link ENDS with the
// role label (the definitions end with prose sentences, so they never match).

const BASE = 'https://ohiocitizensaudit.org';
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

function roleBefore(html, anchorIndex) {
  // Cleaned text of the slice just before this link; a real role label sits at
  // its very end ("... presides over meetings. Chair" -> Chair belongs to the
  // NEXT link; "... District 32 Political Party Republican" -> no role).
  const windowText = clean(html.slice(Math.max(0, anchorIndex - 400), anchorIndex));
  if (/Vice Chair$/.test(windowText))     return 'Vice Chair';
  if (/Ranking Member$/.test(windowText)) return 'Ranking Member';
  if (/Chair$/.test(windowText))          return 'Chair';
  return '';
}

function parseCommitteeDetail(html, id) {
  const nameM = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const name  = nameM ? clean(nameM[1]) : '';
  const chamber = name.toLowerCase().startsWith('senate') ? 'Senate' : 'House';

  // ── Section boundaries ──
  let memStart  = html.search(/id="committee_members"/);
  let billStart = html.search(/id="committee_bills"/);
  if (memStart  === -1) memStart  = 0;
  const memEnd  = billStart !== -1 ? billStart : html.length;
  const memHtml = html.slice(memStart, memEnd);
  const billHtml = billStart !== -1 ? html.slice(billStart) : html;

  // ── Members ──
  const members = [];
  const seen = {};
  const memRx = /<a\b[^>]*href="[^"]*member_details\.aspx\?id=(\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = memRx.exec(memHtml)) !== null && members.length < 60) {
    const mid  = parseInt(m[1], 10);
    if (seen[mid]) continue;
    const text = clean(m[2]);

    // Name: text up to the District label
    let memberName = text;
    const dIdx = text.search(/\bDistrict\b/);
    if (dIdx > 0) memberName = text.slice(0, dIdx);
    memberName = memberName.replace(/[\-–|,\s]+$/, '').trim();
    if (!memberName) continue;

    const distM  = text.match(/District\D*(\d+)/);
    const partyM = text.match(/Republican|Democrat/i);
    const party  = partyM ? partyM[0].charAt(0).toUpperCase() + partyM[0].slice(1).toLowerCase() : '';
    const slugM  = m[2].match(/member_portraits\/([^"']+?)\.(?:jpg|jpeg|png)/i);

    seen[mid] = true;
    members.push({
      id: mid,
      name: memberName,
      role: roleBefore(memHtml, m.index),
      district: distM ? parseInt(distM[1], 10) : 0,
      party,
      ps: party === 'Republican' ? 'R' : 'D',
      chamber,
      portraitUrl: `${BASE}/Pictures/member_portraits/${slugM ? slugM[1] : oca_slug(memberName)}.jpg`,
      profileUrl:  `${BASE}/member_details.aspx?id=${mid}`,
    });
  }

  // ── Bills ──
  const bills = [];
  const billRx = /<a\b[^>]*href="[^"]*bill_details\.aspx\?id=(\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let b;
  while ((b = billRx.exec(billHtml)) !== null && bills.length < 30) {
    const bid  = parseInt(b[1], 10);
    const text = clean(b[2]);
    if (!text || text.length < 8) continue; // skip icon-only / pager links

    let title = text;
    const gaIdx = text.search(/\bGeneral Assembly\b/);
    if (gaIdx > 0) title = text.slice(0, gaIdx);
    title = title.replace(/[\-–|,\s]+$/, '').trim();
    if (!title) continue;

    const gaM   = text.match(/General Assembly\D*(\d+)/);
    const numM  = text.match(/Number\s+(.+?)\s+Type\b/);
    const typeM = text.match(/Type\s+((?:House|Senate)\s+(?:Bill|Concurrent Resolution|Joint Resolution|Resolution))/);

    bills.push({
      id:   bid,
      name: title,
      num:  numM  ? numM[1].trim()  : '',
      ga:   gaM   ? gaM[1]          : '',
      type: typeM ? typeM[1].trim() : '',
      href: `${BASE}/bill_details.aspx?id=${bid}`,
    });
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

exports._parse = parseCommitteeDetail;
