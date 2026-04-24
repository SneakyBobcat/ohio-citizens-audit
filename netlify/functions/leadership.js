// netlify/functions/leadership.js
// Fetches live leadership data from ohiohouse.gov and ohiosenate.gov
// Returns: House majority/minority leaders + Senate leaders + R/D seat counts

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; OhioCitizensAuditApp/1.0)',
  'Accept': 'text/html,application/xhtml+xml',
};

function clean(s) {
  return (s||'').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
}

// Parse leadership page from ohiohouse.gov/members/majority-leadership or minority-leadership
function parseLeadershipPage(html, party) {
  const members = [];
  // Each member block: [Name\n\nDistrict N   R/D\n\nRole\n\nDescription](url)
  const blockRx = /\[([^\]]+?)\n\n(District \d+\s+[RD])\n\n([^\n\]]+)\n\n([^\]]*)\]\(https:\/\/ohiohouse\.gov\/members\/([^)]+)\)/g;
  let m;
  while ((m = blockRx.exec(html)) !== null) {
    const name     = m[1].trim();
    const distPart = m[2].trim();                       // "District 78   R"
    const role     = m[3].trim();
    const slug     = m[5].trim();
    const distM    = distPart.match(/District\s+(\d+)\s+([RD])/);
    const district = distM ? parseInt(distM[1]) : 0;
    const ps       = distM ? distM[2] : (party === 'majority' ? 'R' : 'D');
    members.push({
      name, role, district, party: ps === 'R' ? 'Republican' : 'Democrat',
      ps, slug,
      url: 'https://ohiohouse.gov/members/' + slug,
    });
  }
  return members;
}

// Parse ohiohouse.gov/members/directory to count R vs D seats
function parseHouseSeatCount(html) {
  // Directory lists all members with their party
  const repCount = (html.match(/\bDistrict \d+\s+R\b/g) || []).length;
  const demCount = (html.match(/\bDistrict \d+\s+D\b/g) || []).length;
  return { rep: repCount, dem: demCount };
}

// Parse ohiosenate.gov/senators for Senate leadership
async function fetchSenateLeadership() {
  try {
    const res = await fetch('https://www.ohiosenate.gov/senators', { headers: HEADERS });
    if (!res.ok) return [];
    const html = await res.text();
    // Senate site has senators listed with their roles
    const members = [];
    // Look for leadership roles in the HTML
    const roleMap = {
      'President': 'President',
      'President Pro Tempore': 'President Pro Tempore',
      'Majority Floor Leader': 'Majority Leader',
      'Minority Floor Leader': 'Minority Leader',
      'Majority Whip': 'Majority Whip',
      'Minority Whip': 'Minority Whip',
    };
    // Parse senator cards
    const cardRx = /<a[^>]+href="\/senators\/([^"]+)"[^>]*>[\s\S]*?<\/a>/g;
    let m;
    while ((m = cardRx.exec(html)) !== null && members.length < 10) {
      const slug = m[1];
      const block = m[0];
      const nameM = block.match(/>([A-Z][^<]{2,40}?)</);
      const roleM = Object.keys(roleMap).find(r => block.includes(r));
      const partyM = block.match(/Republican|Democrat/i);
      if (nameM && roleM) {
        const name = clean(nameM[1]);
        const party = partyM ? partyM[0] : 'Republican';
        members.push({
          name, role: roleMap[roleM],
          party, ps: party === 'Republican' ? 'R' : 'D',
          slug, url: 'https://www.ohiosenate.gov/senators/' + slug,
        });
      }
    }
    return members;
  } catch(e) {
    return [];
  }
}

exports.handler = async () => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600',
  };

  try {
    // Fetch all pages in parallel
    const [majRes, minRes, dirRes] = await Promise.all([
      fetch('https://ohiohouse.gov/members/majority-leadership', { headers: HEADERS }),
      fetch('https://ohiohouse.gov/members/minority-leadership', { headers: HEADERS }),
      fetch('https://ohiohouse.gov/members/directory', { headers: HEADERS }),
    ]);

    const [majHtml, minHtml, dirHtml] = await Promise.all([
      majRes.ok ? majRes.text() : Promise.resolve(''),
      minRes.ok ? minRes.text() : Promise.resolve(''),
      dirRes.ok ? dirRes.text() : Promise.resolve(''),
    ]);

    // Parse House leadership (majority + minority)
    const majLeaders = parseLeadershipPage(majHtml, 'majority');
    const minLeaders = parseLeadershipPage(minHtml, 'minority');
    const houseLeaders = [...majLeaders, ...minLeaders];

    // Count House seats from directory
    const houseSeats = parseHouseSeatCount(dirHtml);

    // Fetch Senate leadership (best effort)
    const senateLeaders = await fetchSenateLeadership();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        fetchedAt: new Date().toISOString(),
        house: {
          leaders: houseLeaders,
          seats: houseSeats,
        },
        senate: {
          leaders: senateLeaders,
          seats: { rep: 24, dem: 9 }, // Senate is slower to change; fallback
        },
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
