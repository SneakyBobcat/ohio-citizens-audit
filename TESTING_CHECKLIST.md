# Testing Checklist
Barebones list of changes to verify on the live site after deploy.
Test on a real phone where possible. Items marked (data) confirm live pulls from ohiocitizensaudit.org.

## Data fixes
- [ ] Home: leadership cards open the CORRECT profile, especially Steve Demetriou, Phillip M. Robinson Jr., Kent Smith, Nickie J. Antonio
- [ ] Home: voter registration banner reads "October 5, 2026"
- [ ] Home: elections section shows ONLY General Election Nov 3, 2026 (no May 5 primary)
- [ ] (data) Home: election countdown days match ohiocitizensaudit.org

## Leadership (live sourcing)
- [ ] (data) Home leadership cards match ohiocitizensaudit.org/home.aspx (names, roles, districts)
- [ ] (data) Live-loaded leadership cards are TAPPABLE and open the right profile
- [ ] Portraits load on leadership cards

## Member Search (NEW page, under More)
- [ ] More tab shows Member Search, Community Forum, and Privacy & Legal entries
- [ ] Search finds members by last name, district number, or party
- [ ] Chamber filter: Senate shows 33, House shows 99
- [ ] Tapping a member opens their profile
- [ ] "Full directory" link opens ohiocitizensaudit.org/member_directory.aspx for historical members

## Member Search + site parity (NEW)
- [ ] More tab shows Member Search; page lists all 132 current members
- [ ] Search narrows by name, district number, or party text
- [ ] Chamber and Party filter chips work together; tapping one row opens the profile
- [ ] (data) Spot check a few members against ohiocitizensaudit.org/member_directory.aspx
- [ ] More tab shows Community Forum link (forum.ohiocitizensaudit.org opens externally)
- [ ] Bill detail: Topics chips appear in gray when the bill has topics on the main site; section absent when it has none
- [ ] Footer legal links (Privacy, Terms, Disclaimer) open the main site legal page

## Member Scoring (NEW tab)
- [ ] Bottom tab now reads "Scoring" (replaced "Participation")
- [ ] Scoring page shows "Representative Effectiveness Scores" hero
- [ ] "How the score works" card expands/collapses; explains 5 stages, significance, and the 1.000 baseline
- [ ] (data) Score list: if it populates, values + members match ohiocitizensaudit.org/member_participation.aspx
- [ ] If scores are JS-rendered on the main site, app shows the "being integrated" state with a link out — NOT fabricated numbers
- [ ] Party filter (All / Republican / Democrat) works
- [ ] Tapping a member opens their profile
- [ ] Old "Member Participation" view still reachable under the More tab

## Committees (live sourcing)
- [ ] Committee detail page shows MEMBERS first (Chair, Vice Chair, Ranking Member badged, then the rest), then BILLS
- [ ] (data) Member list matches the same committee on ohiocitizensaudit.org (spot check one House + one Senate committee)
- [ ] Tapping a committee member opens their profile; back returns to the committee
- [ ] Committee bills show number, GA, and type, and tapping one opens the bill
- [ ] Member portraits load; if one fails, initials show instead
- [ ] (data) Committees page shows green "Live · ohiocitizensaudit.org" badge
- [ ] Yellow "Static Data" warning is GONE (it only appears if the live fetch fails)
- [ ] (data) Bill/member counts match ohiocitizensaudit.org/committees.aspx (spot check: House Judiciary, Senate Finance)
- [ ] House/Senate toggle splits committees correctly
- [ ] Tapping a committee opens its detail page

## Color system (one meaning per color)
- [ ] Red/blue chips appear ONLY for party (Republican/Democrat)
- [ ] Bill numbers are solid navy chips everywhere (home, detail, profile)
- [ ] "House Bill"/"Senate Bill" type chips are neutral gray (no red/blue)
- [ ] Committee card House/Senate tags are neutral gray
- [ ] Committee names are teal everywhere (home cards, bill detail, profiles, participation pills)
- [ ] Status colors: Effective/Passed green · Introduced/In Committee amber · Vetoed/Failed dark gray — same on home AND detail pages
- [ ] GA chip is gray (not yellow) on home cards
- [ ] District chips are gray on both leadership and participation pages
- [ ] Bill sponsor party chips: Republican red, Democrat blue (were broken/inverted)
- [ ] Home bill card with an apostrophe in its title is tappable (live data case)

## Tap-through to profiles (quote-bug fix)
- [ ] Bill detail: tapping a PRIMARY SPONSOR opens their profile
- [ ] Bill detail: tapping a CO-SPONSOR opens their profile
- [ ] Committees → committee → bill → sponsor: tap opens profile
- [ ] Committee detail: tapping a MEMBER row opens their profile
- [ ] Participation page: tapping a member card opens their profile
- [ ] Reps page: tapping a member row opens their profile
- [ ] Works for names with apostrophes (e.g., O'Brien-style names)
- [ ] Profile back button returns to the bill/committee you came from, with its content intact

## Header
- [ ] Hamburger menu is gone; header shows brand only
- [ ] Every page is still reachable: 4 tabs + More (Districts, Bill Law, Contact, Constitution, Revised Code)

## Navigation
- [ ] Android back button / iPhone edge-swipe goes BACK within the app, does not exit
- [ ] Back from a profile returns to the same scroll position in the list
- [ ] Bottom tab bar: Home, Reps, Participation, Committees, More all work
- [ ] Tab bar clears the iPhone home indicator (safe area)
- [ ] "Participation" label fits on a small phone screen
- [ ] Pages fade in; profile/bill/committee details slide in from the right
- [ ] Deep link works: visit /#comm directly, lands on Committees

## Platform / PWA
- [ ] Pinch zoom works on every page
- [ ] Add to Home Screen: gold scales icon appears, app launches full screen
- [ ] Airplane mode: app still opens and shows fallback data (offline shell)
- [ ] After a new deploy: refresh once, confirm new version appears (no stale cache)
- [ ] Long-press app icon: shortcuts to Reps / Committees / Participation

## Delight
- [ ] Cards visibly respond when pressed (slight shrink/dim)
- [ ] Opening a profile/bill/committee shows shimmer skeleton placeholders, not a spinner
- [ ] Phone in dark mode: app follows it; navy/gold preserved; text readable everywhere
- [ ] Phone in light mode: unchanged from before
- [ ] iOS Settings > Accessibility > Reduce Motion: animations and shimmer stop

## Known intentional behaviors
- House lists two "Minority Leader" cards: mirrors the main site
- Data may be up to 1 hour old (function caching); leadership is always fresh
- If a live fetch fails, the app silently falls back to embedded data
