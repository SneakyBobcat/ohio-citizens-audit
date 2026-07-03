// netlify/functions/bill.js
// Fetches bill details from ohiocitizensaudit.org/bill_details.aspx?id=X
// Returns: title, number, type, GA, govLink, status, topics, primarySponsors, coSponsors, committees

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

function parseSponsor(block) {
  // Each sponsor block has: portrait img, name, district, party, chamber, link
  const idM      = block.match(/member_details\.aspx\?id=(\d+)/);
  const nameM    = block.match(/data_detail_name[^>]*>\s*([\s\S]*?)\s*<\/div>/);
  const portM    = block.match(/src="(Pictures\/member_portraits\/[^"]+)"/);
  const distM    = block.match(/District\s*<\/td>\s*<td[^>]*>\s*(\d+)/s);
  const partyM   = block.match(/Party\s*<\/td>\s*<td[^>]*>\s*(Republican|Democrat)/s);
  const chamM    = block.match(/Chamber\s*<\/td>\s*<td[^>]*>\s*([\s\S]*?)\s*<\/td>/s);

  if (!idM) return null;

  const name    = nameM  ? clean(nameM[1])    : '';
  const id      = parseInt(idM[1]);
  const dist    = distM  ? parseInt(distM[1]) : 0;
  const party   = partyM ? partyM[1].trim()   : '';
  const chamber = chamM  ? clean(chamM[1])    : '';
  const slug    = name.toLowerCase().replace(/[^a-z\s]/g,'').replace(/\s+/g,'_').replace(/_(jr|sr|iii|ii)$/, '').replace(/_+$/,'');

  return {
    id, name, district: dist, party,
    ps: party === 'Republican' ? 'R' : 'D',
    chamber,
    portraitUrl: portM ? `${BASE}/${portM[1]}` : `${BASE}/Pictures/member_portraits/${slug}.jpg`,
    profileUrl:  `${BASE}/member_details.aspx?id=${id}`,
  };
}

function parseBillPage(html, id) {
  // Title
  const titleM = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const title  = titleM ? clean(titleM[1]) : '';

  // Info table
  const infoM  = html.match(/Number[\s\S]{0,2000}?General Assembly[\s\S]{0,500}?(?=<h2|Sponsors)/);
  const infoHtml = infoM ? infoM[0] : html.substring(0, 3000);

  const rows = (infoHtml.match(/<tr[\s\S]*?<\/tr>/g) || []);
  const fields = {};
  rows.forEach(row => {
    const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || []).map(c => clean(c));
    if (cells.length >= 2) fields[cells[0]] = cells[1];
  });

  const number  = fields['Number']          || '';
  const type    = fields['Type']            || '';
  const ga      = fields['General Assembly']|| '';
  const status  = fields['Status']          || '';
  const committee = fields['Committee']     || '';

  // Government link
  const govLinkM = html.match(/href="(https?:\/\/(?:www\.legislature\.ohio\.gov|search-prod\.lis)[^"]+)"/);
  const govLink   = govLinkM ? govLinkM[1] : '';

  // Topics section (custom OCA labels grouping related legislation).
  // ASSUMPTION, pending live verification: topics render as short chip texts
  // (anchors or spans) after the Topics heading, before the Committees section.
  // The parser accepts only short, non-sentence tokens so prose is never
  // mistaken for a topic chip; if nothing matches, topics is simply empty.
  const topics = [];
  const topicSecM = html.match(/(?:id="topics"|>\s*Topics\s*<)([\s\S]{0,2500}?)(?=<h2|id="committees"|Committees\s*<)/i);
  if (topicSecM) {
    const sec = topicSecM[1];
    const chipRx = /<(?:a|span|li|button)\b[^>]*>([\s\S]*?)<\/(?:a|span|li|button)>/gi;
    let cm;
    const seenTopic = {};
    while ((cm = chipRx.exec(sec)) !== null && topics.length < 15) {
      const t = clean(cm[1]);
      if (!t || t.length > 40) continue;               // chips are short labels
      if (/[.!?]$/.test(t) || t.split(' ').length > 5) continue; // skip prose
      if (/^(Topics|None|Top)$/i.test(t)) continue;
      if (seenTopic[t.toLowerCase()]) continue;
      seenTopic[t.toLowerCase()] = true;
      topics.push(t);
    }
  }

  // Primary sponsors section
  const primarySponsors = [];
  const primSecM = html.match(/Primary Sponsors?<\/h[23]>([\s\S]*?)(?=Co-?Sponsors?<\/h[23]>|<h2|$)/i);
  if (primSecM) {
    const sponsorLinkRx = /<a[^>]+member_details\.aspx\?id=\d+[^>]*>([\s\S]*?)<\/a>/g;
    let sm;
    while ((sm = sponsorLinkRx.exec(primSecM[1])) !== null) {
      const sp = parseSponsor(sm[0]);
      if (sp && sp.name) primarySponsors.push(sp);
    }
  }

  // Co-sponsors section
  const coSponsors = [];
  const coSecM = html.match(/Co-?Sponsors?<\/h[23]>([\s\S]*?)(?=<h2|Recent Votes|$)/i);
  if (coSecM) {
    const sponsorLinkRx = /<a[^>]+member_details\.aspx\?id=\d+[^>]*>([\s\S]*?)<\/a>/g;
    let sm;
    while ((sm = sponsorLinkRx.exec(coSecM[1])) !== null) {
      const sp = parseSponsor(sm[0]);
      if (sp && sp.name && !primarySponsors.find(p => p.id === sp.id)) {
        coSponsors.push(sp);
      }
    }
  }

  // Committee history / vote history
  const votes = [];
  const voteSecM = html.match(/Committee Actions?[\s\S]*?(?=<h2|$)/i);
  if (voteSecM) {
    const voteRx = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let vm;
    while ((vm = voteRx.exec(voteSecM[0])) !== null && votes.length < 10) {
      const cells = (vm[1].match(/<td[^>]*>([\s\S]*?)<\/td>/g) || []).map(c => clean(c));
      if (cells.length >= 3 && cells[0]) {
        votes.push({ date: cells[0], committee: cells[1] || '', action: cells[2] || '' });
      }
    }
  }

  return {
    id: parseInt(id), title, number, type, ga, status, committee, topics,
    govLink, primarySponsors, coSponsors, votes,
    url: `${BASE}/bill_details.aspx?id=${id}`,
    fetchedAt: new Date().toISOString(),
  };
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=900',
  };
  const id = event.queryStringParameters?.id;
  if (!id || isNaN(parseInt(id))) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valid ?id= required' }) };
  }
  try {
    const url = `${BASE}/bill_details.aspx?id=${id}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    const bill = parseBillPage(html, id);
    return { statusCode: 200, headers, body: JSON.stringify(bill) };
  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
exports._parse = parseBillPage;
