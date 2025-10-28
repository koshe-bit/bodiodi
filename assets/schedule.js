// ======= CONFIG =======
const CALENDAR_ID =
  "104b8c581baad0960307efc991a3296289a2ed2d6abfd193aae1b103eecd0819@group.calendar.google.com";
const API_KEY = "AIzaSyCrEWVrSotulVDC50Ta7-JU1_I4wLVa9rw"; // Restrict to your domain in Google Cloud

// Optional: title fragment → booking URL mapping (fallback if no URL in description)
const BOOKING_LINKS = {
  anabolix: "https://your-booking-site.com/anabolix",
  flexion: "https://your-booking-site.com/flexion",
  kinetix: "https://your-booking-site.com/kinetix",
  tonnix: "https://your-booking-site.com/tonnix",
  rhythmix: "https://your-booking-site.com/rhythmix",
};

// ======= HELPERS =======
const $ = (sel) => document.querySelector(sel);
const $make = (tag, cls) => { const el = document.createElement(tag); if (cls) el.className = cls; return el; };

function startOfWeek(d) { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0,0,0,0); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function iso(d) { return d.toISOString(); }
function hhmm(d) { return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
function dayLabel(d, long=false) { return d.toLocaleDateString("en-US", { weekday: long?"long":"short", month: "short", day: "numeric" }); }
function slugify(s){return s.toLowerCase().replace(/[^a-z0-9\s-]/g,"").trim().replace(/\s+/g,"-");}

function parseMeta(desc){
  if(!desc) return {};
  const out = {};
  const lines = desc.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  for(const line of lines){
    const lc = line.toLowerCase();
    if(lc.startsWith("instructor:")) out.instructor = line.split(":")[1]?.trim();
    else if(lc.startsWith("difficulty:")) out.difficulty = line.split(":")[1]?.trim();
    else if(/^https?:\/\//.test(line) && !out.bookingUrl) out.bookingUrl = line; // first URL wins
  }
  return out;
}
function findBookingUrlByTitle(title){
  const t = title.toLowerCase();
  for(const key of Object.keys(BOOKING_LINKS)){ if(t.includes(key)) return BOOKING_LINKS[key]; }
  return null;
}

// ======= DATA FETCH =======
async function fetchEvents(timeMinISO, timeMaxISO){
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
  if(!res.ok) throw new Error(`Calendar API error ${res.status}`);
  const json = await res.json();
  const items = json.items || [];
  return items.map(e=>{
    const startStr = e.start?.dateTime || (e.start?.date ? `${e.start.date}T00:00:00` : null);
    const endStr   = e.end?.dateTime   || (e.end?.date   ? `${e.end.date}T23:59:59` : null);
    if(!startStr || !endStr) return null;
    const meta = parseMeta(e.description || "");
    return {
      id: e.id,
      title: e.summary || "(No title)",
      htmlLink: e.htmlLink,
      start: new Date(startStr),
      end: new Date(endStr),
      location: e.location || "",
      instructor: meta.instructor,
      difficulty: meta.difficulty,
      bookingUrl: meta.bookingUrl || findBookingUrlByTitle(e.summary || ""),
      description: e.description || ""
    };
  }).filter(Boolean);
}

function groupByDay(events){
  const out = {};
  for(const ev of events){
    const k = ev.start.toISOString().slice(0,10);
    (out[k] ||= []).push(ev);
  }
  return out;
}

// ======= RENDERING =======
const HOURS = Array.from({length:15}, (_,i)=>5+i); // 5 → 19

function renderWeekGrid(weekDays, grouped, todayKey){
  const grid = $("#week-grid");
  grid.innerHTML = "";

  // corner
  grid.appendChild($make("div"));

  // headers
  for(const d of weekDays){
    const hdr = $make("div","week-colhdr");
    const tag = $make("div","tag");
    tag.textContent = dayLabel(d);
    hdr.appendChild(tag);
    grid.appendChild(hdr);
  }

  // rows
  for(const h of HOURS){
    // hour label
    const hl = $make("div","hourlbl");
    hl.textContent = `${h}:00`;
    grid.appendChild(hl);

    for(const d of weekDays){
      const key = d.toISOString().slice(0,10);
      const cell = $make("div","cell");
      if(key === todayKey) cell.classList.add("today");

      const evs = (grouped[key]||[]).filter(e => {
        const sh = e.start.getHours(), eh = e.end.getHours();
        return sh===h || (sh < h && eh > h);
      });

      for(const e of evs){
        const minutesFromHourStart = Math.max(0, e.start.getMinutes());
        const durationMin = Math.max(30, (e.end - e.start)/60000);
        const top = (minutesFromHourStart/60)*parseInt(getComputedStyle(document.documentElement).getPropertyValue("--hourHeight"));
        const height = (durationMin/60)*parseInt(getComputedStyle(document.documentElement).getPropertyValue("--hourHeight"));

        const block = $make("div","event");
        block.style.top = `${top}px`;
        block.style.height = `${height}px`;

        const left = $make("div");
        const title = $make("h3","event-title");
        const slug = slugify(e.title);
        title.innerHTML = `<a href="/classes.html#${slug}">${e.title}</a>`;
        const meta = $make("div","event-meta");
        meta.textContent = `${hhmm(e.start)}–${hhmm(e.end)}${e.location?` · ${e.location}`:""}`;
        const chips = $make("div","chips");
        if(e.instructor){ const c=$make("span","chip"); c.textContent = `Instructor: ${e.instructor}`; chips.appendChild(c); }
        if(e.difficulty){ const c=$make("span","chip"); c.textContent = `Level: ${e.difficulty}`; chips.appendChild(c); }

        left.appendChild(title); left.appendChild(meta); if(chips.childNodes.length) left.appendChild(chips);

        const actions = $make("div","actions");
        if(e.bookingUrl){ const a=$make("a","act primary"); a.href=e.bookingUrl; a.target="_blank"; a.rel="noreferrer"; a.textContent="Reserve"; actions.appendChild(a); }
        const g=$make("a","act"); g.href=e.htmlLink; g.target="_blank"; g.rel="noreferrer"; g.textContent="Add to GCal"; actions.appendChild(g);

        block.appendChild(left);
        block.appendChild(actions);

        // in-view animation
        observe(block);

        cell.appendChild(block);
      }

      grid.appendChild(cell);
    }
  }
}

function renderDayView(todayKey, grouped){
  const day = $("#day-view");
  day.innerHTML = "";
  const items = (grouped[todayKey]||[]).sort((a,b)=>a.start-b.start);

  if(items.length===0){
    const none = $make("div","status");
    none.textContent = "No classes today. Try the Week view →";
    day.appendChild(none);
    return;
  }

  for(const e of items){
    const card = $make("div","day-card");
    const left = $make("div");
    const title = $make("h3","event-title");
    const slug = slugify(e.title);
    title.innerHTML = `<a href="/classes.html#${slug}">${e.title}</a>`;
    const meta = $make("div","event-meta");
    meta.textContent = `${hhmm(e.start)}–${hhmm(e.end)}${e.location?` · ${e.location}`:""}`;

    const chips = $make("div","chips");
    if(e.instructor){ const c=$make("span","chip"); c.textContent = `Instructor: ${e.instructor}`; chips.appendChild(c); }
    if(e.difficulty){ const c=$make("span","chip"); c.textContent = `Level: ${e.difficulty}`; chips.appendChild(c); }

    left.appendChild(title); left.appendChild(meta); if(chips.childNodes.length) left.appendChild(chips);

    const actions = $make("div","actions");
    if(e.bookingUrl){ const a=$make("a","act primary"); a.href=e.bookingUrl; a.target="_blank"; a.rel="noreferrer"; a.textContent="Reserve"; actions.appendChild(a); }
    const g=$make("a","act"); g.href=e.htmlLink; g.target="_blank"; g.rel="noreferrer"; g.textContent="Add to GCal"; actions.appendChild(g);

    card.appendChild(left); card.appendChild(actions);
    observe(card);
    day.appendChild(card);
  }
}

// IntersectionObserver for scroll-in motion
const io = new IntersectionObserver((entries)=>{
  entries.forEach(en=>{
    if(en.isIntersecting){ en.target.classList.add("in"); io.unobserve(en.target); }
  });
},{threshold:.1});
function observe(el){ io.observe(el); }

// ======= STATE / WIRES =======
let anchor = startOfWeek(new Date());
let mode = "day"; // "day" | "week"

const weekDays = ()=> Array.from({length:7},(_,i)=>addDays(anchor,i));
const weekMin = ()=> iso(weekDays()[0]);
const weekMax = ()=> iso(addDays(weekDays()[6],1));
const today = new Date();
const todayKey = today.toISOString().slice(0,10);

function setWeekRangeLabel(){
  $("#week-range").textContent = `${dayLabel(weekDays()[0])} – ${dayLabel(weekDays()[6])}`;
}

async function loadAndRender(){
  setWeekRangeLabel();
  $("#status").textContent = "Loading calendar…";
  try{
    const events = await fetchEvents(weekMin(), weekMax());
    const grouped = groupByDay(events);
    $("#status").textContent = "";

    if(mode==="day") renderDayView(todayKey, grouped);
    if(mode==="week") renderWeekGrid(weekDays(), grouped, todayKey);
  }catch(err){
    $("#status").textContent = `Error: ${err?.message||"Failed to load calendar"}`;
  }
}

// View toggle buttons
$("#btn-day").addEventListener("click", ()=>{ mode="day"; $("#btn-day").classList.add("active"); $("#btn-week").classList.remove("active"); $("#week-view").style.display="none"; $("#day-view").style.display="grid"; loadAndRender(); });
$("#btn-week").addEventListener("click", ()=>{ mode="week"; $("#btn-week").classList.add("active"); $("#btn-day").classList.remove("active"); $("#day-view").style.display="none"; $("#week-view").style.display="block"; loadAndRender(); });

// Week nav
$("#btn-prev").addEventListener("click", ()=>{ anchor = addDays(anchor,-7); loadAndRender(); });
$("#btn-next").addEventListener("click", ()=>{ anchor = addDays(anchor, 7); loadAndRender(); });
$("#btn-today").addEventListener("click", ()=>{ anchor = startOfWeek(new Date()); loadAndRender(); });

// Initial state
document.addEventListener("DOMContentLoaded", ()=>{
  // default to Day view, show Today
  $("#week-view").style.display="none";
  $("#day-view").style.display="grid";
  loadAndRender();
});
