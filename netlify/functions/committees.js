// netlify/functions/committees.js
// Fetches the full committee list from ohiocitizensaudit.org/committees.aspx
// Returns House and Senate committees with OCA committee IDs

const BASE    = 'https://ohiocitizensaudit.org';
const URL     = BASE + '/committees.aspx';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Referer': BASE,
};

function clean(s) {
  return (s||'').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
}

function parseCommittees(html) {
  const committees = [];

  // Each committee is a link to committee_details.aspx?id=N
  // Format: [**Name** * Bills: N * Members: N](url)
  const rx = /committee_details\.aspx\?id=(\d+)[^)]*\)\s*\|\s*\[(\*\*[^\]]+)\*\*[\s\S]*?Members:\s*(\d*)/g;

  // Better: parse the table cells with links
  const linkRx = /\[(\*\*[^\*]+\*\*[\s\S]*?)\]\(https:\/\/ohiocitizensaudit\.org\/committee_details\.aspx\?id=(\d+)\)/g;
  let m;

  // Determine which section we're in (House vs Senate) by tracking position
  const houseIdx  = html.indexOf('\nHouse\n') > 0 ? html.indexOf('\nHouse\n') : html.indexOf('| House |');
  const senateIdx = html.indexOf('\nSenate\n') > 0 ? html.indexOf('\nSenate\n') : html.indexOf('| Senate |');

  while ((m = linkRx.exec(html)) !== null) {
    const block = m[1];
    const id    = parseInt(m[2]);
    const pos   = m.index;

    // Name is between ** **
    const nameM   = block.match(/\*\*([^\*]+)\*\*/);
    const billsM  = block.match(/Bills:\s*(\d+)/);
    const membersM= block.match(/Members:\s*(\d+)/);

    const name    = nameM    ? nameM[1].trim()    : '';
    const bills   = billsM   ? parseInt(billsM[1]): 0;
    const members = membersM ? parseInt(membersM[1]):0;

    // Chamber based on position in document
    const chamber = (senateIdx > 0 && pos > senateIdx) ? 'Senate' : 'House';

    if (name && id) {
      committees.push({
        id, name, bills, members, chamber,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-+$/,''),
        url:  `${BASE}/committee_details.aspx?id=${id}`,
      });
    }
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
        count: all.length,
        committees: all,
      }),
    };
  } catch(err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
