/* ============================================================
   ABYSSINIA LUXURY COACH — booking logic
   All routes, classes and fares are read from data/routes.json.
   Edit that file to change prices/schedules — no code changes needed.

   NOTE ON SEAT INVENTORY: this is a static site with no server, so
   "booked" seats below are DEMO data from routes.json
   (demoBookedSeats) plus whatever the current visitor has picked in
   this session — they are NOT shared between visitors. To have real,
   shared seat availability (and M-Pesa payment confirmation) you'll
   need a small backend keeping one seat map per date/route — happy
   to help you build that as a next step.
   ============================================================ */

(function () {
  "use strict";

  let DATA = null;
  let state = {
    routeId: null,
    classId: null,
    timeId: null,
    selectedSeats: [],
  };

  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  const WEEKDAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  function nextDepartureDate(route, from) {
    const wanted = route.departureDays.map((d) => WEEKDAY_MAP[d]);
    const d = new Date(from);
    d.setDate(d.getDate() + 1); // start from tomorrow
    for (let i = 0; i < 8; i++) {
      if (wanted.includes(d.getDay())) return d;
      d.setDate(d.getDate() + 1);
    }
    return d;
  }

  fetch("data/routes.json")
    .then((r) => r.json())
    .then((data) => {
      DATA = data;
      init(data);
    })
    .catch((err) => {
      console.error("Could not load data/routes.json", err);
      const booking = $("#booking .wrap");
      if (booking) {
        const warn = document.createElement("p");
        warn.style.cssText = "color:#f0c419;background:#2a1200;padding:14px 18px;border-radius:10px;";
        warn.textContent =
          "Booking data failed to load. If you're previewing this file directly from disk, serve it over a local server instead (e.g. `npx serve` or `python3 -m http.server`) — browsers block JSON loading from file:// URLs.";
        booking.prepend(warn);
      }
    });

  function init(data) {
    // wire static bits
    $("#year").textContent = new Date().getFullYear();
    $("#footerEmail").textContent = data.company.email;
    const waHref = (msg) => `https://wa.me/${data.company.whatsapp}?text=${encodeURIComponent(msg)}`;
    $("#contactWaBtn").href = waHref("Hi Abyssinia Luxury Coach, I'd like some help with a booking.");
    $("#floatWaBtn").href = waHref("Hi Abyssinia Luxury Coach, I'd like some help with a booking.");

    // travel date default = next real departure day, min = today
    const dateInput = $("#travelDate");
    const today = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    dateInput.min = iso(today);

    state.routeId = data.routes[0].id;
    state.classId = data.classes[0].id;

    dateInput.value = iso(nextDepartureDate(data.routes[0], today));

    renderDirectionToggle(data);
    renderClassOptions(data);
    renderTimeOptions(data);
    renderDaysNote(data);
    renderSeatGrid(data);
    renderFareCards(data);
    renderJourney(data);
    renderOffices(data);
    updateTotals(data);
    generateTicketCode();

    dateInput.addEventListener("change", () => renderDaysNote(data));
    $("#passengerName").addEventListener("input", () => updateWhatsappState(data));
    $("#passengerPhone").addEventListener("input", () => updateWhatsappState(data));
    $("#passengerCount").addEventListener("change", () => {
      const max = parseInt($("#passengerCount").value, 10);
      if (state.selectedSeats.length > max) {
        state.selectedSeats = state.selectedSeats.slice(0, max);
        renderSeatGrid(data);
        updateTotals(data);
      }
    });
    $("#whatsappBtn").addEventListener("click", (e) => {
      e.preventDefault();
      sendToWhatsapp(data);
    });
  }

  function currentRoute(data) {
    return data.routes.find((r) => r.id === state.routeId) || data.routes[0];
  }
  function currentClass(data) {
    return data.classes.find((c) => c.id === state.classId) || data.classes[0];
  }

  function renderDirectionToggle(data) {
    const el = $("#directionToggle");
    el.innerHTML = "";
    data.routes.forEach((route) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "direction-toggle-btn" + (route.id === state.routeId ? " active" : "");
      btn.innerHTML = `<strong>${route.from} → ${route.to}</strong><small>${route.duration}</small>`;
      btn.addEventListener("click", () => {
        state.routeId = route.id;
        state.selectedSeats = [];
        const dateInput = $("#travelDate");
        const chosen = new Date(dateInput.value + "T00:00:00");
        const dayAbbr = Object.keys(WEEKDAY_MAP).find((k) => WEEKDAY_MAP[k] === chosen.getDay());
        if (!route.departureDays.includes(dayAbbr)) {
          dateInput.value = nextDepartureDate(route, new Date()).toISOString().slice(0, 10);
        }
        renderDirectionToggle(data);
        renderTimeOptions(data);
        renderDaysNote(data);
        renderSeatGrid(data);
        renderJourney(data);
        updateTotals(data);
      });
      el.appendChild(btn);
    });
  }

  function renderClassOptions(data) {
    const el = $("#classOptions");
    el.innerHTML = "";
    const route = currentRoute(data);
    data.classes.forEach((cls) => {
      const price = route.fares[cls.id];
      const card = document.createElement("div");
      card.className = "class-card" + (cls.id === state.classId ? " active" : "");
      card.innerHTML = `
        <div>
          <div class="name">${cls.name} <span style="color:var(--muted);font-weight:500;">(${cls.layout})</span></div>
          <div class="perks">${cls.perks[0]}</div>
        </div>
        <div class="price">KES ${price.toLocaleString()}</div>
      `;
      card.addEventListener("click", () => {
        state.classId = cls.id;
        state.selectedSeats = [];
        renderClassOptions(data);
        renderSeatGrid(data);
        updateTotals(data);
      });
      el.appendChild(card);
    });
  }

  function renderTimeOptions(data) {
    const el = $("#timeOptions");
    el.innerHTML = "";
    const route = currentRoute(data);
    route.departureTimes.forEach((t, i) => {
      if (i === 0) state.timeId = t.id;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "time-chip" + (i === 0 ? " active" : "");
      chip.textContent = `${t.time} · ${t.label}`;
      chip.addEventListener("click", () => {
        state.timeId = t.id;
        $$(".time-chip", el).forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
      });
      el.appendChild(chip);
    });
  }

  function renderDaysNote(data) {
    const route = currentRoute(data);
    const note = $("#daysNote");
    note.innerHTML = `Departs <strong>${route.departureDays.join(", ")}</strong> from ${route.boardingPoint}.`;
    const dateInput = $("#travelDate");
    if (dateInput.value) {
      const chosen = new Date(dateInput.value + "T00:00:00");
      const dayAbbr = Object.keys(WEEKDAY_MAP).find((k) => WEEKDAY_MAP[k] === chosen.getDay());
      if (!route.departureDays.includes(dayAbbr)) {
        note.innerHTML += ` <span style="color:var(--crimson)">Note: we don't depart on that day — pick ${route.departureDays.join("/")}.</span>`;
      }
    }
  }

  function renderSeatGrid(data) {
    const cls = currentClass(data);
    const route = currentRoute(data);
    const booked = new Set(data.demoBookedSeats[cls.id] || []);
    const grid = $("#seatGrid");
    grid.innerHTML = "";

    const colsPerSide = cls.layout === "2-1" ? [2, 1] : [2, 2];
    const totalCols = colsPerSide[0] + colsPerSide[1] + 1; // +1 aisle
    const letters = "ABCDEFGH".split("");
    const leftLetters = letters.slice(0, colsPerSide[0]);
    const rightLetters = letters.slice(colsPerSide[0], colsPerSide[0] + colsPerSide[1]);

    for (let row = 1; row <= cls.rows; row++) {
      const rowEl = document.createElement("div");
      rowEl.className = "seat-row";
      rowEl.style.gridTemplateColumns = colsPerSide
        .map((n, i) => (i === 0 ? `repeat(${n}, 34px)` : `repeat(${n}, 34px)`))
        .join(" 20px ");
      [...leftLetters, "gap", ...rightLetters].forEach((letter) => {
        if (letter === "gap") {
          const gapEl = document.createElement("div");
          rowEl.appendChild(gapEl);
          return;
        }
        const seatId = `${row}${letter}`;
        const seatEl = document.createElement("button");
        seatEl.type = "button";
        seatEl.className = "seat";
        seatEl.textContent = seatId;
        if (booked.has(seatId)) {
          seatEl.classList.add("booked");
          seatEl.disabled = true;
        }
        if (state.selectedSeats.includes(seatId)) seatEl.classList.add("selected");
        seatEl.addEventListener("click", () => toggleSeat(data, seatId));
        rowEl.appendChild(seatEl);
      });
      grid.appendChild(rowEl);
    }

    // last row, full bench
    const lastRow = document.createElement("div");
    lastRow.className = "seat-row";
    lastRow.style.gridTemplateColumns = `repeat(${cls.lastRowSeats}, 34px)`;
    for (let i = 0; i < cls.lastRowSeats; i++) {
      const seatId = `R${i + 1}`;
      const seatEl = document.createElement("button");
      seatEl.type = "button";
      seatEl.className = "seat";
      seatEl.textContent = seatId;
      if (booked.has(seatId)) {
        seatEl.classList.add("booked");
        seatEl.disabled = true;
      }
      if (state.selectedSeats.includes(seatId)) seatEl.classList.add("selected");
      seatEl.addEventListener("click", () => toggleSeat(data, seatId));
      lastRow.appendChild(seatEl);
    }
    grid.appendChild(lastRow);
  }

  function toggleSeat(data, seatId) {
    const max = parseInt($("#passengerCount").value, 10) || 1;
    const idx = state.selectedSeats.indexOf(seatId);
    if (idx > -1) {
      state.selectedSeats.splice(idx, 1);
    } else {
      if (state.selectedSeats.length >= max) {
        state.selectedSeats.shift();
      }
      state.selectedSeats.push(seatId);
    }
    renderSeatGrid(data);
    updateTotals(data);
  }

  function updateTotals(data) {
    const route = currentRoute(data);
    const cls = currentClass(data);
    const price = route.fares[cls.id];
    const count = state.selectedSeats.length;
    $("#totalFare").textContent = `KES ${(price * count).toLocaleString()}`;
    $("#selectedSummary").textContent = count
      ? `Seat${count > 1 ? "s" : ""} selected: ${state.selectedSeats.sort().join(", ")}`
      : "No seats selected yet.";
    updateWhatsappState(data);
  }

  function updateWhatsappState(data) {
    const name = $("#passengerName").value.trim();
    const phone = $("#passengerPhone").value.trim();
    const ready = name && phone && state.selectedSeats.length > 0;
    $("#whatsappBtn").disabled = !ready;
  }

  function sendToWhatsapp(data) {
    const route = currentRoute(data);
    const cls = currentClass(data);
    const time = route.departureTimes.find((t) => t.id === state.timeId) || route.departureTimes[0];
    const date = $("#travelDate").value;
    const name = $("#passengerName").value.trim();
    const phone = $("#passengerPhone").value.trim();
    const total = cls && route.fares[cls.id] * state.selectedSeats.length;
    const ticketCode = $("#ticketCode").dataset.code || "";

    const lines = [
      `Booking request — ${ticketCode}`,
      `Route: ${route.from} → ${route.to}`,
      `Date: ${date}`,
      `Departure: ${time ? time.time : "TBC"}`,
      `Class: ${cls.name}`,
      `Seat(s): ${state.selectedSeats.sort().join(", ")}`,
      `Total: KES ${total.toLocaleString()}`,
      `Name: ${name}`,
      `Phone: ${phone}`,
    ];
    const url = `https://wa.me/${data.company.whatsapp}?text=${encodeURIComponent(lines.join("\n"))}`;
    window.open(url, "_blank", "noopener");
  }

  function renderFareCards(data) {
    const el = $("#fareCards");
    el.innerHTML = "";
    data.routes.forEach((route) => {
      const card = document.createElement("div");
      card.className = "fare-card";
      const fareLines = data.classes
        .map(
          (cls) => `
        <div class="fare-line">
          <span class="cls">${cls.name}</span>
          <span class="price">KES ${route.fares[cls.id].toLocaleString()}</span>
        </div>`
        )
        .join("");
      card.innerHTML = `
        <div class="route-name">${route.from} → ${route.to}</div>
        <div class="route-meta">${route.distanceKm.toLocaleString()} km · ${route.duration}</div>
        <div class="stops">${route.stops.join("  ·  ")}</div>
        ${fareLines}
        <button class="btn btn-gold btn-block btn-sm book-this-route">Book this route</button>
      `;
      card.querySelector(".book-this-route").addEventListener("click", () => {
        state.routeId = route.id;
        state.selectedSeats = [];
        renderDirectionToggle(data);
        renderClassOptions(data);
        renderTimeOptions(data);
        renderDaysNote(data);
        renderSeatGrid(data);
        renderJourney(data);
        updateTotals(data);
        document.getElementById("booking").scrollIntoView({ behavior: "smooth" });
      });
      el.appendChild(card);
    });
  }

  function renderJourney(data) {
    const route = currentRoute(data);
    const el = $("#journeyLine");
    el.innerHTML = "";
    route.stops.forEach((stop, i) => {
      const stopEl = document.createElement("div");
      stopEl.className = "journey-stop";
      stopEl.innerHTML = `<div class="dot"></div><h4 style="color:#fff">${stop}</h4><span>${
        i === 0 ? "Boarding point" : i === route.stops.length - 1 ? "Final stop" : "Stop " + i
      }</span>`;
      el.appendChild(stopEl);
    });
  }

  function renderOffices(data) {
    const el = $("#officesCard");
    el.innerHTML = data.company.offices
      .map(
        (o) => `
      <div class="office">
        <h4>${o.city} office</h4>
        <p>${o.address}</p>
        <p>${o.hours}</p>
      </div>`
      )
      .join("");
  }

  function generateTicketCode() {
    const code = "ALC-" + Math.random().toString(36).slice(2, 8).toUpperCase();
    const el = $("#ticketCode");
    el.textContent = `Reference ${code}`;
    el.dataset.code = code;
  }

  // mobile nav
  const navToggle = document.getElementById("navToggle");
  const navLinks = document.getElementById("navLinks");
  navToggle.addEventListener("click", () => {
    const open = navLinks.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(open));
  });
  $$("#navLinks a").forEach((a) =>
    a.addEventListener("click", () => {
      navLinks.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
    })
  );
})();
