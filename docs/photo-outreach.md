# Product-photo outreach — two drafts, one decision

Two ready-to-send versions of the creamery email. They differ on exactly one
policy question, which is the attorney's to answer in the standing pre-launch
review:

- **Version A (permission-first):** photos appear on the public site only after
  a creamery says yes. The legally conservative default; the site fills in as
  replies arrive.
- **Version B (notice + opt-out):** photos go live with launch, credited and
  linked, with a same-day removal promise. A posture some publishers run;
  technically use-before-permission, so it needs the attorney's sign-off, not
  just ours.

Either way the email itself is the same goodwill move, the merge list is
`queue/photo_outreach.csv` (regenerate with `python scripts/outreach.py`; it
has no email addresses — DFW and the shops don't publish them, so the newsroom
sources those), and the mechanics after a "yes" are identical: forward the
reply to a saved folder as the permission record, copy the photos to locally
hosted assets, and set `Cheese.image` via `data/overrides/cheeses.json` —
photos never publish from the hotlink queue.

Merge fields are `{{double-braced}}`. The listing link for a creamery is
`https://rowanflynnpilot.github.io/cheese-census/#{{creamery_id}}` until the
WordPress embed exists.

---

## Version A — permission-first

**Subject:** Your cheese is in The Cheese Census — may we show your photos?

Hi {{first_name_or_team}},

I'm writing from Wausau Pilot & Review. We've built **The Cheese Census** — a
free statewide guide to Wisconsin cheese: every licensed creamery, the cheeses
they make, contest records, and a tool that helps readers build a cheese board
and then go buy it. {{creamery_name}} is in it, with {{photo_count}} of your
products listed — {{sample_products}} among them.

We'd love for your listings to carry **your own product photos** — the ones on
{{shop_domain}}. May we use them? A reply saying "yes, go ahead" is all we
need. In return:

- We host copies on our own servers (no load on yours), credited to
  {{creamery_name}} and linked to your shop.
- Any photo comes down any time you ask — one email, same day.
- If certain shots belong to a photographer or agency rather than to you, just
  say which and we'll skip those.

There's no cost and nothing to sign. While you're at it, here's your listing —
{{listing_url}} — and we'd welcome any corrections: hours, new cheeses,
anything we've got wrong.

Thanks for making the stuff that makes this state worth mapping.

{{sender_name}}
Wausau Pilot & Review
editor@wausaupilotandreview.com

---

## Version B — notice + opt-out (attorney sign-off required before sending)

**Subject:** Your cheese is in The Cheese Census — photos included, unless you'd rather not

Hi {{first_name_or_team}},

I'm writing from Wausau Pilot & Review. We've built **The Cheese Census** — a
free statewide guide to Wisconsin cheese: every licensed creamery, the cheeses
they make, contest records, and a tool that helps readers build a cheese board
and then go buy it. {{creamery_name}} is in it, with {{photo_count}} of your
products listed — {{sample_products}} among them.

When the census launches, your listings will include **your own product
photos** from {{shop_domain}} — hosted on our servers, credited to
{{creamery_name}}, and linked to your shop, so readers land on you.

If you'd rather we didn't — or if specific shots belong to a photographer or
agency and aren't yours to share — reply to this email and we'll remove them
the same day, no questions asked. And if you have better photos you'd like us
to use instead, send them along; we'll take your versions over our harvested
ones every time.

Here's your listing — {{listing_url}} — corrections welcome on anything.

Thanks for making the stuff that makes this state worth mapping.

{{sender_name}}
Wausau Pilot & Review
editor@wausaupilotandreview.com
