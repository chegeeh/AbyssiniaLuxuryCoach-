# Abyssinia Luxury Coach — website

A booking site for the Nairobi ⇄ Addis Ababa route: seat selection, live fare
calculation, and checkout via WhatsApp (+254 757 869 102).

## File structure

```
index.html          the whole page
css/style.css        all styling
js/app.js             booking logic (reads data/routes.json, renders everything)
data/routes.json     ← edit THIS to change prices, schedule, stops, offices
assets/images/        your 5 bus photos + the generated logo badge/favicon
```

## Editing prices, schedule or routes

Open `data/routes.json` in any text editor. No code changes needed for:

- **Fares** — `routes[].fares.vip` / `.business` (KES)
- **Departure days** — `routes[].departureDays` (e.g. `["Tue","Thu","Sat","Sun"]`)
- **Departure time(s)** — `routes[].departureTimes`
- **Stops shown in the journey timeline & fare cards** — `routes[].stops`
- **Office addresses/hours** — `company.offices`
- **WhatsApp number / email** — `company` block

### ⚠️ Placeholder values you MUST replace before launch

I didn't have your real fares, schedule or office addresses, so these are
placeholders marked `PLACEHOLDER` in the JSON:

- Fares: VIP KES 8,500 / Business KES 6,000 — **guesses, not real prices**
- Departure days/time: Tue/Thu/Sat/Sun at 05:00 — guessed
- Route stops (Isiolo, Marsabit, Moyale, Yabelo, Hawassa) — the standard
  overland path, but confirm against what you actually run
- Office addresses in Nairobi and Addis Ababa — placeholder text
- Email address `bookings@abyssinialuxurycoach.co.ke` — pick a real inbox

Everything else (copy, design, layout, WhatsApp flow) is finished and ready.

## Previewing locally

Opening `index.html` directly by double-clicking it will show a broken
booking widget — Chrome/Firefox block a page from fetching a local JSON file
over `file://`. Run a tiny local server from inside the project folder instead:

```
python3 -m http.server 8080
# or
npx serve
```

Then visit `http://localhost:8080`.

## Deploying

Upload the whole folder as-is to your host for `abyssinialuxurycoach.co.ke` —
it's a static site, no build step, no server-side code required. Any shared
hosting, Netlify, Vercel, or GitHub Pages will work.

## Important limitation: seat inventory is demo-only

This is a static site with no backend, so there's no shared, real-time seat
map. Right now:

- A handful of seats per class are hard-coded as "booked" in
  `demoBookedSeats` in routes.json, purely so the seat map looks realistic.
- Seats a visitor selects are only held in that visitor's browser tab — two
  different people booking at the same time won't see each other's picks,
  and nothing is actually reserved until you confirm it yourself on WhatsApp.

That's fine for how the flow works today (customer picks a seat → messages
you on WhatsApp → you confirm manually), but if you want real shared seat
availability and M-Pesa payment confirmation without manual back-and-forth,
that needs a small backend (a database tracking booked seats per date/route,
plus an M-Pesa STK Push integration). Given your Node/Daraja API background,
that'd be a natural next step whenever you want it — happy to help build it.

## What each JS function touches, if you want to extend it

- `renderDirectionToggle` / `renderClassOptions` / `renderTimeOptions` — the three
  ticket steps
- `renderSeatGrid` / `toggleSeat` — seat map drawing and click handling
- `updateTotals` / `sendToWhatsapp` — fare math and the WhatsApp message text
- `renderFareCards` / `renderJourney` / `renderOffices` — the marketing sections,
  all driven by the same JSON
