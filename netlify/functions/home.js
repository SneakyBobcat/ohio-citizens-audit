// netlify/functions/home.js
// Fetches live bill search results + recently changed bills from ohiocitizensaudit.org home page
// Also returns updated leadership member IDs

const BASE = 'https://ohiocitizensaudit.org';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Referer': BASE,
};

function clean(s) {
  return (s||'').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
}

function parseBillCards(sectionHtml) {
  const bills = [];
  const seen = new Set();
  const rx = /bill_details\.aspx\?id=(\d+)[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = rx.exec(sectionHtml)) !== null) {
    const id = parseInt(m[1]);
    if (seen.has(id)) continue;
    seen.add(id);
    const block = m[2];
    const rows = (block.match(/<tr[\s\S]*?<\/tr>/g) || []);
    const fields = {};
    rows.forEach(row => {
      const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || []).map(c => clean(c));
      if (cells.length >= 2) fields[cells[0]] = cells[1];
    });
    const cleanBlock = clean(block);
    const lines = cleanBlock.split(/\s{3,}/).map(s => s.trim()).filter(s => s.length > 20);
    const title = lines[0] || '';
    if (title) {
      bills.push({
        id,
        name: title,
        num:  fields['Number'] || '',
        ga:   fields['General Assembly'] || '136',
        type: fields['Type'] || '',
        com:  fields['Committee'] || '',
        sta:  fields['Status'] || '',
        upd:  fields['Updated'] || '',
        href: `${BASE}/bill_details.aspx?id=${id}`,
      });
    }
  }
  return bills;
}

// Parse leadership section to extract member IDs
function parseLeadershipIds(html) {
  const leaders = [];
  const section = html.split('Congressional Leadership')[1] || html;
  const rx = /member_details\.aspx\?id=(\d+)[^>]*>[\s\S]*?<img[^>]+member_portraits\/([^"]+)"[\s\S]*?(\w[\w\s.,']+?)\s*[\n|]{1,3}\s*District[\s\S]{0,200}?(\d+)[\s\S]{0,100}?(Republican|Democrat)[\s\S]{0,100}?(House|Senate)/g;
  // Simpler approach: find all member links in leadership section with names
  const simpleRx = /href="member_details\.aspx\?id=(\d+)"[^>]*>[\s\S]*?src="Pictures\/member_portraits\/([^"]+)"[\s\S]*?<\/a>/g;
  let m;
  while ((m = simpleRx.exec(section)) !== null && leaders.length < 30) {
    const id = parseInt(m[1]);
    const slug = m[2].replace('Pictures/member_portraits/', '').replace('.jpg', '');
    const block = clean(m[0]);
    const nameMatch = block.match(/^([A-Z][A-Za-z\s.,']+?)\s+District/);
    const distMatch = block.match(/District\s+(\d+)/);
    const partyMatch = block.match(/Republican|Democrat/);
    const roleHtml = section.substring(Math.max(0, m.index - 300), m.index);
    const roleM = roleHtml.match(/(Speaker|President|Majority|Minority|Whip|Pro Tempore)[^<]*(?=<)/i);
    leaders.push({
      id,
      slug,
      name: nameMatch ? nameMatch[1].trim() : slug.replace(/_/g, ' '),
      district: distMatch ? parseInt(distMatch[1]) : 0,
      party: partyMatch ? partyMatch[0] : '',
      role: roleM ? roleM[0].trim() : '',
    });
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

    // Split into sections
    const billSearchSec = html.split('Recently Changed Bills')[0].split('Bill Search')[1] || '';
    const recentSec = html.split('Recently Changed Bills')[1] || '';
    const searchBills = parseBillCards(billSearchSec).slice(0, 9);
    const recentBills = parseBillCards(recentSec).slice(0, 9);

    const elections = parseElections(html);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        fetchedAt: new Date().toISOString(),
        searchBills,
        recentBills,
        elections,
      }),
    };
  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

// Also export a named function so it can be tested
// Parse election dates from OCA home page
function parseElections(html) {
  const elections = [];
  // OCA home page format: "Primary Election\nMay 5th, 2026\nN Days\nDays Until Election"
  const rx = /(Primary|General) Election[\s\S]{0,10}?((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d+(?:st|nd|rd|th)?,?\s+\d{4})[\s\S]{0,30}?(\d+)\s*Days[\s\S]{0,20}?Days Until Election/gi;
  let m;
  while ((m = rx.exec(html)) !== null) {
    const type = m[1];
    const dateStr = m[2].replace(/(\d+)(st|nd|rd|th)/, '$1');
    const days = parseInt(m[3]);
    elections.push({ type, date: dateStr.trim(), daysAway: days });
  }
  return elections;
}
