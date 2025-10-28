/* ============================================================
   Bodiodi — Schedule (functional)
   - Week & Day views
   - Prev / Next / This week
   - Google Calendar JSON API (public calendar)
   - Reserve → sign-up.html
   ============================================================ */

/* ===== CONFIG ===== */
const CALENDAR_ID = "104b8c581baad0960307efc991a3296289a2ed2d6abfd193aae1b103eecd0819@group.calendar.google.com"; // <— replace
const API_KEY     = "AIzaSyCrEWVrSotulVDC50Ta7-JU1_I4wLVa9rw";                         // <— replace
const RESERVE_URL = "sign-up.html";                                // unified Reserve link

/* ===== Helpers ===== */
const $ = (id) => document.getElementById(id);

function startOfWeek(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Mon=0
  x.setDate(x.getDate() - day);
  x.setHours(0,0,0,0);
  return x;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function toISO(d) { return d.toISOString(); }
function hhmm(d) { return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
function dayKey(d) { return d.toISOString().slice(0,10); }
function fmtDayLabel(d) {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function clamp(min, v, max){ return Math.max(min, Math.min(v, max)); }

/* Parse optional metadata from Description
   Example:
     Instructor: Nicole
     Difficulty: All Levels
*/
function parseMeta(desc = "") {
  const meta = {};
  const lines = String(desc).split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*(Instructor|Difficulty)\s*:\s*(.+)\s*$/i);
    if (m) meta[m[1].toLowerCase()] = m[2].trim();
  }
  return meta; // { instructor?, difficulty? }
}

/* ===== Fetch from Google Calendar ===== */
async function fetchEvents(timeMinISO, timeMaxISO) {
  const params = new URLSearchParams({
    key: API_KEY,
    singleEvents: "true",
    orderBy: "startTime",
    timeMin: timeMinISO,
    timeMax: timeMaxISO,
    maxResults: "2500",
  });
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Calendar API error ${res.status}`);
  const json = await res.json();
  return (json.items || []).map(normalizeEvent).filter(Boolean);
}

function normalizeEvent(e) {
  const startStr = e.start?.dateTime || (e.start?.date ? `${e.start.date}T00:00:00` : null);
  const endStr   = e.end?.dateTime   || (e.end?.date   ? `${e.end.date}T23:59:59` : null);
  if (!startStr || !endStr) return null;
  const meta = parseMeta(e.description || "");
  return {
    id: e.id,
    title: e.summary || "(No title)",
    htmlLink: e.htmlLink,
    start: new Date(startStr),
    end: new Date(endStr),
    location: e.location || "",
    description: e.description || "",
    instructor: meta.instructor || "",
    difficulty: meta.difficulty || "",
  };
}

function groupByDay(events) {
  const out = {};
  for (const ev of events) {
    const k = dayKey(ev.start);
    (out[k] ||= []).push(ev);
  }
  // sort within each day
  for (const k of Object.keys(out)) {
    out[k].sort((a,b) => a.start - b.start);
  }
  return out;
}

/* ===== State ===== */
let viewMode = "week";               // "week" | "day"
let anchor   = startOfWeek(new Date());  // Monday of the shown week
let events   = [];                   // fetched events for the current interval
let grouped  = {};                   // events grouped by day

/* ===== DOM targets ===== */
const mount  = $("calendar");
const statusEl = $("status");

/* ===== Render ===== */
async function render() {
  // figure out time window to fetch (week span gives a smoother UX)
  const weekStart = startOfWeek(anchor);
  const weekEnd   = addDays(weekStart, 7);

  // show range/status
  const rangeLabel = `${fmtDayLabel(weekStart)} – ${fmtDayLabel(addDays(weekStart, 6))}`;

  try {
    statusEl.textContent = "Loading…";
    // fetch
    events  = await fetchEvents(toISO(weekStart), toISO(weekEnd));
    grouped = groupByDay(events);
    statusEl.textContent = "";

    // draw
    mount.innerHTML = "";
    if (viewMode === "week") {
      renderWeek(weekStart);
    } else {
      renderDay(anchor);
    }

    // add subtle "in" class for CSS motion
    requestAnimationFrame(() => {
      mount.querySelectorAll(".event,.day-card").forEach(el => el.classList.add("in"));
    });

  } catch (err) {
    console.error(err);
    statusEl.textContent = `Error: ${err.message || err}`;
  }
}

/* ===== Week view ===== */
const HOURS = Array.from({ length: 15 }, (_, i) => 5 + i); // 5:00–19:00

function renderWeek(weekStart) {
  const wrap = document.createElement("div");
  wrap.className = "week-view";

  // header: day labels
  const grid = document.createElement("div");
  grid.className = "week-grid";

  // Corner
  grid.appendChild(document.createElement("div"));

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  for (const d of days) {
    const h = document.createElement("div");
    h.className = "week-colhdr";
    h.innerHTML = `<span class="tag">${fmtDayLabel(d)}</span>`;
    grid.appendChild(h);
  }

  for (const h of HOURS) {
    // hour label
    const hour = document.createElement("div");
    hour.className = "hourlbl";
    hour.textContent = `${h}:00`;
    grid.appendChild(hour);

    for (const d of days) {
      const key = dayKey(d);
      const cell = document.createElement("div");
      cell.className = "cell";
      if (dayKey(new Date()) === key) cell.classList.add("today");

      const list = (grouped[key] || []).filter(ev =>
        ev.start.getHours() === h || (ev.start.getHours() < h && ev.end.getHours() > h)
      );

      for (const ev of list) {
        const minutesFromHour = clamp(0, ev.start.getMinutes(), 59);
        const durMin = Math.max(30, (ev.end - ev.start) / 60000);
        const top = (minutesFromHour / 60) * 64;       // 64px per hour (matches --hourHeight)
        const height = (durMin / 60) * 64;

        const card = document.createElement("div");
        card.className = "event";
        card.style.top = `${top}px`;
        card.style.height = `${height}px`;
        card.innerHTML = eventCardHTML(ev);
        cell.appendChild(card);
      }

      grid.appendChild(cell);
    }
  }

  wrap.appendChild(grid);
  mount.appendChild(wrap);
}

/* ===== Day view ===== */
function renderDay(day) {
  const container = document.createElement("section");
  container.className = "day-view";

  const key = dayKey(day);
  const list = (grouped[key] || []).sort((a, b) => a.start - b.start);

  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "status";
    empty.textContent = `No classes for ${fmtDayLabel(day)}.`;
    container.appendChild(empty);
  } else {
    for (const ev of list) {
      const card = document.createElement("div");
      card.className = "day-card";
      card.innerHTML = `
        <div>
          <div class="event-title"><a href="classes.html">${ev.title}</a></div>
          <div class="event-meta">${hhmm(ev.start)}–${hhmm(ev.end)}${ev.location ? ` · ${ev.location}` : ""}</div>
          <div class="chips">
            ${ev.instructor ? `<span class="chip">Instructor: ${ev.instructor}</span>` : ""}
            ${ev.difficulty ? `<span class="chip">Difficulty: ${ev.difficulty}</span>` : ""}
          </div>
        </div>
        <div class="actions">
          <a class="act primary" href="${RESERVE_URL}">Reserve</a>
          <a class="act" target="_blank" rel="noreferrer" href="${ev.htmlLink}">Add to GCal</a>
        </div>
      `;
      container.appendChild(card);
    }
  }

  mount.appendChild(container);
}

/* ===== Shared event card template (week view) ===== */
function eventCardHTML(ev) {
  const chips = [];
  if (ev.instructor) chips.push(`<span class="chip">Instructor: ${ev.instructor}</span>`);
  if (ev.difficulty) chips.push(`<span class="chip">Difficulty: ${ev.difficulty}</span>`);

  return `
    <div class="flex">
      <div>
        <h4 class="event-title"><a href="classes.html">${ev.title}</a></h4>
        <div class="event-meta">${hhmm(ev.start)}–${hhmm(ev.end)}${ev.location ? ` · ${ev.location}` : ""}</div>
        <div class="chips">${chips.join("")}</div>
      </div>
      <div class="actions">
        <a class="act primary" href="${RESERVE_URL}">Reserve</a>
        <a class="act" target="_blank" rel="noreferrer" href="${ev.htmlLink}">Add to GCal</a>
      </div>
    </div>
  `;
}

/* ===== Controls wiring ===== */
(function controls(){
  const prevBtn = $("prevBtn"), nextBtn = $("nextBtn"), todayBtn = $("todayBtn");
  const weekBtn = $("weekViewBtn"), dayBtn = $("dayViewBtn");

  const setActive = () => {
    weekBtn?.classList.toggle("active", viewMode === "week");
    dayBtn?.classList.toggle("active",  viewMode === "day");
    weekBtn?.setAttribute("aria-selected", viewMode === "week" ? "true" : "false");
    dayBtn?.setAttribute("aria-selected",  viewMode === "day"  ? "true" : "false");
  };

  prevBtn?.addEventListener("click", () => {
    anchor = addDays(anchor, viewMode === "week" ? -7 : -1);
    render();
  });
  nextBtn?.addEventListener("click", () => {
    anchor = addDays(anchor, viewMode === "week" ?  7 :  1);
    render();
  });
  todayBtn?.addEventListener("click", () => {
    anchor = viewMode === "week" ? startOfWeek(new Date()) : new Date();
    render();
  });

  weekBtn?.addEventListener("click", () => {
    viewMode = "week";
    anchor = startOfWeek(anchor); // snap anchor to week
    setActive(); render();
  });
  dayBtn?.addEventListener("click", () => {
    viewMode = "day";
    // keep same calendar range already fetched; just show anchor day
    setActive(); render();
  });

  setActive();
})();

/* ===== Kickoff ===== */
render();
