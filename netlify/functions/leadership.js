// netlify/functions/leadership.js
// Sources Congressional Leadership directly from the Ohio Citizen's Audit home
// page (ohiocitizensaudit.org/home.aspx). Each leader is listed there as a link
// that contains that member's OCA profile ID, so this keeps the leadership
// cards, including their tap-through profile IDs, in sync with the main website.
//
// Note: OCA itself aggregates from ohiohouse.gov and ohiosenate.gov. We pull from
// OCA for now; sourcing the government sites directly is a possible future change.
//
// Returns: { fetchedAt, source, house:{leaders}, senate:{leaders} }
// Each leader: { id, slug, name, role, district, party, ps, chamber }
// Seat counts are intentionally omitted; OCA's home page does not publish numeric
// counts, so the app keeps its existing hemicycle figures.

const BASE = 'https://ohiocitizensaudit.org';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; OhioCitizensAuditApp/1.0)',
  'Accept': 'text/html,application/xhtml+xml',
  'Referer': BASE,
};

function clean(s) {
  return (s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Known leadership titles. findRoleBefore favors the title that ends nearest the
// member link, breaking ties toward the longer title so "Speaker Pro Tempore"
// wins over the embedded "Pro Tempore", and "Assistant Minority Leader" wins over
// the embedded "Minority Leader".
const ROLE_PATTERNS = [
  'Assistant Minority Leader',
  'Assistant Minority Whip',
  'Speaker of the House',
  'Speaker Pro Tempore',
  'President Pro Tempore',
  'Majority Leader',
  'Minority Leader',
  'Majority Whip',
  'Minority Whip',
  'Pro Tempore',
  'President',
  'Speaker',
];

function findRoleBefore(text) {
  let best = '';
  let bestEnd = -1;
  for (let i = 0; i < ROLE_PATTERNS.length; i++) {
    const role = ROLE_PATTERNS[i];
    const idx = text.lastIndexOf(role);
    if (idx === -1) continue;
    const end = idx + role.length;
    if (end > bestEnd || (end === bestEnd && role.length > best.length)) {
      bestEnd = end;
      best = role;
    }
  }
  return best;
}

function parseLeaders(html) {
  // Restrict to the leadership region of the page when the heading is present.
  let region = html;
  const headingIdx = html.indexOf('Congressional Leadership');
  if (headingIdx !== -1) region = html.slice(headingIdx);

  const leaders = [];
  const rx = /<a\b[^>]*href="[^"]*member_details\.aspx\?id=(\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = rx.exec(region)) !== null && leaders.length < 60) {
    const id = parseInt(m[1], 10);
    const inner = m[2];

    // Portrait slug, if the card includes the member image.
    const slugM = inner.match(/member_portraits\/([^"']+?)\.(?:jpg|jpeg|png)/i);
    const slug = slugM ? slugM[1] : '';

    const text = clean(inner);

    // Name is the text up to the "District" label.
    const nameM = text.match(/^([A-Za-z.\-'\u2019 ,]+?)\s+District/);
    if (!nameM) continue;
    const name = nameM[1].replace(/[,\s]+$/, '').trim();
    if (!name) continue;

    const distM = text.match(/District\D*(\d+)/);
    const district = distM ? parseInt(distM[1], 10) : 0;

    const partyM = text.match(/Republican|Democrat/i);
    const party = partyM
      ? partyM[0].charAt(0).toUpperCase() + partyM[0].slice(1).toLowerCase()
      : '';
    const ps = party === 'Republican' ? 'R' : 'D';

    const chamber = /Senate/i.test(text) ? 'Senate' : 'House';

    // The role label sits in the text just before this link.
    const before = clean(region.slice(Math.max(0, m.index - 260), m.index));
    const role = findRoleBefore(before);

    leaders.push({ id, slug, name, role, district, party, ps, chamber });
  }
  return leaders;
}

exports.handler = async () => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  };

  try {
    const res = await fetch(`${BASE}/home.aspx`, { headers: HEADERS });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();

    const all = parseLeaders(html);
    const house = all.filter((l) => l.chamber === 'House');
    const senate = all.filter((l) => l.chamber === 'Senate');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        fetchedAt: new Date().toISOString(),
        source: 'ohiocitizensaudit.org/home.aspx',
        house: { leaders: house },
        senate: { leaders: senate },
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

// Exported for offline testing of the parser.
exports._parseLeaders = parseLeaders;
exports._findRoleBefore = findRoleBefore;
