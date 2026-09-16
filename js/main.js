/* ==========================================================================
   TRUKROD — main.js
   Gallery render, lightbox, countdown, nav, scroll reveals.
   ========================================================================== */

/* ---------- CONFIG -----------------------------------------------------
   EDIT HERE: exact show date/time (Las Vegas time).
   Countdown counts down to this moment.                             */
const SHOW_DATE = new Date("2026-09-26T08:00:00-07:00");

/* Chapter definitions: match photos by IMG number ranges (inclusive). */
const CHAPTERS = [
  { name: "The Vision",     from: 1600, to: 1899, blurb: "The truck as it came home — torn down, dreamed over, planned out." },
  { name: "Bare Metal",     from: 1900, to: 2599, blurb: "Fabrication and metalwork. Cutting, welding, shaping — the long middle." },
  { name: "Bones & Heart",  from: 2600, to: 2999, blurb: "Chassis, drivetrain, and the thousand parts nobody sees but everybody feels." },
  { name: "Fine Details",   from: 3000, to: 3199, blurb: "Trim, fit, and finish — where patience becomes craftsmanship." },
  { name: "Paint & Chrome", from: 3200, to: 4049, blurb: "Color laid down, chrome hung, the truck becoming itself." },
  { name: "The Reveal",     from: 4050, to: 9999, blurb: "Finished. Running. Ready for Las Vegas." },
];

/* ---------- helpers ---------- */
const imgNum = (id) => parseInt(id.replace(/\D/g, ""), 10);
const $ = (sel) => document.querySelector(sel);

/* ==========================================================================
   NAV
   ========================================================================== */
const nav = $("#siteNav");
const burger = $("#navBurger");
const links = $("#navLinks");

addEventListener("scroll", () => {
  nav.classList.toggle("scrolled", scrollY > 40);
}, { passive: true });

burger.addEventListener("click", () => {
  const open = links.classList.toggle("open");
  burger.classList.toggle("open", open);
  burger.setAttribute("aria-expanded", open);
});
links.querySelectorAll("a").forEach((a) =>
  a.addEventListener("click", () => {
    links.classList.remove("open");
    burger.classList.remove("open");
    burger.setAttribute("aria-expanded", "false");
  })
);

/* ==========================================================================
   OVERLAY HISTORY — back button closes overlays instead of leaving the site
   ========================================================================== */
let overlayOwner = null; // "photo" | "video" | null

addEventListener("popstate", () => {
  if (overlayOwner === "video") { teardownVideo(); overlayOwner = null; }
  else if (overlayOwner === "photo") { teardownLightbox(); overlayOwner = null; }
});

function overlayOpened(name) {
  overlayOwner = name;
  history.pushState({ overlay: name }, "");
}
function overlayClosing(name) {
  /* UI-initiated close: pop our history entry; popstate does the teardown.
     If the entry is already gone (back was pressed), tear down directly. */
  if (history.state && history.state.overlay === name) history.back();
  else {
    if (name === "video") teardownVideo();
    else teardownLightbox();
    overlayOwner = null;
  }
}

/* ==========================================================================
   GALLERY RENDER
   ========================================================================== */
const root = $("#galleryRoot");
let flatIndex = []; // ordered [{photo, chapterName}]

function initGallery(photos, order) {
  let chapters;

  if (order && Array.isArray(order.chapters) && order.chapters.length) {
    /* curated order from organizer.html (js/order.json) */
    chapters = order.chapters
      .map((c) => ({
        name: String(c.name || "Chapter"),
        blurb: String(c.blurb || ""),
        photos: (c.photos || [])
          .map((id) => photos.find((p) => p.id === id))
          .filter(Boolean),
      }))
      .filter((c) => c.photos.length > 0);
    /* anything not listed (e.g. photos added later) still gets shown */
    const listed = new Set(chapters.flatMap((c) => c.photos.map((p) => p.id)));
    const extras = photos.filter((p) => !listed.has(p.id));
    if (extras.length) {
      if (!chapters.length) chapters.push({ name: "The Archive", blurb: "", photos: [] });
      chapters[chapters.length - 1].photos.push(...extras);
    }
  } else {
    /* default: group photos by IMG-number ranges */
    chapters = CHAPTERS.map((c) => ({
      ...c,
      photos: photos.filter((p) => {
        const n = imgNum(p.id);
        return n >= c.from && n <= c.to;
      }),
    })).filter((c) => c.photos.length > 0);
  }

  chapters.forEach((c) => {
    if (!c.photos.length) return;

    flatIndex.push(...c.photos.map((p) => ({ photo: p, chapterName: c.name })));

    const head = document.createElement("div");
    head.className = "chapter-head reveal";
    head.innerHTML = `
      <span class="chapter-num">${String(chapters.indexOf(c) + 1).padStart(2, "0")}</span>
      <div class="chapter-titles">
        <h3 class="chapter-name">${c.name}</h3>
        <p class="chapter-blurb">${c.blurb}</p>
      </div>
      <span class="chapter-count">${c.photos.length} photos</span>`;
    root.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "masonry";
    c.photos.forEach((p) => {
      const card = document.createElement("button");
      card.className = "photo-card";
      card.setAttribute("aria-label", `Open photo ${p.id}`);
      card.dataset.id = p.id;
      card.innerHTML = `<img src="${p.thumb}" loading="lazy" alt="TRUKROD build photo ${p.id}">`;
      card.addEventListener("click", () => openLightbox(p.id));
      grid.appendChild(card);
    });
    root.appendChild(grid);
  });

  /* photo count stat */
  $("#statPhotos").textContent = photos.length;

  /* reveal for freshly created chapter heads + cards */
  document.querySelectorAll(".chapter-head.reveal").forEach((el) => io.observe(el));
  document.querySelectorAll(".photo-card").forEach((el) => ioCards.observe(el));
}

fetch("js/manifest.json")
  .then((r) => r.json())
  .then(async (photos) => {
    let order = null;
    try {
      const r = await fetch("js/order.json");
      if (r.ok) order = await r.json();
    } catch {}
    initGallery(photos, order);
  })
  .catch((err) => console.error("Could not load gallery:", err));

/* ==========================================================================
   LIGHTBOX
   ========================================================================== */
const lb = $("#lightbox");
const lbImg = $("#lbImg");
const lbChapter = $("#lbChapter");
const lbCounter = $("#lbCounter");
let lbPos = -1;

function openLightbox(id) {
  lbPos = flatIndex.findIndex((e) => e.photo.id === id);
  renderLb();
  lb.classList.add("open");
  lb.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  overlayOpened("photo");
}
function closeLightbox() {
  overlayClosing("photo");
}
function teardownLightbox() {
  lb.classList.remove("open");
  lb.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}
function stepLb(dir) {
  lbPos = (lbPos + dir + flatIndex.length) % flatIndex.length;
  renderLb();
}
function renderLb() {
  const entry = flatIndex[lbPos];
  lbImg.src = entry.photo.full;
  lbImg.alt = `TRUKROD build photo ${entry.photo.id}`;
  lbChapter.textContent = entry.chapterName;
  lbCounter.textContent = `${lbPos + 1} / ${flatIndex.length}`;
  /* preload neighbors for snappy nav */
  [(lbPos + 1) % flatIndex.length, (lbPos - 1 + flatIndex.length) % flatIndex.length]
    .forEach((i) => { const im = new Image(); im.src = flatIndex[i].photo.full; });
}

$("#lbClose").addEventListener("click", closeLightbox);
$("#lbPrev").addEventListener("click", (e) => { e.stopPropagation(); stepLb(-1); });
$("#lbNext").addEventListener("click", (e) => { e.stopPropagation(); stepLb(1); });
lb.addEventListener("click", (e) => { if (e.target === lb) closeLightbox(); });

addEventListener("keydown", (e) => {
  if (!lb.classList.contains("open")) return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowLeft") stepLb(-1);
  if (e.key === "ArrowRight") stepLb(1);
});

/* swipe support */
let touchX = null;
lb.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
lb.addEventListener("touchend", (e) => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 50) stepLb(dx < 0 ? 1 : -1);
  touchX = null;
}, { passive: true });

/* ==========================================================================
   FILM — video grid + player
   ========================================================================== */
const filmGrid = $("#filmGrid");
const vlb = $("#vlightbox");
const vlbVideo = $("#vlbVideo");
const vlbTitle = $("#vlbTitle");

const fmtDur = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

fetch("js/videos.json")
  .then((r) => r.json())
  .then((videos) => {
    videos.forEach((v) => {
      const card = document.createElement("button");
      card.className = "film-card reveal";
      if (v.landscape) card.classList.add("landscape");
      card.setAttribute("aria-label", `Play ${v.title}`);
      card.innerHTML = `
        <img src="${v.poster}" loading="lazy" alt="${v.title} poster frame">
        <span class="film-dur">${fmtDur(v.duration)}</span>
        <span class="film-play-btn" aria-hidden="true">&#9654;</span>
        <span class="film-card-title">${v.title}</span>`;
      card.addEventListener("click", () => {
        vlbVideo.src = v.file;
        vlbTitle.textContent = v.title;
        vlb.classList.add("open");
        vlb.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
        overlayOpened("video");
        vlbVideo.play().catch(() => {});
      });
      filmGrid.appendChild(card);
      io.observe(card);
    });
  })
  .catch((err) => console.error("Could not load videos:", err));

function closeVideo() {
  overlayClosing("video");
}
function teardownVideo() {
  vlbVideo.pause();
  vlbVideo.removeAttribute("src");
  vlbVideo.load();
  vlb.classList.remove("open");
  vlb.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}
$("#vlbClose").addEventListener("click", closeVideo);
vlb.addEventListener("click", (e) => { if (e.target === vlb) closeVideo(); });
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && vlb.classList.contains("open")) closeVideo();
});

/* ==========================================================================
   COUNTDOWN
   ========================================================================== */
const cd = {
  d: $("#cdDays"), h: $("#cdHours"), m: $("#cdMins"), s: $("#cdSecs"),
};
function tick() {
  let diff = SHOW_DATE - Date.now();
  if (diff <= 0) {
    cd.d.textContent = "GO"; cd.h.textContent = "—"; cd.m.textContent = "—"; cd.s.textContent = "—";
    return;
  }
  const s = Math.floor(diff / 1000);
  cd.d.textContent = Math.floor(s / 86400);
  cd.h.textContent = String(Math.floor(s / 3600) % 24).padStart(2, "0");
  cd.m.textContent = String(Math.floor(s / 60) % 60).padStart(2, "0");
  cd.s.textContent = String(s % 60).padStart(2, "0");
}
tick();
setInterval(tick, 1000);

/* ==========================================================================
   SCROLL REVEALS
   ========================================================================== */
const io = new IntersectionObserver(
  (entries) => entries.forEach((en) => {
    if (en.isIntersecting) {
      en.target.classList.add("shown");
      io.unobserve(en.target);
    }
  }),
  { threshold: 0.12 }
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

/* photo cards get their own (they're numerous) */
const ioCards = new IntersectionObserver(
  (entries) => entries.forEach((en) => {
    if (en.isIntersecting) {
      en.target.classList.add("shown");
      ioCards.unobserve(en.target);
    }
  }),
  { threshold: 0.05, rootMargin: "60px" }
);
