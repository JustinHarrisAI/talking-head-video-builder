# Film-a-Testimonial-Video — Productized Service Spec

**Status:** Phase 0 — spec (not yet built)
**Owner:** Baldr (video-editor) + Sindri (website-builder) + Embla (brand-strategist)
**Related build:** `clients/justinharris-ai/builds/talking-head-video-builder/`
**Created:** 2026-04-21 by Justin's direction

---

## The Idea

Productize the talking-head-video pipeline into a standalone service offering for Vegas service businesses. Clients either upload their own raw footage or book a 30-minute film day, and we return polished, branded, platform-ready testimonial videos in 72 hours.

Two reasons this works now:

1. **Internal proof point.** Every Justin Harris AI client who hits 30/60/90-day milestones becomes a natural candidate for a testimonial video. 17 GBP reviews already. Hitting 25 reviews + 8 video testimonials compounds the social proof flywheel on justinharris.ai.
2. **Standalone SKU.** Vegas service businesses (law firms, dental practices, real estate teams, HVAC companies) all need testimonial video. None of them film it themselves. The existing market is $2K–$8K per video from traditional Vegas video production houses. We can deliver comparable quality at $497–$1,497 using the Baldr pipeline.

---

## Product Tiers

### Tier 1 — Client Uploads Raw Footage ($497)

**Client provides:**
- Raw testimonial video (phone recording acceptable, minimum 60 seconds, minimum 1080p)
- Client logo (SVG or PNG)
- Brand color HEX (optional — we match)

**We deliver in 72 hours:**
- 1× horizontal 16:9 (YouTube, website embed, LinkedIn video post) — 60–90 seconds
- 1× vertical 9:16 (Instagram Reels, TikTok, YouTube Shorts) — 30–60 seconds
- 1× square 1:1 (Instagram feed, Facebook) — 30–60 seconds
- Auto-captions in client brand font
- Animated intro/outro with client logo + website URL
- B-roll cuts (Baldr selects from stock or provided)
- Background audio bed (royalty-free, brand-appropriate)
- All 3 files delivered via client dashboard + Google Drive backup

### Tier 2 — Film Day On-Location ($1,497)

**We do everything in Tier 1, plus:**
- 90-minute on-location film session in Vegas (client office, jobsite, home — wherever makes sense)
- Professional lighting + audio kit
- Interviewer (Justin or hired operator) runs a structured 7-question testimonial interview
- Coaching on delivery, retakes included

**Geographic scope:** Tier 2 is Vegas metro only for the first 6 months. Once operations prove out, expand.

### Tier 3 — Testimonial Video Program ($2,997/quarter, 3-video retainer)

**For service businesses running ongoing video marketing:**
- 3× Tier 1 or Tier 2 videos per quarter
- Content calendar alignment (Baldr + Snotra plan what to film and when)
- Metricool auto-distribution across client's social channels
- Performance reporting (views, engagement, conversion-to-inquiry tied back to the video)

---

## Technical Architecture

### Leverages Existing Infrastructure

- **Baldr pipeline** at `clients/justinharris-ai/builds/talking-head-video-builder/` — already handles whisper.cpp transcription, FFmpeg cutting, auto-caption overlay, multi-format export
- **Metricool MCP** — for auto-distribution across client socials
- **Client dashboard** — similar pattern to routines.justinharris.ai (password cookie auth, client-scoped view)

### New Build Required

1. **Intake flow** at `clients/justinharris-ai/builds/talking-head-video-builder/intake/`
   - Form capturing client info, tier selection, upload slot
   - Stripe Checkout integration per tier ($497, $1,497, $2,997/qtr)
   - Webhook triggers BullMQ job to Baldr queue
2. **Client dashboard** at `clients/justinharris-ai/builds/talking-head-video-builder/dashboard/`
   - Status view (queued → processing → ready for review → delivered)
   - Preview player for rough cuts
   - Approve / request revision buttons
   - Download links in all 3 formats
3. **Baldr extensions** in the existing builder:
   - Brand matching (pull client logo + HEX from intake)
   - Interview question library (for Tier 2 operator guidance)
   - Revision queue with 1 free revision per video

### New Routines on JHAI Scheduler

- **`baldr-testimonial-queue-check`** — every 10 min: check BullMQ for new jobs, kick off processing
- **`baldr-testimonial-delivery-reminder`** — daily 10am: if any video is past 72 hours without client review, email reminder

---

## Go-to-Market

### Phase 1 — Internal Proof (Weeks 1–4)

Film testimonial videos for the 3–5 most vocal of Justin's current clients. Free. Goal: 5 polished videos on `justinharris.ai/reviews/` by Week 4, with "produced by our Testimonial Video Service" credit built into the outro.

### Phase 2 — Soft Launch to Past Clients (Weeks 5–8)

- Email past clients with a "We now offer this" intro
- Tier 1 at $497 to the first 10 clients as a launch rate
- Collect case studies and launch-rate testimonials for the landing page

### Phase 3 — Public Launch (Weeks 9–12)

- Dedicated landing page at `justinharris.ai/testimonial-video-service/`
- Ads on Meta + LinkedIn targeting Vegas service-business decision makers
- Ratatoskr builds keyword cluster: "Vegas testimonial video production," "local business video testimonials Las Vegas," "professional testimonial video service"
- Hermod outreach sequence to Vegas law firms, dental practices, and real estate brokerages

### Phase 4 — Scale (Months 4+)

- Open to non-Vegas clients for Tier 1 (Tier 2 remains Vegas metro)
- Partner referrals: Vegas Chamber, local business groups
- White-label option: offer the service to other consultants/agencies to resell

---

## Unit Economics (Draft)

| Tier | Price | Direct cost | Margin |
|---|---|---|---|
| Tier 1 | $497 | ~$30 (compute, storage, Metricool) | $467 (94%) |
| Tier 2 | $1,497 | ~$150 (film operator, equipment, compute) | $1,347 (90%) |
| Tier 3 | $2,997/qtr | ~$400 (quarterly cost of 3 videos) | $2,597 (87%) |

Baldr pipeline cost is near-zero marginal — the infrastructure exists. Primary variable cost is:
- Stock footage licenses (Envato, Artgrid — already subscribed)
- Film-day operator (hired per job at $300–$500)
- Client storage (S3 cold storage, ~$0.01/GB/month)

---

## Build Estimate

- **Intake + dashboard:** 6 hours (leverages existing patterns)
- **Baldr brand-matching + revision queue:** 4 hours
- **Stripe integration + webhook wiring:** 2 hours
- **Landing page (Sindri + Embla):** 3 hours
- **Email sequences (Idun):** 2 hours
- **Ratatoskr keyword cluster + content plan:** 2 hours
- **Total:** 19 hours across one 2-hour planning session + two 8-hour build sessions

---

## Dependencies

- [ ] Baldr pipeline is production-stable (confirmed 2026-03-25 per project memory)
- [ ] Stripe integration for JH.AI is live (confirmed — already used on audit gateway)
- [ ] Client dashboard pattern is documented (exists at routines.justinharris.ai)
- [ ] Embla signs off on brand-matching approach (Phase 0 spec gate)
- [ ] Justin confirms tier pricing (spec draft above — subject to pricing review)

---

## Open Decisions for Justin

1. **Pricing:** Draft tiers are $497 / $1,497 / $2,997/qtr. Adjust?
2. **Geography:** Tier 2 Vegas-only first, then expand. Agree?
3. **Operator:** Justin films Tier 2 sessions personally in Phase 1 (for story), or hire a local Vegas operator from day one?
4. **Branding:** Is this a sub-brand of justinharris.ai (e.g., "Testimonial Video by Justin Harris AI") or a new standalone brand (e.g., "Baldr Video Co.")?
5. **White-label in Phase 4:** Yes or no? If yes, pricing tier for resellers?

---

## Next Step

Schedule a 2-hour spec review session with Justin + Baldr + Sindri + Embla to:
1. Lock tier pricing
2. Answer the 5 open decisions above
3. Approve the build estimate and sequence
4. Kick off the first build session

Skadi tracks this in `agents/project-manager/active-projects.md` under "Cross-Project — Film-a-Testimonial-Video Productized Service (NEW)".
