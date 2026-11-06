# TAMU-LAND — private iCal sync architecture (draft)
Status: design only. Not deployed. Live site still uses local test data.

## Requirements
- GitHub Pages is public. Never put private Airbnb/Booking.com calendar export URLs in repository, HTML/JavaScript, localStorage, or chat.
- Existing Supabase schema and RLS must be inspected, not replaced or weakened.
- Feeds may include blocked dates as well as bookings; never assume all events are reservations.

## Proposed backend
1. Supabase Auth email login with GitHub Pages redirect URL allowed.
2. Server-only calendar_feeds table: owner UUID, property, platform, secret feed URL and sync status. No SELECT access to feed URL from browser. Encrypt URL at rest where supported. RLS deny direct anon/auth access.
3. Authenticated Supabase Edge Function to register and revoke feeds. Validate HTTPS and known platform export domain, guard redirects/SSRF; use service role only on server; do not log URLs or return them after registration.
4. Scheduled Supabase Edge Function fetches feeds privately, enforces size and time limits, parses VEVENT and normalized dates, stores event IDs and sync timestamps, flags failures without clearing historical bookings.
5. Owner-specific RLS view of derived events excluding secret URLs. Manual review of ambiguous statuses. Deduplicate occupied dates across sources per property, exclusive checkout.
6. Show source freshness warnings and provisional legal count. Municipality guidance and actual operating records determine compliance.

## Acceptance tests
- Cross-owner access blocked by RLS.
- No feed URLs/secrets exposed to GitHub, browser JavaScript, network responses or logs.
- Login redirect works in same browser.
- Duplicated reservation dates count once.
- Blocks are excluded unless verified; stale feeds do not reset count.
- TZID and UTC date parsing, folded lines, cancelled events and exclusive DTEND covered.

## To execute
Connect the Supabase project integration to allow schema review, migration and Edge Function deployment; only then implement and enable sync.
