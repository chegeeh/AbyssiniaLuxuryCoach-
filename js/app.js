/* ============================================================
   ABYSSINIA LUXURY COACH — booking logic
   All routes, fares, services and stops are read from data/routes.json.
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
    from: null,
    to: null,
    selectedSeats: [],
  };

  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

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

  // ---------- helpers ----------

  function findLeg(data, from, to) {
    return data.routes.find(
      (r) => (r.from === from && r.to === to) || (r.from === to && r.to === from)
    );
  }

  function allTowns(data) {
    const set = new Set();
    data.routes.forEach((r) => {
      set.add(r.from);
      set.add(r.to);
    });
    const ordered = data.corridorOrder.filter((t) => set.has(t));
    const rest = [...set].filter((t) => !ordered.includes(t)).sort();
    return [...ordered, ...rest];
  }

  function destinationsFrom(data, origin) {
    const set = new Set();
    data.routes.forEach((r) => {
      if (r.from === origin) set.add(r.to);
      if (r.to === origin) set.add(r.from);
    });
    const ordered = data.corridorOrder.filter((t) => set.has(t));
    const rest = [...set].filter((t) => !ordered.includes(t)).sort();
    return [...ordered, ...rest];
  }

  function init(data) {
    $("#year").textContent = new Date().getFullYear();
    $("#footerEmail").textContent = data.company.email;
    $("#footerCall").textContent = "Call: " + data.company.callPhoneDisplay;

    const waHref = (msg) => `https://wa.me/${data.company.whatsapp}?text=${encodeURIComponent(msg)}`;
    $("#contactWaBtn").href = waHref("Hi Abyssinia Luxury Coach, I'd like some help with a booking.");
    $("#floatWaBtn").href = waHref("Hi Abyssinia Luxury Coach, I'd like some help with a booking.");
    $("#contactCallBtn").href = `tel:+${data.company.callPhone}`;
    $("#contactCallLabel").textContent = data.company.callPhoneDisplay;

    const dateInput = $("#travelDate");
    const today = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    dateInput.min = iso(today);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateInput.value = iso(tomorrow);

    state.from = data.routes[0].from;
    state.to = data.routes[0].to;

    populateFromSelect(data);
    populateToSelect(data);
    renderRouteInfo(data);
    renderSeatGrid(data);
    renderFareTables(data);
    renderJourney(data);
    renderOffices(data);
    updateTotals(data);
    generateTicketCode();

    $("#fromSelect").addEventListener("change", (e) => {
      state.from = e.target.value;
      const dests = destinationsFrom(data, state.from);
      if (!dests.includes(state.to)) state.to = dests[0];
      populateToSelect(data);
      state.selectedSeats = [];
      renderRouteInfo(data);
      renderSeatGrid(data);
      updateTotals(data);
    });
    $("#toSelect").addEventListener("change", (e) => {
      state.to = e.target.value;
      state.selectedSeats = [];
      renderRouteInfo(data);
      renderSeatGrid(data);
      updateTotals(data);
    });
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

  function populateFromSelect(data) {
    const el = $("#fromSelect");
    el.innerHTML = "";
    allTowns(data).forEach((town) => {
      const opt = document.createElement("option");
      opt.value = town;
      opt.textContent = town;
      if (town === state.from) opt.selected = true;
      el.appendChild(opt);
    });
  }

  function populateToSelect(data) {
    const el = $("#toSelect");
    el.innerHTML = "";
    destinationsFrom(data, state.from).forEach((town) => {
      const opt = document.createElement("option");
      opt.value = town;
      opt.textContent = town;
      if (town === state.to) opt.selected = true;
      el.appendChild(opt);
    });
  }

  function currentLeg(data) {
    return findLeg(data, state.from, state.to);
  }

  function departureNote(service, from, to) {
    if (service.departures[from]) return `Departs ${from} ${service.departures[from]}`;
    if (service.departures[to]) return `Confirm exact ${from} pick-up time on booking (coach reaches ${to} around ${service.departures[to]})`;
    return "Pick-up time confirmed on booking";
  }

  function renderRouteInfo(data) {
    const leg = currentLeg(data);
    const el = $("#routeInfoCard");
    if (!leg) {
      el.innerHTML = `<div class="route-info-card warn">We don't have a published fare for ${state.from} → ${state.to} yet. <a href="#contact" style="color:var(--crimson);font-weight:700;">Message us on WhatsApp</a> and we'll confirm it directly.</div>`;
      return;
    }
    const service = data.services.find((s) => s.id === leg.serviceId);
    const timeNote = departureNote(service, state.from, state.to);
    el.innerHTML = `
      <div class="route-info-card">
        <div class="route-info-top">
          <span class="route-info-fare">KES ${leg.fare.toLocaleString()}</span>
          <span class="route-info-per">per seat, one way</span>
        </div>
        <p class="route-info-service">${service.name}</p>
        <p class="route-info-time">${timeNote}</p>
        <p class="route-info-note">${service.note}</p>
      </div>`;
  }

  function renderSeatGrid(data) {
    const v = data.vehicle;
    const booked = new Set(data.demoBookedSeats || []);
    const grid = $("#seatGrid");
    grid.innerHTML = "";

    const colsPerSide = v.layout === "2-1" ? [2, 1] : [2, 2];
    const letters = "ABCDEFGH".split("");
    const leftLetters = letters.slice(0, colsPerSide[0]);
    const rightLetters = letters.slice(colsPerSide[0], colsPerSide[0] + colsPerSide[1]);

    for (let row = 1; row <= v.rows; row++) {
      const rowEl = document.createElement("div");
      rowEl.className = "seat-row";
      rowEl.style.gridTemplateColumns = colsPerSide.map((n) => `repeat(${n}, 34px)`).join(" 20px ");
      [...leftLetters, "gap", ...rightLetters].forEach((letter) => {
        if (letter === "gap") {
          rowEl.appendChild(document.createElement("div"));
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

    const lastRow = document.createElement("div");
    lastRow.className = "seat-row";
    lastRow.style.gridTemplateColumns = `repeat(${v.lastRowSeats}, 34px)`;
    for (let i = 0; i < v.lastRowSeats; i++) {
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
      if (state.selectedSeats.length >= max) state.selectedSeats.shift();
      state.selectedSeats.push(seatId);
    }
    renderSeatGrid(data);
    updateTotals(data);
  }

  function updateTotals(data) {
    const leg = currentLeg(data);
    const fare = leg ? leg.fare : 0;
    const count = state.selectedSeats.length;
    $("#totalFare").textContent = `KES ${(fare * count).toLocaleString()}`;
    $("#selectedSummary").textContent = count
      ? `Seat${count > 1 ? "s" : ""} selected: ${state.selectedSeats.sort().join(", ")}`
      : "No seats selected yet.";
    updateWhatsappState(data);
  }

  function updateWhatsappState(data) {
    const leg = currentLeg(data);
    const name = $("#passengerName").value.trim();
    const phone = $("#passengerPhone").value.trim();
    const ready = !!leg && name && phone && state.selectedSeats.length > 0;
    $("#whatsappBtn").disabled = !ready;
  }

  function sendToWhatsapp(data) {
    const leg = currentLeg(data);
    if (!leg) return;
    const service = data.services.find((s) => s.id === leg.serviceId);
    const date = $("#travelDate").value;
    const name = $("#passengerName").value.trim();
    const phone = $("#passengerPhone").value.trim();
    const total = leg.fare * state.selectedSeats.length;
    const ticketCode = $("#ticketCode").dataset.code || "";
    const depTime = departureNote(service, state.from, state.to);

    const lines = [
      `Booking request — ${ticketCode}`,
      `Route: ${state.from} → ${state.to}`,
      `Date: ${date}`,
      `Departure: ${depTime}`,
      `Service: ${service.name}`,
      `Seat(s): ${state.selectedSeats.sort().join(", ")}`,
      `Total: KES ${total.toLocaleString()}`,
      `Name: ${name}`,
      `Phone: ${phone}`,
    ];
    const url = `https://wa.me/${data.company.whatsapp}?text=${encodeURIComponent(lines.join("\n"))}`;
    window.open(url, "_blank", "noopener");
  }

  function renderFareTables(data) {
    const el = $("#fareTables");
    el.innerHTML = "";
    const groups = {};
    data.routes.forEach((r) => {
      groups[r.source] = groups[r.source] || [];
      groups[r.source].push(r);
    });
    Object.keys(groups).forEach((source) => {
      const block = document.createElement("div");
      block.className = "fare-table-block";
      const rows = groups[source]
        .map(
          (r) => `
        <div class="fare-row">
          <span class="leg">${r.from} → ${r.to}</span>
          <span class="price">KES ${r.fare.toLocaleString()}</span>
        </div>`
        )
        .join("");
      block.innerHTML = `<h3 class="fare-table-title">${source}</h3><div class="fare-table">${rows}</div>`;
      el.appendChild(block);
    });
  }

  function renderJourney(data) {
    const el = $("#journeyLine");
    el.innerHTML = "";
    data.corridorOrder.forEach((stop, i) => {
      const stopEl = document.createElement("div");
      stopEl.className = "journey-stop";
      stopEl.innerHTML = `<div class="dot"></div><h4 style="color:#fff">${stop}</h4><span>${
        i === 0 ? "Boarding point" : i === data.corridorOrder.length - 1 ? "Final stop" : "Stop " + i
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
