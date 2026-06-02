// netlify/functions/committees.js
// Fetches the full committee directory from ohiocitizensaudit.org/committees.aspx
// and returns House and Senate committees with their OCA committee IDs.
//
// Page structure (one cell per committee):
//   <a href="...committee_details.aspx?id=N"><b>Name</b><br>Bills: B Members: M</a>
// grouped under a "House" section heading and then a "Senate" section heading.
//
// Returns: { fetchedAt, source, count, committees:[{ id, name, bills, members, chamber, slug, url }] }

const BASE    = 'https://ohiocitizensaudit.org';
const URL     = BASE + '/committees.aspx';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Referer': BASE,
};

function clean(s) {
  return (s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCommittees(html) {
  const committees = [];

  // Find the Senate section divider so chamber can be assigned by position.
  // The intro paragraphs mention "Senate" too, so only search from the first
  // committee link onward, and ignore any match past the "Committee Assignments"
  // section that follows the tables.
  const firstAnchor = html.search(/committee_details\.aspx\?id=\d+/i);
  const searchFrom = firstAnchor >= 0 ? firstAnchor : 0;
  const assignmentsIdx = html.indexOf('Committee Assignments');
  let senateIdx = html.indexOf('Senate', searchFrom);
  if (senateIdx === -1 || (assignmentsIdx !== -1 && senateIdx > assignmentsIdx)) {
    senateIdx = -1; // could not locate a divider; treat everything as House
  }

  const usedSlugs = {};
  function makeSlug(name, chamber) {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    let slug = base;
    if (usedSlugs[slug]) {
      slug = base + (chamber === 'Senate' ? '-senate' : '-2');
      let n = 2;
      while (usedSlugs[slug]) { slug = base + '-' + n; n++; }
    }
    usedSlugs[slug] = true;
    return slug;
  }

  const rx = /<a\b[^>]*href="[^"]*committee_details\.aspx\?id=(\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = rx.exec(html)) !== null && committees.length < 200) {
    const id = parseInt(m[1], 10);
    const text = clean(m[2]);

    // Name is the bold label that precedes the "Bills:" count.
    let name = text;
    const billsPos = text.search(/Bills\s*:/i);
    if (billsPos > 0) name = text.slice(0, billsPos);
    name = name.replace(/[\s|]+$/, '').trim();
    if (!name) continue;

    const billsM   = text.match(/Bills\s*:\s*(\d+)/i);
    const membersM = text.match(/Members\s*:\s*(\d+)/i);
    const bills   = billsM   ? parseInt(billsM[1], 10)   : 0;
    const members = membersM ? parseInt(membersM[1], 10) : 0;

    const chamber = (senateIdx >= 0 && m.index > senateIdx) ? 'Senate' : 'House';
    const slug = makeSlug(name, chamber);

    committees.push({
      id, name, bills, members, chamber, slug,
      url: `${BASE}/committee_details.aspx?id=${id}`,
    });
  }

  return committees;
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
    const all  = parseCommittees(html);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        fetchedAt: new Date().toISOString(),
        source: 'ohiocitizensaudit.org/committees.aspx',
        count: all.length,
        committees: all,
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

// Exported for offline testing.
exports._parseCommittees = parseCommittees;
