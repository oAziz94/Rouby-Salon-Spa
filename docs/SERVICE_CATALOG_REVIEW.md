# Service Catalog Review — Alrouby Salon & Spa

Reviewed against the production catalog on 3 Oct 2026 (12 categories, 58 services, 2 variants, 8 add-ons, 2 packages, 2 offers). Prices are the salon's decision; where a new service is suggested, only a typical duration is given so the slot and staff planning works from day one.

Legend: **Fix** = wrong as it stands · **Check** = probably fine, confirm · **Add** = commonly sold, not in the catalog.

---

## 1. Problems in the current catalog

| # | Item | Issue | Action |
|---|------|-------|--------|
| 1 | Royal Moroccan (1600) | No staff can perform it, not bookable online, no image, no description. Nobody can book or start it. | **Fix**: assign staff, add image/description — or delete and sell it as "Moroccan Bath + add-ons". |
| 2 | Package "Moroccan Bath Ritual" | Package price 1800 shown as a saving from "original" 1000. The parts cost 800 + 1000 = 1800, so there is no saving and the "was" price is wrong. | **Fix**: original 1800, package price e.g. 1600. |
| 3 | Offer code `BEATUYHOUR` | Typo; clients cannot type it. | **Fix**: rename to `BEAUTYHOUR`. |
| 4 | Offer "Summer Welcome" (SUMMER10) | Seasonal name, valid 2019 → 2036 (placeholder dates), still active in October. | **Fix**: end it or give it real dates. |
| 5 | Leg Gel Polish — 43 min | Odd duration (everything else is in 5-minute steps). | **Fix**: 45 min. |
| 6 | Hair Treatments (Keratin, Protein, Botox, Deep Conditioning Mask, Scalp Treatment) | All "contact for price" and hidden from online booking. They never appear in revenue estimates and cannot be booked online. | **Check**: switch to "Starts from …" with a floor price per hair length; keep online if you want the bookings. |
| 7 | Add-on "Loaf" (150) | Unclear name (loofah scrub?). Receptionists search the picker by name. | **Fix**: rename, e.g. "Loofah Scrub" / "ليفة مغربية". |
| 8 | Add-on "Regular Color" (50) | Unclear what it colours (nails?). | **Fix**: "Regular Nail Polish" or similar. |
| 9 | Add-ons "KINETICS COLOR", "KINETICS FRENCH COLOR" | Brand name in capitals; fine, but inconsistent with the rest. | **Check**: "Kinetics Gel Colour", "Kinetics French". |
| 10 | Rubber Base Gel | Only service without a short description. | **Fix**: add one line. |
| 11 | Classic Lash Extensions | Base price 750/90 min duplicates its own 90-min variant; the 60-min/500 variant is the only real alternative. | **Check**: either keep the two variants and clear the base price, or drop the variants. |
| 12 | Staff coverage | Reema is linked to 6 services, Doaa to 30, the others to 55–57. Staff appear in the start-service picker only for linked services. | **Check**: confirm Reema and Doaa's lists are intentional. |
| 13 | Processing time | None set yet. Colour, keratin-type treatments, lamination and lash lift leave the stylist free mid-service. | **Fix**: see §4. |

---

## 2. Completeness audit — every item with missing details

Checked for each service: Arabic name, search aliases, short and long description, image, duration, price, at least one staff member able to perform it, branch link, website benefits list, online-booking flag, processing time (where the service has a waiting phase), and odd values. Generated from the live data, so nothing is left out.

### 2.1 Services

| Service | Category | Missing / to fix |
|---|---|---|
| Full Hair Color | Color Services | processing time |
| Root Touch-Up | Color Services | processing time |
| Highlights — Half / Full | Color Services | processing time |
| Balayage / Ombre | Color Services | processing time |
| Color Correction | Color Services | processing time |
| Keratin Treatment | Hair Treatments | price (contact only) · hidden from online booking · processing time |
| Protein Treatment | Hair Treatments | price (contact only) · hidden from online booking · processing time |
| Botox Hair Treatment | Hair Treatments | price (contact only) · hidden from online booking · processing time |
| Deep Conditioning Mask | Hair Treatments | price (contact only) · hidden from online booking · processing time |
| Scalp Treatment | Hair Treatments | price (contact only) · hidden from online booking |
| Leg Gel Polish | Advanced Nails | odd duration 43 min |
| Rubber Base Gel | Advanced Nails | short description · long description |
| Royal Moroccan | Spa Services | short description · long description · image · no staff can perform it · benefits list (website) · hidden from online booking |
| Brow Lamination | Lash & Brow | processing time |
| Lash Lift | Lash & Brow | processing time |

**43 of 58 services are complete; 15 need attention.**

### 2.2 Add-ons — all 8 are incomplete

| Add-on | Missing / to fix |
|---|---|
| Derma Pen | Arabic name · search aliases · image |
| Jacuzzi | Arabic name · search aliases · image |
| KINETICS COLOR | Arabic name · search aliases · description · image · name in capitals |
| KINETICS FRENCH COLOR | Arabic name · search aliases · description · image · name in capitals |
| Loaf | Arabic name · search aliases · image · unclear name |
| Nail Art | Arabic name · search aliases · image |
| Plastic Nails | Arabic name · search aliases · image |
| Regular Color | Arabic name · search aliases · image · unclear name |

### 2.3 Packages

| Package | Missing / to fix |
|---|---|
| Spa Nails Package | Arabic name · search aliases · image |
| Moroccan Bath Ritual | Arabic name · search aliases · image · package price 1800 is not below original 1000 |

### 2.4 Offers

| Offer | Missing / to fix |
|---|---|
| Summer Welcome (SUMMER10, PERCENTAGE 10, 2019-05-01 → 2036-08-31) | description |
| Beauty Hour (BEATUYHOUR, PERCENTAGE 15, 2026-05-14 → 2026-12-31) | code typo (BEAUTYHOUR) |

### 2.5 Categories — none has a description or image

| Category | Missing / to fix |
|---|---|
| Hair Services (6) | description · image |
| Color Services (5) | description · image |
| Hair Treatments (5) | description · image |
| Nail Services (2) | description · image |
| Advanced Nails (10) | description · image |
| Spa Nails (2) | description · image |
| Spa Services (2) | description · image |
| Massage & Relaxation (5) | description · image |
| Hair Removal (11) | description · image |
| Facial & Skin Care (4) | description · image |
| Lash & Brow (3) | description · image |
| Lash Extensions (3) | description · image |

Notes on the audit:
- All 58 services have an Arabic name, search aliases, duration and a branch link; that part is done.
- "Summer Welcome" runs from 2019 to **2036** — a 17-year offer; almost certainly a placeholder date.
- Category descriptions/images only matter if the website shows category tiles; if it does, all 12 are blank.
- Add-ons have no Arabic names or aliases, so the front-desk search will not find them by Arabic typing — the same gap the services had before.

---

## 3. Missing services (by category)

### Hair
| Service | Typical duration | Note |
|---------|------------------|------|
| Hair Wash & Blow Dry | 45–60 min | You have Blow Dry; many clients ask for wash included as one line. |
| Kids' Haircut (under 12) | 30 min | Different price point from adult cut. |
| Fringe/Bang cut is present; **Men's / Boys' haircut** | 30 min | Only if the salon serves them. |
| Hair Extensions — application | 120–180 min | Starts-from pricing. |
| Hair Extensions — removal / maintenance | 60 min | |
| Updo / Occasion Hairstyle | 60–90 min | "Hair Styling from 500" may already cover it; a separate bridal/occasion line prices better. |
| Bridal Hair | 120 min | Usually sold with bridal makeup (see Packages). |
| Hair Iron / Curls only | 30–45 min | Cheaper than full styling; frequently requested. |
| Oil Bath / Hot Oil Treatment | 30–45 min | Common low-price treatment; sits in Hair Treatments. |

### Colour
| Service | Typical duration | Note |
|---------|------------------|------|
| Toner / Gloss | 45 min | Often needed after highlights; today it can only be added as a discount/override. |
| Bleach / Pre-lightening | 90–120 min | Separate from Highlights in most price lists. |
| Men's Grey Coverage | 30 min | Only if men are served. |

### Nails
| Service | Typical duration | Note |
|---------|------------------|------|
| Regular Polish Change (hands) | 15 min | No gel; very common. The "Regular Color 50" add-on may be this in disguise. |
| Regular Polish Change (feet) | 20 min | |
| Gel Polish Removal is present; **Hard Gel / Acrylic Removal** | 45 min | Longer than gel-polish removal. |
| Acrylic Full Set / Refill | 120 / 90 min | Only if the salon offers acrylic as well as hard gel/polygel. |
| Paraffin Treatment (hands / feet) | 20 min | Spa add-on or standalone. |
| Nail Art is an add-on; **Nail Extension single nail** | 15 min | Repair exists; extension of one nail is a different price. |
| Kids' Manicure | 20 min | |

### Spa & Massage
| Service | Typical duration | Note |
|---------|------------------|------|
| Body Scrub (standalone) | 30–45 min | Moroccan bath includes it; clients also book it alone. |
| Hot Stone Massage | 60–90 min | |
| Foot Massage / Reflexology | 30 min | |
| Full Body Massage — 60 and 90 min options | 60 / 90 min | Current Full Body is 45 min only; variants would cover this. |
| Pregnancy Massage | 60 min | Only if staff are trained. |
| Sauna / Steam session | 20–30 min | Only if the facility exists (Jacuzzi is already an add-on). |

### Hair Removal
| Service | Typical duration | Note |
|---------|------------------|------|
| Wax vs Sugar (halawa) | — | Current names say "Hair Removal" without the method; if both are offered the price often differs. Variants per service solve this. |
| Full Arm vs Half Arm | 30 / 20 min | Only "Arm" exists. |
| Brazilian | 45 min | Bikini exists; Brazilian is usually a separate price. |
| Chest / Buttocks | 20 min | Only if sold. |
| Upper Lip Wax | 10 min | Threading exists; some clients want wax. |
| Chin Threading | 10 min | |
| Full Face Wax | 30 min | |
| Laser Hair Removal (per area / package) | 15–60 min | Only if the salon has a laser machine; if so this is a whole category. |

### Face & Skin
| Service | Typical duration | Note |
|---------|------------------|------|
| Deep Cleansing / Acne Facial | 60 min | Levels 1–4 are generic; acne and anti-ageing are the two most asked-for specifics. |
| Anti-Ageing / Collagen Facial | 75 min | |
| Chemical Peel | 45 min | Derma Pen exists as add-on; peels usually sit next to it. |
| Microneedling as a standalone | 60 min | Currently only "Derma Pen" add-on at 550. |
| Eyebrow Tint / Lash Tint | 15–20 min | Usually sold with lamination/lift. |
| Henna Brows | 30 min | |
| Face Mask only (hydrating/gold) | 20–30 min | Add-on today (ENH_GOLD_MASK in seed); fine as add-on. |

### Lashes
| Service | Typical duration | Note |
|---------|------------------|------|
| Lash Extension **Refill** (2–3 weeks) | 60–75 min | Full sets exist (Classic / Volume / Mega) but no refill; refills are the repeat revenue. |
| Lash Extension Removal | 20–30 min | |
| Hybrid Lashes | 105 min | Between Classic and Volume; common tier. |
| Lower Lash Extensions | 30 min | |

### Makeup (whole category missing)
| Service | Typical duration | Note |
|---------|------------------|------|
| Day Makeup | 45 min | |
| Evening / Soirée Makeup | 60–75 min | |
| Bridal Makeup | 120 min | |
| Bridal Trial | 90 min | |
| Makeup Lesson | 90 min | Optional. |

### Packages / Bundles (only 2 packages, no bundles)
| Package | Contents |
|---------|----------|
| Bridal Package | Bridal hair + bridal makeup + trial (+ optional lashes, nails, Moroccan bath). The single highest-value item a salon sells. |
| Mani + Pedi (classic) | Classic manicure + classic pedicure, small saving. |
| Gel Hands + Feet | Hand gel + leg gel. |
| Colour + Treatment | Full colour + deep conditioning mask (or botox) — protects the hair, raises ticket. |
| Mother & Daughter / Kids' day | If kids are served. |
| Loyalty bundles ("5 blow-dries, pay 4") | The `bundles` table exists and is empty; this is what it is for. |

---

## 4. Processing time to set (stylist free while the product works)

| Service | Starts after | Processing |
|---------|--------------|------------|
| Full Hair Color | 30 min | 45 min |
| Root Touch-Up | 20 min | 30 min |
| Highlights — Half / Full | 40 min | 45 min |
| Balayage / Ombre | 60 min | 45 min |
| Color Correction | 60 min | 45 min |
| Keratin / Protein / Botox Hair Treatment | 40 min | 30 min |
| Deep Conditioning Mask | 10 min | 20 min |
| Brow Lamination | 10 min | 15 min |
| Lash Lift | 10 min | 15 min |

---

## 5. Suggested order of work
1. Fix the 13 items in §1 and the gaps listed in §2 (an hour of catalog editing; I can do all of them except price decisions).
2. Set processing times (§4).
3. Add the missing services you actually sell from §3 — start with lash refills, polish change, makeup, and a bridal package; they are the ones clients ask for by name.
4. Review staff service lists so the right people appear in the picker.
