// netlify/functions/member.js
// Fetches and parses a full member profile from ohiocitizensaudit.org

const BASE = 'https://ohiocitizensaudit.org';
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': BASE,
};

function clean(str) {
  return (str||'').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/\s+/g,' ').trim();
}

function parseMemberPage(html, id) {
  const nameM   = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const name    = nameM ? clean(nameM[1]) : '';

  // Info table
  const distM   = html.match(/District<\/td>\s*<\/tr>\s*<tr>\s*<td[^>]*>\s*(\d+)|>District<\/b><\/td>\s*<td[^>]*>(\d+)|District.*?<td[^>]*>\s*(\d+)\s*<\/td>/s);
  const chamM   = html.match(/Chamber<\/td>\s*<\/tr>\s*<tr>\s*<td[^>]*>\s*(House|Senate)|Chamber.*?<td[^>]*>\s*(House|Senate)\s*<\/td>/s);
  const partyM  = html.match(/Political Party.*?<td[^>]*>\s*(Republican|Democrat)\s*<\/td>/s);
  const linkM   = html.match(/href="(https:\/\/ohio(?:senate|house)\.gov\/members\/[^"]+)"/);

  // Simpler approach: just find the table after h1
  let district=0, chamber='', party='', ohLink='';
  const tableM = html.match(/<table[\s\S]{0,3000}?District[\s\S]{0,2000}?<\/table>/);
  if (tableM) {
    const t = tableM[0];
    const rows = t.match(/<tr[\s\S]*?<\/tr>/g) || [];
    rows.forEach(row => {
      const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/g)||[]).map(c=>clean(c));
      if (cells[0]==='District')      district = parseInt(cells[1])||0;
      if (cells[0]==='Chamber')       chamber  = cells[1]||'';
      if (cells[0]==='Political Party') party  = cells[1]||'';
    });
    const lm = t.match(/href="(https:\/\/ohio(?:senate|house)\.gov[^"]+)"/);
    if (lm) ohLink = lm[1];
  }
  if (!district && distM) district = parseInt(distM[1]||distM[2]||distM[3])||0;
  if (!chamber  && chamM)  chamber  = (chamM[1]||chamM[2]||'').trim();
  if (!party    && partyM) party    = partyM[1].trim();

  // Portrait
  const afterH1    = html.slice((html.indexOf('</h1>')||0)+5);
  const portM      = afterH1.match(/src="(Pictures\/member_portraits\/[^"]+)"/);
  const portraitUrl = portM ? `${BASE}/${portM[1]}` : '';

  // District map
  const mapM       = html.match(/src="(Pictures\/district_maps\/[^"]+\.png)"/);
  const distMapUrl  = mapM ? `${BASE}/${mapM[1]}` : '';

  // Bio - text between end of info table and "District Map"
  const preMap    = html.split(/District Map/i)[0]||'';
  const postTable = preMap.split(/<\/table>/);
  const bioRaw    = postTable[postTable.length-1]||'';
  const bioParas  = [...bioRaw.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
    .map(m=>clean(m[1])).filter(t=>t.length>60);
  const bio = bioParas.join('\n\n');

  // Committee memberships
  const committees = [];
  const commSecM = html.match(/Committee Membership<\/h2>([\s\S]*?)(?=<h2|$)/);
  if (commSecM) {
    const rx = /committee_details\.aspx\?id=(\d+)[^>]*>[\s\S]*?<b>(.*?)<\/b>[\s\S]*?Bills:\s*(\d*)\s*[\s\S]*?Members:\s*(\d+)/g;
    let m;
    while ((m=rx.exec(commSecM[1]))!==null) {
      committees.push({ id:parseInt(m[1]), name:clean(m[2]), bills:m[3]?parseInt(m[3]):0,
        members:parseInt(m[4]), url:`${BASE}/committee_details.aspx?id=${m[1]}` });
    }
  }

  // Helper: parse bill/vote block into structured fields
  function parseBillBlock(billId, block) {
    const rows = block.match(/<tr[\s\S]*?<\/tr>/g)||[];
    const fields = {};
    rows.forEach(row=>{
      const cells=(row.match(/<td[^>]*>([\s\S]*?)<\/td>/g)||[]).map(c=>clean(c));
      if (cells.length>=2) fields[cells[0]] = cells[1];
    });
    // title: first meaningful text line (not a field label)
    const allText = clean(block);
    const nonField = allText.replace(/General Assembly|Number|Type|Committee|Vote|Vote Date|Vote Result|\d+|S\.|H\.|B\.|C\.|R\.|No\./g,'').trim();
    const titleLines = allText.split(/\s{2,}/).map(s=>s.trim()).filter(s=>s.length>20 && !/^(General|Number|Type|Committee|Vote|Passed|Failed|Adopted)/.test(s));
    return {
      id:      parseInt(billId),
      title:   titleLines[0] || clean(block).substring(0,80),
      number:  fields['Number']||'',
      type:    fields['Type']||'',
      committee: (fields['Committee']||'').split('|')[0].trim(),
      vote:    fields['Vote']||'',
      date:    fields['Vote Date']||'',
      result:  (fields['Vote Result']||'').split('|')[0].trim(),
      url:     `${BASE}/bill_details.aspx?id=${billId}`,
    };
  }

  // Sponsored bills
  const bills = [];
  const billSecM = html.match(/id="sponsored_bills"[\s\S]*?(?=id="recent_votes"|$)/);
  if (billSecM) {
    const rx = /bill_details\.aspx\?id=(\d+)[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m=rx.exec(billSecM[0]))!==null && bills.length<9) {
      const b = parseBillBlock(m[1], m[2]);
      if (b.title) bills.push(b);
    }
  }

  // Recent votes
  const votes = [];
  const voteSecM = html.match(/id="recent_votes"([\s\S]*?)(?=<div id="Footer"|$)/);
  if (voteSecM) {
    const rx = /bill_details\.aspx\?id=(\d+)[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m=rx.exec(voteSecM[1]))!==null && votes.length<9) {
      const v = parseBillBlock(m[1], m[2]);
      if (v.title) votes.push(v);
    }
  }

  return {
    id, name, district, chamber, party,
    ps: party==='Republican'?'R':'D',
    portraitUrl, distMapUrl, ohLink, bio,
    committees, bills, votes,
    profileUrl: `${BASE}/member_details.aspx?id=${id}`,
    fetchedAt: new Date().toISOString(),
  };
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=1800',
  };
  const id = event.queryStringParameters?.id;
  if (!id || isNaN(parseInt(id))) {
    return { statusCode:400, headers, body:JSON.stringify({error:'Valid ?id= required'}) };
  }
  try {
    const url = `${BASE}/member_details.aspx?id=${id}`;
    const res = await fetch(url, {headers:FETCH_HEADERS});
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const profile = parseMemberPage(html, parseInt(id));
    return { statusCode:200, headers, body:JSON.stringify(profile) };
  } catch(err) {
    return { statusCode:500, headers, body:JSON.stringify({error:err.message}) };
  }
};
