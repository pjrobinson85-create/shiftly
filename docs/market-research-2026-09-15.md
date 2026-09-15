# Shiftly — Market Research & Feature Ideas (2026-09-15)

Research into comparable home-care / caregiver-coordination apps, to extract
feature ideas Shiftly could adopt. Shiftly's current shape: a **family-first
care coordination** app with two roles (FAMILY + WORKER), tasks, shifts,
incidents, care profiles, shopping list, photo uploads, NDIS export,
Google Calendar sync, and Telegram alerts. It is *not* a billing/payroll
platform — that distinction matters and is a strength.

Method: web research (vendor sites + independent comparison lists) on 10
Sept 2026. Sources are listed inline. Nothing here is a competitor we are
copying wholesale; the point is to spot the gaps in *family-facing* care
coordination that Shiftly could fill cheaply.

---

## 1. The competitive landscape

Broadly three clusters, and Shiftly sits at an interesting intersection:

### A. Agency/workforce platforms (Deputy, AlayaCare, Time to Care, AxisCare, 1060 Health, Home Care Hero, ShiftKey)
Built for **professional agencies** managing many clients and many workers.
Heavy on: rostering/scheduling, timesheets, payroll & billing, EVV
(electronic visit verification / GPS check-in), compliance documentation,
multi-site scaling, offline field mode.

- **Deputy** — workforce scheduling + time & attendance + timesheets that
  sync to payroll (Xero etc.); micro-shifts to match patient flow; mobile
  clock-in/out. https://www.deputy.com/industry/healthcare
- **AlayaCare** — "intelligent operating system" for post-acute/home care;
  route map + scheduled visits + daily tasks in the care-worker mobile app;
  **offline mode** for rural/low-connectivity areas; GPS-enabled EVV;
  family update notifications + "next scheduled visit" surfaced to the
  family. https://alayacare.com
- **ShiftKey** — check-in/out with **on-site digital signature** on the
  worker's phone; digital invoicing. https://www.shiftkey.com
- **Time to Care / AxisCare / 1060 / Home Care Hero** — care plans, client
  & staff management, billing/payroll/claims, EVV. (Comparison lists:
  Alora Health "Top 8 Home Care Software 2026",
  https://www.alorahealth.com/top-8-best-home-care-software-in-2026/ ;
  Connecteam, https://connecteam.com/home-health-software-solutions/)

**Key gap Shiftly avoids:** these are agency-grade and expensive, and they
treat the *family* as a secondary notification recipient, not a first-class
user. Shiftly's whole product is the family side. Don't build payroll, EVV,
or claims — that's a different (heavier) product and not what a family needs.

### B. Family caregiver-coordination apps (Caring Village, Connected Caregiver / Care Essentials, Medisafe, AARP-listed tools)
Closest to Shiftly's actual audience.

- **Caring Village** — the "village" model: a shared circle around one care
  recipient; everyone (family, friends, neighbours, professionals) on one
  **shared timeline** of updates + **daily check-ins**; tracks **mood and
  wellness trends**; medication reminders; documents/med lists in one place;
  **wellness journal**; an **AI assistant** ("Julia") for caregiving
  questions + insights. Free plan (1 village / 2 members), $14.99/mo,
  $24.99/mo. https://caringvillage.com/app/ and
  https://caringvillage.com/blog/caregiver-tech/elderly-care-apps-for-families/
- **Connected Caregiver "Care Essentials"** (free) — digital assistant:
  medication info + reminders, interaction checks, appointments, to-dos,
  mood tracking, notes (doctor visits), all collaborative.
  https://myconnectedcaregiver.com/care-essentials/
- **Medisafe** — pill reminders, "meds running low" alerts, interaction
  warnings, drug-discount (GoodRx) alerts.
  https://www.aarp.org/personal-technology/top-caregiving-apps/
- Research context (what families actually need): a 2024 scoping review of
  mobile apps for family caregivers consistently lists **medication
  management, task/appointment reminders, and the ability to report the
  care recipient's status/symptoms to a provider and get a response** as the
  top unmet needs. https://pmc.ncbi.nlm.nih.gov/articles/PMC11157180/

### C. NDIS / budget-specific (Australian)
- **my NDIS** app + **Plan Tracker Portal** — plan & budget overview,
  spending, claims. https://www.ndis.gov.au/participants/using-your-funding/
  using-portal-and-app/how-use-my-ndis-app ;
  https://apps.apple.com/au/app/plan-tracker-portal/id6444391742
- NDIS **plan review / report writing** is a formal, recurring event with a
  defined structure (plan reassessment & evaluation report).
  https://www.ndis.gov.au/providers/working-provider/reporting-and-recording-keeping/guide-report-writing

Shiftly already does **NDIS export** — that puts it ahead of most generic
family apps and it's a genuinely differentiating feature in the AU market.

---

## 2. Feature ideas, ranked by (value to a family / effort to build in Shiftly)

Value is judged against Shiftly's family-first, NDIS-aware positioning.
Effort assumes the existing Express + Prisma + React stack.

| # | Feature | Source pattern | Value | Effort | Notes for Shiftly |
|---|---------|----------------|-------|--------|-------------------|
| 1 | **Shared daily log / timeline** | Caring Village, Connected Caregiver | High | Low-Med | One append-only feed per care day: who did what, notes, mood, photos. Workers append during a shift; family reads it. Directly answers the #1 research finding (report status). Reuse `tasks`/`incidents` writes as timeline entries. |
| 2 | **Wellness / mood check-in + trend chart** | Caring Village, Medisafe, scoping review | High | Low | A 1–5 mood/energy/symptom prompt per check-in; store per day; surface a small 14-day trend on the family dashboard. Cheap (one column + a chart) and exactly what families say they want ("a second/third eye to catch things"). |
| 3 | **Medication log with reminders** | Medisafe, Care Essentials, scoping review | High | Med | Beyond the existing shopping list: a med schedule (name/dose/time) with "given" confirmations logged per dose, and a Telegram nudge to the responsible worker/family. Aligns with Paul's own medication-reminder work — shared infra. |
| 4 | **NDIS plan-review pack generator** | NDIS report-writing guide, my NDIS | High (differentiator) | Low-Med | One click → a formatted report of the period: tasks completed, incidents, hours, mood trend, spend/budget summary. Families must do plan reviews; producing this doc is a real pain and nobody in cluster B does it. Leverage the existing NDIS export. |
| 5 | **Visit check-in / check-out with photo or signature** | AlayaCare (family update + next visit), ShiftKey (on-site signature) | Med-High | Med | Worker taps "start visit" / "end visit"; auto-timestamps; optional photo or digital sign; emits a "visit started/ended" event to the family (we already have the socket + Telegram pipes). Gives EVV-like audit *without* the heavy compliance/GPS burden. |
| 6 | **Symptom / incident triage → alert escalation** | Scoping review (report status, get a response) | Med-High | Low-Med | Upgrade the existing incidents flow: an incident with severity "urgent" triggers an immediate Telegram alert to all family members (not just a log entry). Closes the loop on the #1 research need. |
| 7 | **Document / med-list library** | Caring Village, Care Essentials | Med | Low | A simple per-recipient file store (already have uploads infra): med lists, care plans, letters, consent forms. Families currently dig through email; one safe place is a stated differentiator. |
| 8 | **Next-visit / upcoming-visits banner on the family dashboard** | AlayaCare mobile (next scheduled visit) | Med | Low | Show the family the next 3 scheduled shifts/visits and who's on them. Trivial from existing shifts data; high perceived value. |
| 9 | **Offline-tolerant worker mode** | AlayaCare offline mode | Med | High | Cache tasks + allow logging when connectivity drops, reconcile on reconnect. Valuable for rural care but a real engineering cost (reconciliation, idempotency). Defer — do it only if a target user is rural. |
| 10 | **AI caregiving assistant** | Caring Village "Julia" | Low (now) | High | A natural-language helper over the care record ("summarise this week", "what meds changed"). Cool, but scope/risk is high and value is unproven for a family app. **Skip for now** — revisit once 1–6 land and we have a clean data model to query. |

### Explicit skip list (do NOT build)
- **Payroll / timesheets / billing / claims** — agency product, not family.
- **EVV / GPS compliance** — regulatory heavy, AU home-care context differs.
- **Multi-client / multi-site / multi-village scale** — not the target user.
- **Full AI assistant** — see #10; premature.

---

## 3. Recommended 90-day shortlist

Ordered to build on what Shiftly already has and to keep the family
experience tight:

1. **Shared daily log / timeline** (#1) — the backbone; everything else
   writes into it.
2. **Wellness/mood check-in + 14-day trend** (#2) — cheap, high-signal,
   feeds the plan-review pack.
3. **NDIS plan-review pack generator** (#4) — the differentiator; combines
   timeline + mood + existing NDIS export into one document.
4. **Incident urgent → instant Telegram escalation** (#6) — closes the loop
   on the single most-cited family need; small change to existing flow.

Medication log (#3) and next-visit banner (#8) are strong "next" items once
the above are in. Document library (#7) is low-cost and can slot in anytime.

---

## 4. Sources
- https://www.deputy.com/industry/healthcare
- https://alayacare.com
- https://www.shiftkey.com
- https://www.alorahealth.com/top-8-best-home-care-software-in-2026/
- https://connecteam.com/home-health-software-solutions/
- https://axiscare.com/features/scheduling/
- https://caringvillage.com/app/
- https://caringvillage.com/blog/caregiver-tech/elderly-care-apps-for-families/
- https://myconnectedcaregiver.com/care-essentials/
- https://www.aarp.org/personal-technology/top-caregiving-apps/
- https://pmc.ncbi.nlm.nih.gov/articles/PMC11157180/
- https://www.ndis.gov.au/participants/using-your-funding/using-portal-and-app/how-use-my-ndis-app
- https://apps.apple.com/au/app/plan-tracker-portal/id6444391742
- https://www.ndis.gov.au/providers/working-provider/reporting-and-recording-keeping/guide-report-writing
