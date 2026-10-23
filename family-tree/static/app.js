// Семейное древо — интерфейс. Без сборки и внешних библиотек.

const CARD_W = 184, CARD_H = 76, GAP_X = 22, GAP_Y = 92, PAD = 80;

const FIELDS = [
  ["last_name", "Фамилия"],
  ["first_name", "Имя"],
  ["middle_name", "Отчество"],
  ["maiden_name", "Девичья фамилия"],
  ["gender", "Пол"],
  ["birth_date", "Дата рождения", "например, 12.03.1932 или 1932"],
  ["birth_place", "Место рождения"],
  ["death_date", "Дата смерти", "например, 2004"],
  ["death_place", "Место смерти"],
  ["bio", "О человеке", "Профессия, где жил, чем запомнился, семейные истории"],
];
const NEW_PERSON_FIELDS = ["last_name", "first_name", "middle_name", "gender", "birth_date"];

const state = {
  people: new Map(), relations: [], photos: new Map(),
  parents: new Map(), children: new Map(), spouses: new Map(),
  pos: new Map(), size: { w: 0, h: 0 },
  selected: null, photoIndex: 0, dirty: false,
  view: { x: 0, y: 0, k: 1 },
};

const $ = (s) => document.querySelector(s);
const els = {
  login: $("#login"), loginForm: $("#login-form"), loginCode: $("#login-code"), loginError: $("#login-error"),
  main: $("#main"), topbar: $(".topbar"), viewport: $("#viewport"), stage: $("#stage"), lines: $("#lines"), cards: $("#cards"),
  empty: $("#empty"), panel: $("#panel"), history: $("#history"),
  modal: $("#modal"), modalCard: $("#modal-card"), toast: $("#toast"),
  search: $("#search"), searchResults: $("#search-results"), who: $("#btn-who"),
};

// ---------- Утилиты ----------

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

// replaceChildren без пустых значений (иначе в разметке появится текст «null»).
function fill(el, ...kids) {
  el.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
}

function storageGet(key) { try { return localStorage.getItem("ft:" + key); } catch { return null; } }
function storageSet(key, value) { try { localStorage.setItem("ft:" + key, value); } catch { /* приватный режим */ } }

let who = storageGet("who") || "";

async function api(method, url, body, headers = {}) {
  const opts = { method, headers: { ...headers } };
  if (who) opts.headers["X-Who"] = encodeURIComponent(who);
  if (body instanceof Blob) opts.body = body;
  else if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  let res;
  try { res = await fetch(url, opts); }
  catch { throw new Error("Нет связи с сайтом. Проверьте интернет и попробуйте ещё раз."); }
  let data = null;
  try { data = await res.json(); } catch { /* пустой ответ */ }
  if (res.status === 401 && url !== "/api/login") {
    showLogin();
    throw new Error("Нужно снова ввести семейный код");
  }
  if (!res.ok) throw new Error(data?.error || "Не получилось. Попробуйте ещё раз.");
  return data;
}

let toastTimer;
function toast(text) {
  els.toast.textContent = text;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 3500);
}

async function run(fn, button) {
  if (button) button.disabled = true;
  try { await fn(); }
  catch (e) { toast(e.message); }
  finally { if (button) button.disabled = false; }
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fullName = (p) => [p.last_name, p.first_name, p.middle_name].filter(Boolean).join(" ") || "Без имени";
const cardName = (p) => [p.first_name, p.last_name].filter(Boolean).join(" ") || "Без имени";
const yearOf = (s) => (s || "").match(/\d{4}/)?.[0] || "";
const photoUrl = (ph) => `/photos/${ph.file}`;
const firstPhoto = (id) => (state.photos.get(id) || [])[0];

function lifeYears(p) {
  const b = yearOf(p.birth_date), d = yearOf(p.death_date);
  if (p.death_date) return `${b || "?"} – ${d || "?"}`;
  return b ? `род. ${b}` : "";
}

function initials(p) {
  return (((p.first_name || "")[0] || "") + ((p.last_name || "")[0] || "")).toUpperCase() || "?";
}

function avatar(p) {
  const ph = firstPhoto(p.id);
  return ph
    ? h("img", { class: "ava", src: photoUrl(ph), alt: "", loading: "lazy", draggable: "false" })
    : h("span", { class: "ava", text: initials(p), "aria-hidden": "true" });
}

// ---------- Данные ----------

const parentsOf = (id) => state.parents.get(id) || [];
const childrenOf = (id) => state.children.get(id) || [];
const spousesOf = (id) => state.spouses.get(id) || [];

function siblingsOf(id) {
  const out = new Set();
  for (const p of parentsOf(id)) for (const c of childrenOf(p)) if (c !== id) out.add(c);
  return [...out];
}

function findRelation(a, b, type) {
  return state.relations.find((r) => r.type === type &&
    ((r.a === a && r.b === b) || (type === "spouse" && r.a === b && r.b === a)));
}

function indexRelations() {
  const add = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  state.parents = new Map(); state.children = new Map(); state.spouses = new Map();
  for (const r of state.relations) {
    if (r.type === "parent") { add(state.parents, r.b, r.a); add(state.children, r.a, r.b); }
    else { add(state.spouses, r.a, r.b); add(state.spouses, r.b, r.a); }
  }
}

async function refresh({ quiet = false } = {}) {
  const tree = await api("GET", "/api/tree");
  state.people = new Map(tree.people.map((p) => [p.id, p]));
  state.relations = tree.relations;
  state.photos = new Map();
  for (const ph of tree.photos) {
    if (!state.photos.has(ph.person_id)) state.photos.set(ph.person_id, []);
    state.photos.get(ph.person_id).push(ph);
  }
  indexRelations();
  renderTree();
  if (state.selected) {
    if (!state.people.has(state.selected)) closePanel(true);
    else if (state.dirty) renderPanelParts();
    else if (!quiet || !els.panel.contains(document.activeElement)) renderPanel();
  }
}

// ---------- Раскладка древа ----------
// Поколения считаются по связям «родитель → ребёнок», супруги ставятся в один ряд и рядом,
// дети стараются встать под своими родителями.

function computeLayout() {
  const ids = [...state.people.keys()];
  const gen = new Map(ids.map((id) => [id, 0]));
  const settle = () => {
    for (let i = 0; i <= ids.length; i++) {
      let changed = false;
      for (const r of state.relations) {
        const ga = gen.get(r.a), gb = gen.get(r.b);
        if (r.type === "parent") {
          if (gb < ga + 1) { gen.set(r.b, ga + 1); changed = true; }
        } else if (ga !== gb) {
          const m = Math.max(ga, gb);
          gen.set(r.a, m); gen.set(r.b, m); changed = true;
        }
      }
      if (!changed) break;
    }
  };
  settle();
  // Людей без указанных родителей опускаем поближе к их детям.
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const id of ids) {
      if (parentsOf(id).length || !childrenOf(id).length) continue;
      const target = Math.min(...childrenOf(id).map((c) => gen.get(c))) - 1;
      if (target <= gen.get(id)) continue;
      if (spousesOf(id).some((s) => parentsOf(s).length && gen.get(s) !== target)) continue;
      gen.set(id, target);
      for (const s of spousesOf(id)) if (!parentsOf(s).length) gen.set(s, target);
      moved = true;
    }
    if (!moved) break;
    settle();
  }

  const rows = new Map();
  for (const id of ids) {
    const g = gen.get(id);
    if (!rows.has(g)) rows.set(g, []);
    rows.get(g).push(id);
  }
  const gens = [...rows.keys()].sort((a, b) => a - b);
  const pos = new Map();
  const created = (id) => state.people.get(id).created_at || "";
  const anchorOf = (id) => {
    const xs = parentsOf(id).filter((p) => pos.has(p)).map((p) => pos.get(p).x + CARD_W / 2);
    return xs.length ? xs.reduce((a, b) => a + b) / xs.length : null;
  };

  gens.forEach((g, rowIndex) => {
    const row = rows.get(g);
    const key = new Map(row.map((id) => {
      let k = anchorOf(id);
      if (k == null) for (const s of spousesOf(id)) { k = anchorOf(s); if (k != null) break; }
      return [id, k];
    }));
    row.sort((a, b) => {
      const ka = key.get(a), kb = key.get(b);
      if ((ka == null) !== (kb == null)) return ka == null ? 1 : -1;
      if (ka != null && ka !== kb) return ka - kb;
      return created(a).localeCompare(created(b));
    });

    // Семья (человек + супруги). pull: куда «тянет» супруга со своими родителями —
    // такие семьи ставим с краю группы братьев и сестёр, чтобы не разрывать её.
    const placed = new Set();
    const units = [];
    for (const id of row) {
      if (placed.has(id)) continue;
      placed.add(id);
      const unit = { ids: [id], key: key.get(id), pull: 0, order: units.length };
      let nextRight = true;
      for (const s of spousesOf(id)) {
        if (placed.has(s) || gen.get(s) !== g) continue;
        placed.add(s);
        const own = anchorOf(s), mine = anchorOf(id);
        let left;
        if (own != null && mine != null) { left = own < mine; unit.pull = left ? -1 : 1; }
        else { left = !nextRight; nextRight = !nextRight; }
        if (left) unit.ids.unshift(s); else unit.ids.push(s);
      }
      units.push(unit);
    }
    units.sort((a, b) => {
      if ((a.key == null) !== (b.key == null)) return a.key == null ? 1 : -1;
      if (a.key != null && a.key !== b.key) return a.key - b.key;
      return a.pull - b.pull || a.order - b.order;
    });

    let cursor = null;
    for (const { ids: unit } of units) {
      const w = unit.length * CARD_W + (unit.length - 1) * GAP_X;
      const anchors = unit.map(anchorOf).filter((k) => k != null);
      const desired = anchors.length ? anchors.reduce((a, b) => a + b) / anchors.length - w / 2 : null;
      let x = desired ?? cursor ?? 0;
      if (cursor != null) x = Math.max(x, cursor);
      unit.forEach((id, i) => pos.set(id, { x: x + i * (CARD_W + GAP_X), y: rowIndex * (CARD_H + GAP_Y) }));
      cursor = x + w + GAP_X * 2;
    }
  });

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pos.values()) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  for (const p of pos.values()) { p.x += PAD - minX; p.y += PAD - minY; }
  state.pos = pos;
  state.size = pos.size
    ? { w: maxX - minX + CARD_W + PAD * 2, h: maxY - minY + CARD_H + PAD * 2 }
    : { w: 0, h: 0 };
}

function renderTree() {
  computeLayout();
  els.empty.hidden = state.people.size > 0;
  els.stage.style.width = state.size.w + "px";
  els.stage.style.height = state.size.h + "px";
  const frag = document.createDocumentFragment();
  for (const [id, p] of state.people) {
    const { x, y } = state.pos.get(id);
    const classes = ["card", `g-${p.gender || "u"}`];
    if (id === state.selected) classes.push("is-selected");
    if (p.death_date) classes.push("is-gone");
    const card = h("button", { class: classes.join(" "), type: "button", "data-id": id, "aria-label": fullName(p) },
      avatar(p),
      h("span", { class: "card-text" },
        h("span", { class: "card-name", text: cardName(p) }),
        h("span", { class: "card-years", text: lifeYears(p) })));
    card.style.left = x + "px";
    card.style.top = y + "px";
    frag.append(card);
  }
  els.cards.replaceChildren(frag);
  drawLines();
}

function drawLines() {
  const NS = "http://www.w3.org/2000/svg";
  const { pos } = state;
  const svg = els.lines;
  svg.setAttribute("width", state.size.w);
  svg.setAttribute("height", state.size.h);
  const paths = [];
  const couple = (a, b) => {
    const [l, r] = a.x < b.x ? [a, b] : [b, a];
    return { x: (l.x + CARD_W + r.x) / 2, y: l.y + CARD_H / 2 };
  };
  for (const r of state.relations) {
    if (r.type !== "spouse") continue;
    const a = pos.get(r.a), b = pos.get(r.b);
    if (!a || !b || a.y !== b.y) continue;
    const [l, rr] = a.x < b.x ? [a, b] : [b, a];
    paths.push(["spouse", `M${l.x + CARD_W} ${l.y + CARD_H / 2}H${rr.x}`]);
  }
  for (const [childId, ps] of state.parents) {
    const c = pos.get(childId);
    if (!c) continue;
    const cx = c.x + CARD_W / 2, busY = c.y - GAP_Y / 2;
    const placed = ps.filter((p) => pos.has(p));
    const isCouple = placed.length === 2 && findRelation(placed[0], placed[1], "spouse") &&
      pos.get(placed[0]).y === pos.get(placed[1]).y;
    const origins = isCouple
      ? [couple(pos.get(placed[0]), pos.get(placed[1]))]
      : placed.map((p) => ({ x: pos.get(p).x + CARD_W / 2, y: pos.get(p).y + CARD_H }));
    for (const o of origins) paths.push(["kin", `M${o.x} ${o.y}V${busY}H${cx}V${c.y}`]);
  }
  svg.replaceChildren(...paths.map(([cls, d]) => {
    const el = document.createElementNS(NS, "path");
    el.setAttribute("class", cls);
    el.setAttribute("d", d);
    return el;
  }));
}

// ---------- Перемещение и масштаб ----------

function applyView() {
  const { x, y, k } = state.view;
  els.stage.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
}

function glide() {
  els.stage.classList.add("glide");
  setTimeout(() => els.stage.classList.remove("glide"), 400);
}

function panelWidth() {
  const open = !els.panel.hidden || !els.history.hidden;
  return open && window.innerWidth > 720 ? Math.min(430, window.innerWidth) : 0;
}

function fitView(animate = false) {
  if (!state.size.w) return;
  const vw = els.viewport.clientWidth - panelWidth(), vh = els.viewport.clientHeight;
  // На телефоне не мельчим: лучше часть древа за краем, чем нечитаемые карточки.
  const minK = vw < 500 ? 0.55 : 0.2;
  const k = clamp(Math.min(vw / state.size.w, vh / state.size.h), minK, 1);
  state.view = { k, x: (vw - state.size.w * k) / 2, y: Math.max(0, (vh - state.size.h * k) / 2) };
  if (animate) glide();
  applyView();
}

function zoomAt(factor, cx, cy) {
  const v = state.view;
  const k = clamp(v.k * factor, 0.2, 2.5);
  const f = k / v.k;
  v.x = cx - (cx - v.x) * f;
  v.y = cy - (cy - v.y) * f;
  v.k = k;
  applyView();
}

function centerOn(id) {
  const p = state.pos.get(id);
  if (!p) return;
  const v = state.view;
  v.k = Math.max(v.k, 0.85);
  const vw = els.viewport.clientWidth - panelWidth(), vh = els.viewport.clientHeight;
  v.x = vw / 2 - (p.x + CARD_W / 2) * v.k;
  v.y = vh / 2 - (p.y + CARD_H / 2) * v.k;
  glide();
  applyView();
}

const pointers = new Map();
const drag = { moved: false, start: null, lastDist: 0 };

els.viewport.addEventListener("pointerdown", (e) => {
  if (e.target.closest(".zoom, .empty")) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) { drag.moved = false; drag.start = { x: e.clientX, y: e.clientY }; }
  drag.lastDist = 0;
});

window.addEventListener("pointermove", (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  const cur = { x: e.clientX, y: e.clientY };
  pointers.set(e.pointerId, cur);
  if (pointers.size === 1) {
    if (!drag.moved && Math.hypot(cur.x - drag.start.x, cur.y - drag.start.y) > 6) {
      drag.moved = true;
      els.viewport.classList.add("is-dragging");
    }
    if (drag.moved) {
      state.view.x += cur.x - prev.x;
      state.view.y += cur.y - prev.y;
      applyView();
    }
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const rect = els.viewport.getBoundingClientRect();
    if (drag.lastDist) zoomAt(dist / drag.lastDist, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
    drag.lastDist = dist;
    drag.moved = true;
  }
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) drag.lastDist = 0;
  if (!pointers.size) els.viewport.classList.remove("is-dragging");
}
window.addEventListener("pointerup", endPointer);
window.addEventListener("pointercancel", endPointer);

els.viewport.addEventListener("wheel", (e) => {
  if (e.target.closest(".empty")) return;
  e.preventDefault();
  const rect = els.viewport.getBoundingClientRect();
  const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
  const mouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
  if (e.ctrlKey) zoomAt(Math.exp(-e.deltaY * 0.01), cx, cy);
  else if (mouseWheel) zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, cx, cy);
  else { state.view.x -= e.deltaX; state.view.y -= e.deltaY; applyView(); }
}, { passive: false });

els.cards.addEventListener("click", (e) => {
  const card = e.target.closest(".card");
  if (!card || drag.moved) return;
  select(card.dataset.id);
});

function zoomCenter(f) { zoomAt(f, (els.viewport.clientWidth - panelWidth()) / 2, els.viewport.clientHeight / 2); }
$("#zoom-in").addEventListener("click", () => zoomCenter(1.25));
$("#zoom-out").addEventListener("click", () => zoomCenter(0.8));
$("#zoom-fit").addEventListener("click", () => fitView(true));

// ---------- Карточка человека ----------

async function select(id, { center = false } = {}) {
  if (id !== state.selected && !(await leaveForm())) return;
  state.selected = id;
  state.photoIndex = 0;
  state.dirty = false;
  els.cards.querySelector(".card.is-selected")?.classList.remove("is-selected");
  els.cards.querySelector(`.card[data-id="${id}"]`)?.classList.add("is-selected");
  els.history.hidden = true;
  els.panel.hidden = false;
  renderPanel();
  els.panel.scrollTop = 0;
  if (center || isCovered(id)) centerOn(id);
}

// Карточка ушла за край экрана или под открытую панель.
function isCovered(id) {
  const p = state.pos.get(id);
  if (!p) return false;
  const { x, y, k } = state.view;
  const left = x + p.x * k, top = y + p.y * k;
  const right = els.viewport.clientWidth - panelWidth();
  return left < 0 || top < 0 || left + CARD_W * k > right || top + CARD_H * k > els.viewport.clientHeight;
}

async function closePanel(force = false) {
  if (!force && !(await leaveForm())) return;
  state.selected = null;
  state.dirty = false;
  els.panel.hidden = true;
  els.cards.querySelector(".card.is-selected")?.classList.remove("is-selected");
}

async function leaveForm() {
  if (!state.dirty) return true;
  const ok = await confirmModal("Изменения не сохранены", "Вы поправили сведения, но не нажали «Сохранить». Уйти без сохранения?", "Уйти без сохранения");
  if (ok) state.dirty = false;
  return ok;
}

const panelParts = {};

function renderPanel() {
  const p = state.people.get(state.selected);
  if (!p) return;
  panelParts.head = h("div", { class: "panel-head" });
  panelParts.gallery = h("section", { class: "section" });
  panelParts.relatives = h("section", { class: "section" });
  els.panel.replaceChildren(
    panelParts.head,
    h("div", { class: "panel-body" },
      panelParts.gallery,
      formSection(p),
      panelParts.relatives,
      h("section", { class: "section" },
        h("button", { class: "btn danger", type: "button", onclick: () => deletePerson(p) }, "Удалить из древа"))));
  renderPanelParts();
}

// Обновляет всё, кроме формы, чтобы не потерять то, что человек сейчас печатает.
function renderPanelParts() {
  const p = state.people.get(state.selected);
  if (!p || !panelParts.head) return;
  const sub = [lifeYears(p), p.maiden_name ? `урожд. ${p.maiden_name}` : ""].filter(Boolean).join(" · ");
  fill(panelParts.head, 
    h("div", {}, h("h2", { class: "panel-title", text: fullName(p) }), sub ? h("p", { class: "panel-sub", text: sub }) : null),
    h("button", { class: "icon-btn", type: "button", "aria-label": "Закрыть", onclick: () => closePanel() }, "×"));
  fillGallery(p);
  fillRelatives(p);
}

function sectionTitle(text) { return h("h3", { class: "section-title", text }); }

function fillGallery(p) {
  const photos = state.photos.get(p.id) || [];
  state.photoIndex = clamp(state.photoIndex, 0, Math.max(0, photos.length - 1));
  const input = h("input", {
    id: "photo-input", type: "file", accept: "image/*", multiple: true, class: "visually-hidden",
    onchange: (e) => uploadPhotos(p.id, [...e.target.files], e.target),
  });
  const upload = h("label", { class: "btn", for: "photo-input" }, photos.length ? "Добавить фото" : "Загрузить фото");
  upload.style.marginBottom = "0";
  if (!photos.length) {
    fill(panelParts.gallery, sectionTitle("Фотографии"),
      h("div", { class: "photo-empty" },
        h("p", { text: "Фотографий пока нет. Добавьте портрет или семейный снимок с этим человеком." }),
        upload, input));
    return;
  }
  const ph = photos[state.photoIndex];
  fill(panelParts.gallery, 
    sectionTitle(photos.length > 1 ? `Фотографии · ${photos.length}` : "Фотография"),
    h("figure", { class: "photo-main" },
      h("button", { class: "photo-open", type: "button", "aria-label": "Открыть фото крупно", onclick: () => openLightbox(p.id, state.photoIndex) },
        h("img", { src: photoUrl(ph), alt: ph.caption || fullName(p) })),
      h("figcaption", {},
        h("span", { class: ph.caption ? "" : "muted", text: ph.caption || "Без подписи" }),
        h("span", { class: "photo-actions" },
          h("button", { class: "link-btn", type: "button", onclick: () => editCaption(ph) }, "Подписать"),
          h("button", { class: "link-btn danger", type: "button", onclick: () => deletePhoto(ph) }, "Удалить")))),
    photos.length > 1 ? h("div", { class: "thumbs" }, photos.map((x, i) =>
      h("button", {
        class: "thumb" + (i === state.photoIndex ? " is-active" : ""), type: "button", "aria-label": `Фото ${i + 1}`,
        onclick: () => { state.photoIndex = i; fillGallery(p); },
      }, h("img", { src: photoUrl(x), alt: "", loading: "lazy" })))) : null,
    h("div", { class: "row" }, upload, input));
}

function formSection(p) {
  const form = h("form", { class: "person-form", id: "person-form", autocomplete: "off" });
  for (const [key, label, hint] of FIELDS) form.append(fieldFor(key, label, hint, p[key] || "", "f"));
  const saveBar = h("div", { class: "save-bar" },
    h("button", { class: "btn primary", type: "submit" }, "Сохранить"),
    h("button", { class: "btn ghost", type: "button", onclick: () => { state.dirty = false; renderPanel(); } }, "Отменить"));
  saveBar.hidden = true;
  form.append(saveBar);
  form.addEventListener("input", () => { state.dirty = true; saveBar.hidden = false; });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    run(async () => {
      await api("PATCH", `/api/people/${p.id}`, data);
      state.dirty = false;
      await refresh();
      toast("Сохранено");
    }, e.submitter);
  });
  return h("section", { class: "section" }, sectionTitle("Сведения"), form);
}

function fieldFor(key, label, hint, value, prefix) {
  const id = `${prefix}-${key}`;
  let input;
  if (key === "gender") {
    input = h("select", { id, name: key },
      h("option", { value: "" }, "Не указан"), h("option", { value: "f" }, "Женский"), h("option", { value: "m" }, "Мужской"));
  } else if (key === "bio") {
    input = h("textarea", { id, name: key, rows: 5, placeholder: hint });
  } else {
    input = h("input", { id, name: key, type: "text", placeholder: hint, maxlength: key.endsWith("_date") ? 40 : 100 });
  }
  input.value = value;
  return h("div", { class: `field f-${key}` }, h("label", { for: id, text: label }), input);
}

function spouseLabel(p) { return p.gender === "m" ? "Жена" : p.gender === "f" ? "Муж" : "Муж или жена"; }

function fillRelatives(p) {
  const id = p.id;
  const group = (title, ids, { add, relFor, empty }) => h("div", { class: "rel-group" },
    h("div", { class: "rel-head" },
      h("h4", { text: title }),
      add ? h("button", { class: "link-btn", type: "button", onclick: add }, "+ Добавить") : null),
    ids.length
      ? h("ul", { class: "rel-list" }, ids.map((o) => relItem(o, relFor?.(o))))
      : h("p", { class: "muted small", text: empty }));
  const siblings = siblingsOf(id);
  fill(panelParts.relatives, 
    sectionTitle("Родственники"),
    group("Родители", parentsOf(id), {
      add: parentsOf(id).length < 2 ? () => openAddRelative(p, "parent") : null,
      relFor: (o) => findRelation(o, id, "parent"),
      empty: "Пока не указаны",
    }),
    group(spouseLabel(p), spousesOf(id), {
      add: () => openAddRelative(p, "spouse"),
      relFor: (o) => findRelation(id, o, "spouse"),
      empty: "Пока не указаны",
    }),
    group("Дети", childrenOf(id), {
      add: () => openAddRelative(p, "child"),
      relFor: (o) => findRelation(id, o, "parent"),
      empty: "Пока не указаны",
    }),
    siblings.length ? group("Братья и сёстры", siblings, { empty: "" }) : null);
}

function relItem(otherId, rel) {
  const o = state.people.get(otherId);
  return h("li", { class: "rel-item" },
    h("button", { class: "rel-person", type: "button", onclick: () => select(otherId, { center: true }) },
      avatar(o),
      h("span", {}, h("span", { class: "rel-name", text: fullName(o) }), h("span", { class: "rel-years", text: lifeYears(o) }))),
    rel ? h("button", {
      class: "icon-btn small", type: "button", title: "Убрать связь", "aria-label": `Убрать связь с ${fullName(o)}`,
      onclick: () => removeRelation(rel, o),
    }, "×") : null);
}

// ---------- Действия ----------

async function removeRelation(rel, other) {
  const me = state.people.get(state.selected);
  const ok = await confirmModal("Убрать связь?",
    `${fullName(me)} и ${fullName(other)} больше не будут связаны в древе. Сами карточки останутся.`, "Убрать связь");
  if (!ok) return;
  run(async () => {
    await api("DELETE", `/api/relations/${rel.id}`);
    await refresh();
    toast("Связь убрана. Вернуть можно в «Истории».");
  });
}

async function deletePerson(p) {
  const ok = await confirmModal(`Удалить ${fullName(p)}?`,
    "Карточка, фотографии и связи этого человека пропадут из древа. Если удалили по ошибке, всё можно вернуть в «Истории».",
    "Удалить");
  if (!ok) return;
  run(async () => {
    await api("DELETE", `/api/people/${p.id}`);
    await closePanel(true);
    await refresh();
    toast("Удалено. Вернуть можно в «Истории».");
  });
}

async function prepareImage(file) {
  // Уменьшаем большие снимки с телефона и убираем из них служебные данные (в том числе геометку).
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (blob) return blob;
  } catch { /* браузер не смог прочитать — отправим как есть */ }
  return file;
}

async function uploadPhotos(personId, files, input) {
  if (!files.length) return;
  toast(files.length > 1 ? `Загружаю ${files.length} фото…` : "Загружаю фото…");
  let done = 0;
  for (const file of files) {
    try {
      const blob = await prepareImage(file);
      await api("POST", `/api/people/${personId}/photos`, blob, { "Content-Type": blob.type || "application/octet-stream" });
      done++;
    } catch (e) {
      toast(`${file.name}: ${e.message}`);
    }
  }
  input.value = "";
  if (done) {
    const before = (state.photos.get(personId) || []).length;
    await refresh().catch((e) => toast(e.message));
    state.photoIndex = before;
    if (state.selected === personId) fillGallery(state.people.get(personId));
    toast(done > 1 ? `Добавлено фото: ${done}` : "Фото добавлено");
  }
}

function editCaption(ph) {
  const input = h("input", { id: "caption-input", type: "text", maxlength: 300, placeholder: "Например: свадьба, 1958 год, Тамбов" });
  input.value = ph.caption || "";
  const form = h("form", { class: "modal-form" },
    h("div", { class: "full" }, h("label", { for: "caption-input", text: "Подпись" }), input),
    h("div", { class: "modal-actions full" },
      h("button", { class: "btn ghost", type: "button", onclick: closeModal }, "Отмена"),
      h("button", { class: "btn primary", type: "submit" }, "Сохранить")));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    run(async () => {
      await api("PATCH", `/api/photos/${ph.id}`, { caption: input.value });
      closeModal();
      await refresh();
    }, e.submitter);
  });
  openModal("Подпись к фото", "Кто на снимке, где и когда он сделан.", [form]);
}

async function deletePhoto(ph) {
  const ok = await confirmModal("Удалить фото?", "Снимок пропадёт из карточки. Вернуть его можно в «Истории».", "Удалить");
  if (!ok) return;
  run(async () => {
    await api("DELETE", `/api/photos/${ph.id}`);
    await refresh();
    toast("Фото удалено");
  });
}

function openLightbox(personId, index) {
  const photos = state.photos.get(personId) || [];
  if (!photos.length) return;
  let i = index;
  const img = h("img", { alt: "" });
  const caption = h("p");
  const counter = h("span", { class: "muted small" });
  const show = () => {
    const ph = photos[i];
    img.src = photoUrl(ph);
    img.alt = ph.caption || "";
    caption.textContent = ph.caption || "";
    counter.textContent = photos.length > 1 ? `${i + 1} из ${photos.length}` : "";
  };
  const step = (d) => { i = (i + d + photos.length) % photos.length; show(); };
  show();
  const nav = photos.length > 1;
  openModal(null, null, [
    h("div", { class: "lightbox" },
      h("div", { class: "lightbox-img" }, img),
      h("div", { class: "lightbox-bar" },
        nav ? h("button", { class: "btn", type: "button", onclick: () => step(-1), "aria-label": "Предыдущее фото" }, "←") : null,
        caption, counter,
        nav ? h("button", { class: "btn", type: "button", onclick: () => step(1), "aria-label": "Следующее фото" }, "→") : null,
        h("button", { class: "btn", type: "button", onclick: closeModal }, "Закрыть")))],
  { wide: true, onKey: (e) => { if (nav && e.key === "ArrowLeft") step(-1); if (nav && e.key === "ArrowRight") step(1); } });
}

function newPersonForm(prefix, defaults = {}) {
  const form = h("form", { class: "modal-form", autocomplete: "off" });
  const labels = Object.fromEntries(FIELDS.map(([k, l, hint]) => [k, [l, hint]]));
  for (const key of NEW_PERSON_FIELDS) {
    const [label, hint] = labels[key];
    const field = fieldFor(key, label, hint, defaults[key] || "", prefix);
    if (key === "gender" || key === "birth_date") field.classList.add("half");
    form.append(field);
  }
  return form;
}

function openNewPerson() {
  const form = newPersonForm("np");
  form.append(h("div", { class: "modal-actions full" },
    h("button", { class: "btn ghost", type: "button", onclick: closeModal }, "Отмена"),
    h("button", { class: "btn primary", type: "submit" }, "Добавить")));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const person = Object.fromEntries(new FormData(form));
    if (!person.first_name.trim() && !person.last_name.trim()) { toast("Укажите хотя бы имя или фамилию"); return; }
    run(async () => {
      const created = await api("POST", "/api/people", { person });
      closeModal();
      await refresh();
      if (state.people.size === 1) fitView();
      select(created.id, { center: true });
      toast("Человек добавлен");
    }, e.submitter);
  });
  openModal("Новый человек", "Остальное — фото, места, биографию — можно дописать потом в карточке.", [form]);
}

function openAddRelative(p, as) {
  const titles = {
    parent: "Добавить родителя",
    spouse: p.gender === "m" ? "Добавить жену" : p.gender === "f" ? "Добавить мужа" : "Добавить мужа или жену",
    child: "Добавить ребёнка",
  };
  const defaults = {};
  if (as === "spouse" && p.gender) defaults.gender = p.gender === "m" ? "f" : "m";
  if (as === "child") defaults.last_name = p.gender === "f" && p.maiden_name ? "" : p.last_name;

  // Вкладка 1: новый человек
  const form = newPersonForm("rel", defaults);
  form.append(h("div", { class: "modal-actions full" },
    h("button", { class: "btn ghost", type: "button", onclick: closeModal }, "Отмена"),
    h("button", { class: "btn primary", type: "submit" }, "Добавить")));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const person = Object.fromEntries(new FormData(form));
    if (!person.first_name.trim() && !person.last_name.trim()) { toast("Укажите хотя бы имя или фамилию"); return; }
    run(async () => {
      await api("POST", "/api/people", { person, link: { to: p.id, as } });
      closeModal();
      await refresh();
      toast("Добавлено в древо");
    }, e.submitter);
  });

  // Вкладка 2: человек, который уже есть в древе
  const linked = new Set([p.id, ...(as === "parent" ? parentsOf(p.id) : as === "child" ? childrenOf(p.id) : spousesOf(p.id))]);
  const candidates = [...state.people.values()].filter((o) => !linked.has(o.id));
  const list = h("ul", { class: "pick-list" });
  const search = h("input", { id: "pick-search", type: "search", placeholder: "Начните вводить имя или фамилию", autocomplete: "off" });
  const fillList = () => {
    const q = search.value.trim().toLowerCase();
    const found = candidates.filter((o) => !q || (fullName(o) + " " + o.maiden_name).toLowerCase().includes(q)).slice(0, 40);
    list.replaceChildren(...(found.length ? found.map((o) => h("li", {},
      h("button", {
        class: "rel-person", type: "button",
        onclick: (e) => {
          const body = as === "parent" ? { a: o.id, b: p.id, type: "parent" }
            : as === "child" ? { a: p.id, b: o.id, type: "parent" }
            : { a: p.id, b: o.id, type: "spouse" };
          run(async () => {
            await api("POST", "/api/relations", body);
            closeModal();
            await refresh();
            toast("Связь добавлена");
          }, e.currentTarget);
        },
      }, avatar(o), h("span", {}, h("span", { class: "rel-name", text: fullName(o) }), h("span", { class: "rel-years", text: lifeYears(o) })))))
      : [h("li", { class: "muted small", text: candidates.length ? "Никого не нашлось" : "В древе пока нет других людей" })]));
  };
  search.addEventListener("input", fillList);
  fillList();
  const existing = h("div", { class: "modal-form" },
    h("div", { class: "full" }, h("label", { for: "pick-search", text: "Кто это?" }), search),
    h("div", { class: "full" }, list));
  existing.hidden = true;

  const tabNew = h("button", { type: "button", class: "is-active" }, "Новый человек");
  const tabOld = h("button", { type: "button" }, "Уже есть в древе");
  const switchTo = (old) => {
    tabNew.classList.toggle("is-active", !old);
    tabOld.classList.toggle("is-active", old);
    form.hidden = old;
    existing.hidden = !old;
    (old ? search : form.querySelector("input"))?.focus();
  };
  tabNew.addEventListener("click", () => switchTo(false));
  tabOld.addEventListener("click", () => switchTo(true));

  openModal(titles[as], `для: ${fullName(p)}`, [h("div", { class: "tabs" }, tabNew, tabOld), form, existing]);
}

// ---------- История ----------

async function openHistory() {
  if (!(await closePanelAsk())) return;
  els.history.hidden = false;
  const head = h("div", { class: "panel-head" },
    h("div", {}, h("h2", { class: "panel-title", text: "История изменений" }),
      h("p", { class: "panel-sub", text: "Любую правку можно отменить" })),
    h("button", { class: "icon-btn", type: "button", "aria-label": "Закрыть", onclick: () => { els.history.hidden = true; } }, "×"));
  els.history.replaceChildren(head, h("p", { class: "section muted", text: "Загружаю…" }));
  try {
    const items = await api("GET", "/api/history");
    const fmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    els.history.replaceChildren(head, items.length ? h("ol", { class: "hist" }, items.map((it) =>
      h("li", { class: "hist-item" + (it.reverted_by ? " is-reverted" : "") },
        h("div", { class: "hist-meta" }, h("span", { text: fmt.format(new Date(it.at)) }), h("span", { text: it.who || "Кто-то из родных" })),
        h("p", { class: "hist-text", text: it.summary }),
        it.reverted_by ? h("span", { class: "tag", text: "отменено" })
          : it.action !== "revert" ? h("button", { class: "link-btn", type: "button", onclick: (e) => revert(it, e.currentTarget) }, "Отменить эту правку")
          : null)))
      : h("p", { class: "section muted", text: "Пока ничего не менялось." }));
  } catch (e) {
    toast(e.message);
  }
}

async function closePanelAsk() {
  if (els.panel.hidden) return true;
  if (!(await leaveForm())) return false;
  await closePanel(true);
  return true;
}

function revert(item, button) {
  run(async () => {
    await api("POST", `/api/history/${item.id}/revert`);
    await refresh();
    await openHistory();
    toast("Правка отменена");
  }, button);
}

// ---------- Окна ----------

let modalKeyHandler = null;
let modalResolve = null;

function openModal(title, subtitle, body, { wide = false, onKey = null } = {}) {
  els.modalCard.classList.toggle("wide", wide);
  fill(els.modalCard, 
    title ? h("div", { class: "modal-head" },
      h("div", {}, h("h2", { text: title, id: "modal-title" }), subtitle ? h("p", { text: subtitle }) : null),
      h("button", { class: "icon-btn", type: "button", "aria-label": "Закрыть", onclick: closeModal }, "×")) : null,
    ...body);
  if (title) els.modalCard.setAttribute("aria-labelledby", "modal-title");
  else els.modalCard.removeAttribute("aria-labelledby");
  modalKeyHandler = onKey;
  els.modal.hidden = false;
  const focusable = els.modalCard.querySelector("input:not([type=hidden])") || els.modalCard.querySelector(".btn.primary, .btn");
  focusable?.focus();
}

function closeModal() {
  els.modal.hidden = true;
  els.modalCard.replaceChildren();
  modalKeyHandler = null;
  if (modalResolve) { const r = modalResolve; modalResolve = null; r(false); }
}

function confirmModal(title, text, okLabel) {
  return new Promise((resolve) => {
    const ok = h("button", { class: "btn danger solid", type: "button" }, okLabel);
    openModal(title, null, [
      h("p", { text, class: "muted" }),
      h("div", { class: "modal-actions" },
        h("button", { class: "btn ghost", type: "button", onclick: closeModal }, "Отмена"), ok)]);
    modalResolve = resolve;
    ok.addEventListener("click", () => { modalResolve = null; closeModal(); resolve(true); });
    ok.focus();
  });
}

els.modal.addEventListener("click", (e) => { if (e.target === els.modal) closeModal(); });

document.addEventListener("keydown", (e) => {
  if (!els.modal.hidden) {
    if (e.key === "Escape") closeModal();
    else modalKeyHandler?.(e);
    return;
  }
  if (e.key === "Escape") {
    if (!els.searchResults.hidden) els.searchResults.hidden = true;
    else if (!els.history.hidden) els.history.hidden = true;
    else if (!els.panel.hidden) closePanel();
  }
});

// ---------- Поиск ----------

els.search.addEventListener("input", () => {
  const q = els.search.value.trim().toLowerCase();
  if (!q) { els.searchResults.hidden = true; return; }
  const found = [...state.people.values()]
    .filter((p) => (fullName(p) + " " + p.maiden_name).toLowerCase().includes(q))
    .slice(0, 8);
  els.searchResults.replaceChildren(...(found.length ? found.map((p) => h("li", {},
    h("button", {
      type: "button",
      onclick: () => { els.searchResults.hidden = true; els.search.value = ""; select(p.id, { center: true }); },
    }, h("span", { text: fullName(p) }), h("span", { class: "yrs", text: lifeYears(p) }))))
    : [h("li", { class: "muted small", text: "Никого не нашлось" })]));
  els.searchResults.hidden = false;
});
els.search.addEventListener("keydown", (e) => {
  if (e.key === "Enter") els.searchResults.querySelector("button")?.click();
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search")) els.searchResults.hidden = true;
});

// ---------- Кто правит ----------

function renderWho() {
  els.who.textContent = who ? `Вы: ${who}` : "Представиться";
}

function openWho() {
  const input = h("input", { id: "who-input", type: "text", maxlength: 60, placeholder: "Например: Маша, внучка Анны Петровны" });
  input.value = who;
  const form = h("form", { class: "modal-form" },
    h("div", { class: "full" }, h("label", { for: "who-input", text: "Как вас подписать" }), input),
    h("div", { class: "modal-actions full" },
      h("button", { class: "btn ghost", type: "button", onclick: closeModal }, "Пропустить"),
      h("button", { class: "btn primary", type: "submit" }, "Готово")));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    who = input.value.trim();
    storageSet("who", who);
    renderWho();
    closeModal();
  });
  openModal("Как вас зовут?", "Имя видно в истории изменений, чтобы родные знали, кто что поправил. Регистрироваться не нужно.", [form]);
}

// ---------- Запуск ----------

function syncTopbarHeight() {
  document.documentElement.style.setProperty("--topbar-h", els.topbar.offsetHeight + "px");
}

function showLogin() {
  els.main.hidden = true;
  els.login.hidden = false;
  els.loginCode.focus();
}

els.loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  els.loginError.hidden = true;
  const button = e.submitter;
  button.disabled = true;
  api("POST", "/api/login", { code: els.loginCode.value })
    .then(start)
    .catch((err) => { els.loginError.textContent = err.message; els.loginError.hidden = false; })
    .finally(() => { button.disabled = false; });
});

$("#btn-add").addEventListener("click", openNewPerson);
$("#btn-empty-add").addEventListener("click", openNewPerson);
$("#btn-history").addEventListener("click", openHistory);
els.who.addEventListener("click", openWho);
window.addEventListener("resize", syncTopbarHeight);

let started = false;
async function start() {
  els.login.hidden = true;
  els.main.hidden = false;
  renderWho();
  syncTopbarHeight();
  await refresh();
  fitView();
  if (!who && !storageGet("asked-who")) {
    storageSet("asked-who", "1");
    openWho();
  }
  if (started) return;
  started = true;
  // Подтягиваем правки родственников.
  setInterval(() => {
    if (document.visibilityState === "visible" && els.modal.hidden && !els.main.hidden) refresh({ quiet: true }).catch(() => {});
  }, 30000);
  window.addEventListener("focus", () => {
    if (els.modal.hidden && !els.main.hidden) refresh({ quiet: true }).catch(() => {});
  });
}

api("GET", "/api/session")
  .then((s) => (s.authed ? start() : showLogin()))
  .catch((e) => { showLogin(); els.loginError.textContent = e.message; els.loginError.hidden = false; });
