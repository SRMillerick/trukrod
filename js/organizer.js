/* ==========================================================================
   TRUKROD — organizer.js
   Drag-and-drop curation tool. Produces order.json for the public site.
   Workflow: open organizer.html -> arrange -> Export -> save as js/order.json
   ========================================================================== */

const DRAFT_KEY = "trukrod-order-draft";

/* default chapters (filename-number ranges) — mirrors main.js defaults */
const DEFAULT_CHAPTERS = [
  { name: "The Vision",     from: 1600, to: 1899, blurb: "The truck as it came home — torn down, dreamed over, planned out." },
  { name: "Bare Metal",     from: 1900, to: 2599, blurb: "Fabrication and metalwork. Cutting, welding, shaping — the long middle." },
  { name: "Bones & Heart",  from: 2600, to: 2999, blurb: "Chassis, drivetrain, and the thousand parts nobody sees but everybody feels." },
  { name: "Fine Details",   from: 3000, to: 3199, blurb: "Trim, fit, and finish — where patience becomes craftsmanship." },
  { name: "Paint & Chrome", from: 3200, to: 4049, blurb: "Color laid down, chrome hung, the truck becoming itself." },
  { name: "The Reveal",     from: 4050, to: 9999, blurb: "Finished. Running. Ready for Las Vegas." },
];

const $ = (s) => document.querySelector(s);
const num = (id) => parseInt(id.replace(/\D/g, ""), 10);

let byId = {};          // id -> photo entry (thumb, full)
let ALL = [];           // ordered manifest ids
let state = null;       // { chapters: [{name, blurb, photos:[]}], unfiled: [] }
let dragged = null;
let selected = null;

/* ---------- state loading ---------- */

function defaultState() {
  const chapters = DEFAULT_CHAPTERS.map((c) => ({
    name: c.name, blurb: c.blurb, from: c.from, to: c.to, photos: [],
  }));
  const unfiled = [];
  for (const id of ALL) {
    const n = num(id);
    const c = chapters.find((c) => n >= c.from && n <= c.to);
    (c ? c.photos : unfiled).push(id);
  }
  return { chapters, unfiled };
}

/* make a saved state safe: strip unknown ids, push missing ids to unfiled,
   drop empty chapters */
function normalize(saved) {
  try {
    const chapters = (saved.chapters || [])
      .map((c) => ({
        name: String(c.name || "Chapter"),
        blurb: String(c.blurb || ""),
        photos: (c.photos || []).filter((id) => byId[id]),
      }));
    const seen = new Set(chapters.flatMap((c) => c.photos));
    const unfiled = ALL.filter((id) => !seen.has(id));
    const out = {
      chapters: chapters.filter((c) => c.photos.length > 0),
      unfiled,
    };
    if (!out.chapters.length && !out.unfiled.length) return null;
    return out;
  } catch {
    return null;
  }
}

async function boot() {
  const res = await fetch("js/manifest.json");
  const manifest = await res.json();
  byId = Object.fromEntries(manifest.map((p) => [p.id, p]));
  ALL = manifest.map((p) => p.id);

  /* load priority: browser draft > order.json > filename defaults */
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch {}
  if (!saved) {
    try {
      const r = await fetch("js/order.json");
      if (r.ok) saved = await r.json();
    } catch {}
  }
  state = (saved && normalize(saved)) || defaultState();
  renderAll();
}

/* ---------- persistence ---------- */

function saveDraft() {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
}

function syncFromDOM() {
  state = {
    chapters: [...document.querySelectorAll(".org-section")].map((sec) => ({
      name: sec.querySelector(".ch-name").value.trim() || "Chapter",
      blurb: sec.querySelector(".ch-blurb").value.trim(),
      photos: [...sec.querySelectorAll(".org-card")].map((c) => c.dataset.id),
    })),
    unfiled: [...document.querySelectorAll("#unfiledGrid .org-card")].map((c) => c.dataset.id),
  };
  saveDraft();
  updateCounts();
}

function updateCounts() {
  const inChapters = state.chapters.reduce((a, c) => a + c.photos.length, 0);
  $("#orgCounts").textContent =
    `${ALL.length} photos · ${state.chapters.length} chapters · ${state.unfiled.length} unfiled`;
  $("#unfiledCount").textContent = state.unfiled.length ? `(${state.unfiled.length})` : "";
  document.querySelectorAll(".org-section").forEach((sec, i) => {
    const n = sec.querySelectorAll(".org-card").length;
    sec.querySelector(".org-sec-count").textContent = `${n} photos`;
    sec.querySelector(".org-sec-num").textContent = String(i + 1).padStart(2, "0");
  });
}

/* ---------- rendering ---------- */

function makeCard(id) {
  const el = document.createElement("div");
  el.className = "org-card";
  el.draggable = true;
  el.dataset.id = id;
  el.title = id;
  el.innerHTML = `
    <img src="${byId[id].thumb}" alt="${id}" draggable="false">
    <span class="org-fn">${id}</span>
    <div class="org-tools">
      <button data-act="up" title="Move earlier">&#8593;</button>
      <button data-act="down" title="Move later">&#8595;</button>
      <button data-act="prevch" title="Previous chapter">&#8249;</button>
      <button data-act="nextch" title="Next chapter">&#8250;</button>
      <button data-act="unfile" title="Send to Unfiled">&#10005;</button>
    </div>`;
  return el;
}

function makeSection(ch) {
  const sec = document.createElement("section");
  sec.className = "org-section";
  const name = document.createElement("input");
  name.className = "ch-name";
  name.value = ch.name;
  name.placeholder = "Chapter name";
  name.maxLength = 40;
  const blurb = document.createElement("input");
  blurb.className = "ch-blurb";
  blurb.value = ch.blurb;
  blurb.placeholder = "Short chapter blurb (shows on the site)";
  blurb.maxLength = 140;

  const tools = document.createElement("div");
  tools.className = "org-sec-tools";
  tools.innerHTML = `
    <button data-sec-act="up" title="Move chapter up">&#8593;</button>
    <button data-sec-act="down" title="Move chapter down">&#8595;</button>
    <button data-sec-act="delete" title="Delete chapter (photos go to Unfiled)">&#128465;</button>`;

  const head = document.createElement("div");
  head.className = "org-sec-head";
  head.innerHTML = `<span class="org-sec-num"></span>`;
  const fName = document.createElement("div");
  fName.className = "org-field";
  fName.innerHTML = "<label>Name</label>";
  fName.appendChild(name);
  const fBlurb = document.createElement("div");
  fBlurb.className = "org-field";
  fBlurb.innerHTML = "<label>Blurb</label>";
  fBlurb.appendChild(blurb);
  const count = document.createElement("span");
  count.className = "org-sec-count";
  head.append(fName, fBlurb, count, tools);

  const grid = document.createElement("div");
  grid.className = "org-grid";
  ch.photos.forEach((id) => grid.appendChild(makeCard(id)));

  sec.append(head, grid);
  return sec;
}

function renderAll() {
  const main = $("#orgMain");
  main.innerHTML = "";
  state.chapters.forEach((ch) => main.appendChild(makeSection(ch)));
  const ug = $("#unfiledGrid");
  ug.innerHTML = "";
  state.unfiled.forEach((id) => ug.appendChild(makeCard(id)));
  selected = null;
  dragged = null;
  updateCounts();
}

/* ---------- drag & drop ---------- */

document.addEventListener("dragstart", (e) => {
  const card = e.target.closest(".org-card");
  if (!card) return;
  dragged = card;
  card.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", card.dataset.id);
});

document.addEventListener("dragend", () => {
  document.querySelectorAll(".dragging").forEach((el) => el.classList.remove("dragging"));
  document.querySelectorAll(".org-grid.over").forEach((el) => el.classList.remove("over"));
  if (dragged) { dragged = null; syncFromDOM(); }
});

document.addEventListener("dragover", (e) => {
  if (!dragged) return;
  const grid = e.target.closest(".org-grid");
  document.querySelectorAll(".org-grid.over").forEach((el) => { if (el !== grid) el.classList.remove("over"); });
  if (!grid) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  grid.classList.add("over");

  const card = e.target.closest(".org-card");
  if (!card || card === dragged) {
    if (dragged.parentElement !== grid || grid.lastElementChild !== dragged) {
      grid.appendChild(dragged);
    }
    return;
  }
  const r = card.getBoundingClientRect();
  const before = e.clientY < r.top + r.height / 2;
  if (before) {
    if (card.previousElementSibling !== dragged) grid.insertBefore(dragged, card);
  } else {
    if (card.nextElementSibling !== dragged) grid.insertBefore(dragged, card.nextSibling);
  }
});

/* ---------- selection + card tools ---------- */

document.addEventListener("click", (e) => {
  const tool = e.target.closest(".org-tools button");
  if (tool) { handleCardTool(tool); return; }

  const card = e.target.closest(".org-card");
  if (card) {
    if (selected === card) { card.classList.remove("selected"); selected = null; }
    else {
      if (selected) selected.classList.remove("selected");
      selected = card;
      card.classList.add("selected");
    }
    return;
  }
  if (selected) { selected.classList.remove("selected"); selected = null; }
});

function handleCardTool(btn) {
  const card = btn.closest(".org-card");
  if (!card) return;
  const act = btn.dataset.act;

  if (act === "up") {
    const p = card.previousElementSibling;
    if (p) p.before(card);
  } else if (act === "down") {
    const n = card.nextElementSibling;
    if (n) n.after(card);
  } else if (act === "prevch" || act === "nextch") {
    const grids = [...document.querySelectorAll(".org-grid")];
    const idx = grids.indexOf(card.closest(".org-grid"));
    if (idx !== -1) {
      const dir = act === "prevch" ? -1 : 1;
      const target = grids[(idx + dir + grids.length) % grids.length];
      target.appendChild(card);
    }
  } else if (act === "unfile") {
    $("#unfiledGrid").appendChild(card);
  }
  card.scrollIntoView({ block: "nearest", inline: "nearest" });
  syncFromDOM();
}

/* ---------- chapter section tools + field edits ---------- */

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".org-sec-tools button");
  if (!btn) return;
  const sec = btn.closest(".org-section");
  const act = btn.dataset.secAct;

  if (act === "up") {
    const p = sec.previousElementSibling;
    if (p) p.before(sec);
  } else if (act === "down") {
    const n = sec.nextElementSibling;
    if (n) n.after(sec);
  } else if (act === "delete") {
    const n = sec.querySelectorAll(".org-card").length;
    const ok = n === 0 || confirm(`Delete this chapter? Its ${n} photo(s) move to Unfiled.`);
    if (!ok) return;
    sec.querySelectorAll(".org-card").forEach((c) => $("#unfiledGrid").appendChild(c));
    sec.remove();
  }
  syncFromDOM();
  updateCounts();
});

document.addEventListener("input", (e) => {
  if (e.target.matches(".ch-name, .ch-blurb")) syncFromDOM();
});

/* ---------- toolbar ---------- */

$("#btnAdd").addEventListener("click", () => {
  $("#orgMain").appendChild(makeSection({ name: "New Chapter", blurb: "", photos: [] }));
  syncFromDOM();
  updateCounts();
  $("#orgMain").lastElementChild.scrollIntoView({ behavior: "smooth", block: "start" });
});

$("#btnReset").addEventListener("click", () => {
  if (!confirm("Discard all arrangements and reset to filename order?")) return;
  localStorage.removeItem(DRAFT_KEY);
  state = defaultState();
  renderAll();
});

$("#btnExport").addEventListener("click", () => {
  syncFromDOM();
  const blob = new Blob([JSON.stringify(state, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "order.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

boot();
