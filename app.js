"use strict";

/* ===== Constantes ===== */
const LEGACY_KEY = "pendientes-juegos-v1";      // clave de la versión antigua (localStorage)
const PREFS_KEY  = "pendientes-juegos-prefs";
const DB_NAME = "pendientes-juegos", STORE = "kv";

const STATUS = { jugando: "🎮 Jugando", pendiente: "⏳ Por empezar", pausado: "⏸️ En pausa", completado: "🏆 Completado" };
const PRIO = { alta: "Alta", normal: "Normal", baja: "Baja" };
const PRIO_ORDER = { alta: 0, normal: 1, baja: 2 };
const THEMES = { auto: ["🌓", "Tema: automático"], light: ["☀️", "Tema: claro"], dark: ["🌙", "Tema: oscuro"] };

/* ===== Estado ===== */
let data = [];
let prefs = { theme: "auto", sort: "recent", status: "", hideDone: false };
let query = "";
let useLocalStorage = false;
const openState = {};   // juegos desplegados
const drafts = {};      // borradores del formulario de cada juego
const editing = {};     // pendientes en modo edición
const editingGame = {}; // juegos en modo renombrar

/* ===== Utilidades ===== */
const $ = s => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const tsFromId = id => { const n = parseInt(String(id).slice(0, -4), 36); return Number.isFinite(n) && n > 1e12 ? n : Date.now(); };

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const k in props || {}) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "value" || k === "checked") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  kids.flat().forEach(c => { if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c)); });
  return el;
}

function selectEl(options, value, onchange, label) {
  const s = h("select", { "aria-label": label, onchange: () => onchange(s.value) },
    Object.entries(options).map(([v, t]) => h("option", { value: v }, t)));
  s.value = value;
  return s;
}

// Resalta la búsqueda dentro de un texto
function hl(text) {
  const q = query.trim().toLowerCase();
  if (!q) return text;
  const frag = document.createDocumentFragment();
  const low = text.toLowerCase();
  let i = 0, j;
  while ((j = low.indexOf(q, i)) !== -1) {
    frag.append(text.slice(i, j), h("mark", {}, text.slice(j, j + q.length)));
    i = j + q.length;
  }
  frag.append(text.slice(i));
  return frag;
}

function fmtDate(ts) {
  const d = new Date(ts), now = new Date();
  const o = { day: "numeric", month: "short" };
  if (d.getFullYear() !== now.getFullYear()) o.year = "numeric";
  return d.toLocaleDateString("es", o);
}

/* ===== Almacenamiento (IndexedDB, con localStorage de reserva) ===== */
let dbPromise = null;
function db() {
  if (!dbPromise) dbPromise = new Promise((res, rej) => {
    if (!("indexedDB" in window)) return rej(new Error("Sin IndexedDB"));
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbPromise;
}
async function idbGet(k) {
  const d = await db();
  return new Promise((res, rej) => {
    const r = d.transaction(STORE).objectStore(STORE).get(k);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbSet(k, v) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, "readwrite");
    t.objectStore(STORE).put(v, k);
    t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }

function normItem(i) {
  return {
    id: String(i.id || uid()),
    text: String(i.text || ""),
    img: typeof i.img === "string" && i.img.startsWith("data:image/") ? i.img : null,
    caption: String(i.caption || ""),
    done: !!i.done,
    priority: PRIO[i.priority] ? i.priority : "normal",
    created: Number(i.created) || tsFromId(i.id),
    doneAt: i.done ? (Number(i.doneAt) || null) : null
  };
}
function normGame(g) {
  const created = Number(g.created) || tsFromId(g.id);
  return {
    id: String(g.id || uid()),
    title: String(g.title || "Sin título").slice(0, 80),
    platform: String(g.platform || "").slice(0, 30),
    status: STATUS[g.status] ? g.status : "jugando",
    created,
    updated: Number(g.updated) || created,
    items: Array.isArray(g.items) ? g.items.filter(i => i && typeof i === "object").map(normItem) : []
  };
}

async function load() {
  try {
    const v = await idbGet("data");
    if (Array.isArray(v)) data = v;
    else {
      // Migración desde la versión antigua guardada en localStorage
      const old = lsGet(LEGACY_KEY);
      if (old) {
        data = JSON.parse(old) || [];
        await idbSet("data", data.map(normGame));
        try { localStorage.removeItem(LEGACY_KEY); } catch {}
      }
    }
  } catch {
    useLocalStorage = true;
    try { data = JSON.parse(lsGet(LEGACY_KEY)) || []; } catch { data = []; }
  }
  data = Array.isArray(data) ? data.filter(g => g && typeof g === "object").map(normGame) : [];
  try { prefs = { ...prefs, ...JSON.parse(lsGet(PREFS_KEY) || "{}") }; } catch {}
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

async function save() {
  try {
    if (useLocalStorage) localStorage.setItem(LEGACY_KEY, JSON.stringify(data));
    else await idbSet("data", data);
    $("#warn").style.display = "none";
  } catch {
    const w = $("#warn");
    w.textContent = "No se pudo guardar: el almacenamiento está lleno. Borra alguna foto o exporta una copia de seguridad.";
    w.style.display = "block";
  }
}
function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {} }
function touch(g) { g.updated = Date.now(); }
function commit(g) { if (g) { touch(g); openState[g.id] = true; } save(); render(); }

/* ===== Imágenes ===== */
function shrink(file) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const m = 1280, s = Math.min(1, m / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); // fondo para PNG transparentes
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Imagen no válida")); };
    img.src = url;
  });
}
function imageFrom(list) { return [...(list || [])].find(f => f.type && f.type.startsWith("image/")); }

/* ===== Aviso con "Deshacer" ===== */
let undoFn = null, toastTimer = null;
function toast(msg, undo) {
  $("#toastMsg").textContent = msg;
  $("#toastUndo").hidden = !undo;
  undoFn = undo || null;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, undo ? 7000 : 3500);
}
function hideToast() { $("#toast").classList.remove("show"); undoFn = null; }

/* ===== Render ===== */
function renderStats() {
  const items = data.flatMap(g => g.items);
  const done = items.filter(i => i.done).length;
  const s = $("#stats");
  s.replaceChildren(
    h("div", { class: "stat" }, h("b", {}, data.length), h("span", {}, data.length === 1 ? "juego" : "juegos")),
    h("div", { class: "stat" }, h("b", {}, items.length - done), h("span", {}, "pendientes")),
    h("div", { class: "stat" }, h("b", {}, done), h("span", {}, done === 1 ? "hecho" : "hechos"))
  );
  s.hidden = !data.length;
}

function sortItems(items) {
  return [...items].sort((a, b) =>
    (a.done - b.done) ||
    (a.done ? (b.doneAt || 0) - (a.doneAt || 0) : PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority]) ||
    a.created - b.created);
}

function render() {
  renderStats();
  const box = $("#games");
  box.replaceChildren();
  if (!data.length) {
    box.append(h("div", { class: "empty" }, h("big", {}, "🎮"),
      "Todavía no hay juegos. Escribe un título arriba y pulsa “Añadir juego”."));
    return;
  }
  const q = norm(query.trim());
  const views = [];
  for (const g of data) {
    if (prefs.status && g.status !== prefs.status) continue;
    let items = sortItems(g.items), forceOpen = false;
    if (q && !norm(g.title + " " + g.platform).includes(q)) {
      items = items.filter(i => norm(i.text + " " + i.caption).includes(q));
      if (!items.length) continue;
      forceOpen = true;
    }
    views.push({ g, items, forceOpen });
  }
  const pend = g => g.items.filter(i => !i.done).length;
  const prog = g => g.items.length ? (g.items.length - pend(g)) / g.items.length : -1;
  const sorters = {
    recent: (a, b) => b.g.updated - a.g.updated,
    name: (a, b) => a.g.title.localeCompare(b.g.title, "es", { sensitivity: "base" }),
    pending: (a, b) => pend(b.g) - pend(a.g),
    progress: (a, b) => prog(b.g) - prog(a.g)
  };
  views.sort(sorters[prefs.sort] || sorters.recent);
  if (!views.length) {
    box.append(h("div", { class: "empty" }, h("big", {}, "🔎"), "No hay nada que coincida con la búsqueda o el filtro."));
    return;
  }
  views.forEach(v => box.append(gameEl(v)));
}

function gameEl({ g, items, forceOpen }) {
  const done = g.items.filter(i => i.done).length, tot = g.items.length, pending = tot - done;
  const d = h("details", { class: "game" + (tot && !pending ? " complete" : "") });
  d.open = !!openState[g.id] || forceOpen;
  d.addEventListener("toggle", () => { if (!forceOpen) openState[g.id] = d.open; });

  d.append(h("summary", {},
    h("span", { class: "chev", "aria-hidden": "true" }, "▶"),
    h("div", { class: "ghead" },
      h("div", { class: "gname" }, hl(g.title)),
      h("div", { class: "gmeta" },
        h("span", { class: "pill s-" + g.status }, STATUS[g.status]),
        g.platform && h("span", { class: "pill" }, hl(g.platform)))
    ),
    h("span", { class: "count" },
      !tot ? "sin pendientes" : !pending ? h("b", {}, "¡Todo hecho! 🎉") : [h("b", {}, pending), pending === 1 ? "pendiente" : "pendientes"],
      tot ? h("small", {}, `${done} de ${tot} hechos`) : null)
  ));
  const bar = h("div", { class: "bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": tot || 1, "aria-valuenow": done }, h("i", {}));
  bar.firstChild.style.width = tot ? (done / tot * 100) + "%" : "0";
  d.append(bar);

  const body = h("div", { class: "body" });
  body.append(gameTools(g, done));
  body.append(newItemForm(g, d));

  let shown = items;
  const hidden = prefs.hideDone ? items.filter(i => i.done).length : 0;
  if (prefs.hideDone) shown = items.filter(i => !i.done);
  if (!tot) body.append(h("div", { class: "empty" }, "Sin pendientes. Añade el primero arriba."));
  shown.forEach(it => body.append(editing[it.id] ? itemEditor(g, it) : itemEl(g, it)));
  if (hidden) body.append(h("p", { class: "hint", style: "text-align:center;margin-top:12px" },
    `${hidden} ${hidden === 1 ? "pendiente hecho oculto" : "pendientes hechos ocultos"}`));
  d.append(body);

  // Arrastrar una foto encima del juego
  d.addEventListener("dragover", e => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); d.classList.add("dragover"); } });
  d.addEventListener("dragleave", e => { if (!d.contains(e.relatedTarget)) d.classList.remove("dragover"); });
  d.addEventListener("drop", e => {
    const f = imageFrom(e.dataTransfer.files);
    d.classList.remove("dragover");
    if (!f) return;
    e.preventDefault();
    d.open = true; openState[g.id] = true;
    d._setImg(f);
  });
  return d;
}

function gameTools(g, done) {
  if (editingGame[g.id]) {
    const t = h("input", { type: "text", value: g.title, maxlength: "80", "aria-label": "Título" });
    const p = h("input", { type: "text", value: g.platform, maxlength: "30", placeholder: "Plataforma", list: "platforms", "aria-label": "Plataforma" });
    const ok = () => {
      const v = t.value.trim(); if (!v) return t.focus();
      g.title = v; g.platform = p.value.trim(); delete editingGame[g.id]; commit(g);
    };
    [t, p].forEach(x => x.addEventListener("keydown", e => {
      if (e.key === "Enter") ok();
      if (e.key === "Escape") { delete editingGame[g.id]; render(); }
    }));
    setTimeout(() => t.focus(), 0);
    return h("div", { class: "editbox", style: "margin-bottom:14px" }, t, p,
      h("div", { class: "row" }, h("span", { class: "spacer" }),
        h("button", { class: "ghost", onclick: () => { delete editingGame[g.id]; render(); } }, "Cancelar"),
        h("button", { class: "primary", onclick: ok }, "Guardar")));
  }
  return h("div", { class: "gtools" },
    selectEl(STATUS, g.status, v => { g.status = v; commit(g); }, "Estado del juego"),
    h("button", { class: "smallbtn", onclick: () => { editingGame[g.id] = true; render(); } }, "✏️ Editar"),
    done ? h("button", { class: "smallbtn", onclick: () => clearDone(g) }, "🧹 Quitar hechos") : null,
    h("span", { class: "spacer" }),
    h("button", { class: "smallbtn red", onclick: () => deleteGame(g) }, "🗑️ Borrar juego"));
}

function newItemForm(g, details) {
  const dr = drafts[g.id] ||= { text: "", caption: "", img: null, priority: "normal" };
  const txt = h("textarea", { placeholder: "Comentario o pendiente (ej. “Falta la llave del jefe final”)", rows: "2", value: dr.text, "aria-label": "Nuevo pendiente" });
  const cap = h("textarea", { placeholder: "Explica qué significa esta foto (opcional)", rows: "2", value: dr.caption, "aria-label": "Nota de la foto" });
  const file = h("input", { type: "file", accept: "image/*", hidden: true });
  const prevBox = h("div");

  const showPreview = () => {
    prevBox.replaceChildren();
    cap.hidden = !dr.img;
    if (dr.img) prevBox.append(h("div", { class: "prevwrap" },
      h("img", { class: "prev", src: dr.img, alt: "Vista previa" }),
      h("button", { type: "button", title: "Quitar foto", "aria-label": "Quitar foto", onclick: () => { dr.img = null; showPreview(); } }, "✕")));
  };
  const setImg = async f => {
    try { dr.img = await shrink(f); showPreview(); }
    catch { toast("No se pudo leer esa imagen."); }
  };
  details._setImg = setImg;

  const submit = () => {
    const t = txt.value.trim(), c = cap.value.trim();
    if (!t && !dr.img) { txt.focus(); return; }
    g.items.push(normItem({ id: uid(), text: t, img: dr.img, caption: dr.img ? c : "", priority: dr.priority, created: Date.now() }));
    if (g.status === "pendiente") g.status = "jugando";
    drafts[g.id] = { text: "", caption: "", img: null, priority: dr.priority };
    commit(g);
    toast("Pendiente guardado");
  };

  txt.addEventListener("input", () => { dr.text = txt.value; });
  cap.addEventListener("input", () => { dr.caption = cap.value; });
  file.addEventListener("change", () => { if (file.files[0]) setImg(file.files[0]); file.value = ""; });
  const onKey = e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } };
  txt.addEventListener("keydown", onKey); cap.addEventListener("keydown", onKey);
  txt.addEventListener("paste", e => {
    const f = imageFrom(e.clipboardData && e.clipboardData.files);
    if (f) { e.preventDefault(); setImg(f); }
  });

  showPreview();
  return h("div", { class: "newitem" },
    txt, prevBox, cap,
    h("div", { class: "filerow" },
      h("label", { class: "filebtn" }, "📷 Foto", file),
      selectEl({ alta: "🔥 Prioridad alta", normal: "Prioridad normal", baja: "💤 Prioridad baja" }, dr.priority, v => { dr.priority = v; }, "Prioridad"),
      h("button", { class: "primary", onclick: submit }, "Guardar")),
    h("p", { class: "hint" }, "Consejo: puedes pegar una captura con Ctrl+V o arrastrar una foto encima del juego. Ctrl+Enter guarda."));
}

function itemEl(g, it) {
  const content = h("div", { class: "content" });
  if (it.img) content.append(h("img", { src: it.img, alt: it.caption || "Foto del pendiente", loading: "lazy", onclick: () => openLightbox(it) }));
  if (it.text) content.append(h("p", { class: "txt" }, hl(it.text)));
  if (it.caption) content.append(h("p", { class: "cap" }, hl(it.caption)));
  content.append(h("div", { class: "imeta" },
    it.priority !== "normal" && h("span", { class: "prio " + it.priority }, it.priority === "alta" ? "🔥 Alta" : "💤 Baja"),
    h("span", {}, "Añadido " + fmtDate(it.created)),
    it.done && it.doneAt && h("span", {}, "· Hecho " + fmtDate(it.doneAt))));

  const acts = h("div", { class: "acts" },
    h("button", {
      class: "ic chk", title: it.done ? "Marcar como pendiente" : "Marcar como hecho",
      "aria-label": it.done ? "Marcar como pendiente" : "Marcar como hecho", "aria-pressed": String(it.done),
      onclick: () => { it.done = !it.done; it.doneAt = it.done ? Date.now() : null; maybeCompleteGame(g); commit(g); }
    }, "✓"),
    h("button", { class: "ic edit", title: "Editar", "aria-label": "Editar pendiente", onclick: () => { editing[it.id] = true; render(); } }, "✎"),
    h("button", { class: "ic del", title: "Borrar", "aria-label": "Borrar pendiente", onclick: () => deleteItem(g, it) }, "✕"));

  return h("div", { class: `item p-${it.priority}` + (it.done ? " done" : "") }, content, acts);
}

function itemEditor(g, it) {
  let img = it.img;
  const txt = h("textarea", { rows: "3", value: it.text, "aria-label": "Texto del pendiente" });
  const cap = h("textarea", { rows: "2", value: it.caption, placeholder: "Nota de la foto", "aria-label": "Nota de la foto" });
  const prio = selectEl({ alta: "🔥 Prioridad alta", normal: "Prioridad normal", baja: "💤 Prioridad baja" }, it.priority, () => {}, "Prioridad");
  const file = h("input", { type: "file", accept: "image/*", hidden: true });
  const prevBox = h("div");
  const quitar = h("button", { type: "button", class: "smallbtn red", onclick: () => { img = null; showPrev(); } }, "Quitar foto");
  const showPrev = () => {
    prevBox.replaceChildren(img ? h("img", { class: "prev", src: img, alt: "Foto" }) : "");
    cap.hidden = !img; quitar.hidden = !img;
  };
  file.addEventListener("change", async () => {
    if (!file.files[0]) return;
    try { img = await shrink(file.files[0]); showPrev(); } catch { toast("No se pudo leer esa imagen."); }
  });
  const close = () => { delete editing[it.id]; render(); };
  const ok = () => {
    const t = txt.value.trim();
    if (!t && !img) { txt.focus(); return; }
    Object.assign(it, { text: t, img, caption: img ? cap.value.trim() : "", priority: prio.value });
    delete editing[it.id]; commit(g);
  };
  [txt, cap].forEach(x => x.addEventListener("keydown", e => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ok(); }
    if (e.key === "Escape") close();
  }));
  setTimeout(() => txt.focus(), 0);
  showPrev();
  return h("div", { class: `item p-${it.priority}` },
    h("div", { class: "content editbox" }, prevBox, txt, cap,
      h("div", { class: "row" },
        h("label", { class: "filebtn" }, img ? "📷 Cambiar foto" : "📷 Añadir foto", file), quitar, prio,
        h("span", { class: "spacer" }),
        h("button", { class: "ghost", onclick: close }, "Cancelar"),
        h("button", { class: "primary", onclick: ok }, "Guardar"))));
}

/* ===== Acciones ===== */
function maybeCompleteGame(g) {
  if (g.items.length && g.items.every(i => i.done) && g.status !== "completado")
    setTimeout(() => toast(`¡Has terminado todos los pendientes de “${g.title}”! 🎉`, null), 50);
}
function deleteItem(g, it) {
  const idx = g.items.indexOf(it);
  if (idx < 0) return;
  g.items.splice(idx, 1);
  commit(g);
  toast("Pendiente borrado", () => { g.items.splice(Math.min(idx, g.items.length), 0, it); commit(g); });
}
function clearDone(g) {
  const before = g.items;
  const n = before.filter(i => i.done).length;
  g.items = before.filter(i => !i.done);
  commit(g);
  toast(`${n} ${n === 1 ? "pendiente hecho quitado" : "pendientes hechos quitados"}`, () => { g.items = before; commit(g); });
}
function deleteGame(g) {
  const idx = data.indexOf(g);
  if (idx < 0) return;
  data.splice(idx, 1);
  save(); render();
  toast(`“${g.title}” borrado`, () => { data.splice(Math.min(idx, data.length), 0, g); commit(g); });
}
function addGame(e) {
  e.preventDefault();
  const n = $("#gameName"), p = $("#gamePlatform"), t = n.value.trim();
  if (!t) return n.focus();
  const g = normGame({ id: uid(), title: t, platform: p.value.trim(), status: "jugando", created: Date.now(), items: [] });
  data.unshift(g);
  n.value = ""; p.value = "";
  if (prefs.status && prefs.status !== g.status) { prefs.status = ""; $("#statusFilter").value = ""; savePrefs(); }
  commit(g);
}

/* ===== Visor de fotos ===== */
function openLightbox(it) {
  $("#lightboxImg").src = it.img;
  $("#lightboxImg").alt = it.caption || "Foto del pendiente";
  $("#lightboxCap").textContent = it.caption || it.text || "";
  $("#lightbox").showModal();
}

/* ===== Copias de seguridad ===== */
function exportData() {
  const payload = { app: "pendientes-juegos", version: 2, exported: new Date().toISOString(), games: data };
  const blob = new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: `pendientes-juegos-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("Copia exportada");
}

let pendingImport = null;
async function importFile(f) {
  try {
    const obj = JSON.parse(await f.text());
    const games = Array.isArray(obj) ? obj : obj && obj.games;
    if (!Array.isArray(games)) throw new Error();
    pendingImport = games.filter(g => g && typeof g === "object" && g.title).map(normGame);
    if (!pendingImport.length) throw new Error();
    const n = pendingImport.length, m = pendingImport.reduce((s, g) => s + g.items.length, 0);
    $("#importInfo").textContent = `El archivo contiene ${n} ${n === 1 ? "juego" : "juegos"} y ${m} ${m === 1 ? "pendiente" : "pendientes"}. ¿Qué quieres hacer?`;
    $("#impMerge").hidden = !data.length;
    $("#importDialog").showModal();
  } catch {
    toast("Ese archivo no es una copia válida.");
  }
}
function applyImport(mode) {
  if (!pendingImport) return;
  const before = data;
  if (mode === "replace") data = pendingImport;
  else {
    const ids = new Set(data.flatMap(g => [g.id, ...g.items.map(i => i.id)]));
    pendingImport.forEach(g => {
      if (ids.has(g.id)) g.id = uid();
      g.items.forEach(i => { if (ids.has(i.id)) i.id = uid(); });
    });
    data = [...data, ...pendingImport];
  }
  pendingImport = null;
  $("#importDialog").close();
  save(); render();
  toast("Copia importada", () => { data = before; save(); render(); });
}

/* ===== Tema ===== */
function applyTheme() {
  const r = document.documentElement;
  if (prefs.theme === "auto") delete r.dataset.theme; else r.dataset.theme = prefs.theme;
  const [icon, label] = THEMES[prefs.theme] || THEMES.auto;
  $("#themeBtn").textContent = icon;
  $("#themeBtn").title = label;
  $("#themeBtn").setAttribute("aria-label", label + " (pulsa para cambiar)");
}

/* ===== Arranque ===== */
function wire() {
  $("#addGameForm").addEventListener("submit", addGame);

  let st;
  $("#search").addEventListener("input", e => { clearTimeout(st); st = setTimeout(() => { query = e.target.value; render(); }, 120); });
  $("#statusFilter").addEventListener("change", e => { prefs.status = e.target.value; savePrefs(); render(); });
  $("#sort").addEventListener("change", e => { prefs.sort = e.target.value; savePrefs(); render(); });
  $("#hideDone").addEventListener("change", e => { prefs.hideDone = e.target.checked; savePrefs(); render(); });

  $("#themeBtn").addEventListener("click", () => {
    const order = ["auto", "light", "dark"];
    prefs.theme = order[(order.indexOf(prefs.theme) + 1) % order.length];
    savePrefs(); applyTheme();
  });

  const menu = $("#menu"), menuBtn = $("#menuBtn");
  const setMenu = open => { menu.hidden = !open; menuBtn.setAttribute("aria-expanded", String(open)); };
  menuBtn.addEventListener("click", e => { e.stopPropagation(); setMenu(menu.hidden); });
  document.addEventListener("click", e => { if (!menu.hidden && !menu.contains(e.target)) setMenu(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") setMenu(false); });
  $("#exportBtn").addEventListener("click", () => { setMenu(false); exportData(); });
  $("#importBtn").addEventListener("click", () => { setMenu(false); $("#importFile").click(); });
  $("#importFile").addEventListener("change", e => { const f = e.target.files[0]; e.target.value = ""; if (f) importFile(f); });
  $("#impCancel").addEventListener("click", () => { pendingImport = null; $("#importDialog").close(); });
  $("#impMerge").addEventListener("click", () => applyImport("merge"));
  $("#impReplace").addEventListener("click", () => applyImport("replace"));

  const lb = $("#lightbox");
  lb.addEventListener("click", () => lb.close());

  $("#toastUndo").addEventListener("click", () => { const f = undoFn; hideToast(); if (f) f(); });

  // Avisar si se cierra la pestaña con un pendiente a medio escribir
  window.addEventListener("beforeunload", e => {
    if (Object.values(drafts).some(d => d.text.trim() || d.img)) { e.preventDefault(); e.returnValue = ""; }
  });
}

(async function init() {
  wire();
  await load();
  $("#statusFilter").value = prefs.status;
  $("#sort").value = prefs.sort;
  $("#hideDone").checked = !!prefs.hideDone;
  applyTheme();
  render();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
