/* Diario Gym — pantallas. Los datos y sus reglas viven en datos.js */
"use strict";

const $ = id => document.getElementById(id);
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmtF = f => { const [y, m, d] = String(f).split("-"); return `${+d} ${MESES[m - 1]} ${y.slice(2)}`; };
const fmtCorta = f => { const [, m, d] = String(f).split("-"); return `${+d} ${MESES[m - 1]}`; };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dias = (a, b) => Math.floor((new Date(b + "T00:00") - new Date(a + "T00:00")) / 864e5);
const TIPS = {
  1: "<b>Semana 1:</b> familiarízate con los ejercicios y anota dudas.",
  2: "<b>Semana 2:</b> lleva la última serie de cada ejercicio al fallo real.",
  3: "<b>Semana 3:</b> progresa en RIR, reps, peso, tiempo bajo tensión y técnica.",
  4: "<b>Semana 4:</b> progresa en RIR, reps, peso, tiempo bajo tensión y técnica.",
  5: "<b>Semana 5:</b> progresa en RIR, reps, peso, tiempo bajo tensión y técnica.",
  6: "<b>Semana 6:</b> descarga. Confírmala con tu coach."
};

let meso = 1, semana = 1, sesion = 1, sucio = false, vista = "entrenar";
const prog = () => S.programa.mesociclos;
const sesionesDe = m => prog()[m]?.sesiones || {};
const clavesSes = m => Object.keys(sesionesDe(m)).map(Number).sort((a, b) => a - b);
const idActual = () => idEntreno(meso, semana, sesion);
const listaEj = () => sesionesDe(meso)[sesion]?.ejercicios || [];

/* ---------- avisos ---------- */
let _toastT = null;
function toast(txt, accion, fn, ms = 4500) {
  const t = $("toast"); clearTimeout(_toastT);
  t.textContent = txt;
  if (accion) { const b = document.createElement("button"); b.textContent = accion; b.onclick = () => { t.hidden = true; fn(); }; t.appendChild(b); }
  t.hidden = false;
  if (ms) _toastT = setTimeout(() => t.hidden = true, ms);
}
function setMsg(id, txt, err) { const m = $(id); m.className = "msg" + (err ? " err" : ""); m.textContent = txt; }

/* ---------- arranque ---------- */
async function iniciar() {
  try { await cargarEstado(); }
  catch (e) { $("main").innerHTML = `<section><div class="card"><h3>No pude abrir tus datos</h3><p>Este navegador no deja guardar datos en el celular (pasa en modo incógnito). Abre la app en Chrome normal.</p></div></section>`; return; }
  if (!S.programa) {
    try { const r = await fetch("datos/programa.json"); await guardarPrograma(limpiarPrograma(await r.json())); }
    catch (e) { $("main").innerHTML = `<section><div class="card"><h3>Falta el programa</h3><p>No pude cargar el programa de entrenamiento. Revisa tu conexión y vuelve a abrir la app.</p></div></section>`; return; }
  }
  if (!S.ajustes.instalado) S.ajustes.instalado = hoy();
  if (!S.ajustes.inicializado && !Object.keys(S.entrenos).length) {
    try {
      const r = await fetch("datos/historial.json", { cache: "no-store" });
      if (r.ok) {
        const imp = interpretarArchivo(await r.json(), S.programa);
        await aplicarImportacion(imp);
        toast(`Importé tu historial: ${Object.keys(imp.entrenos).length} sesiones y ${imp.peso.length} registros de peso.`, null, null, 7000);
      }
    } catch (e) { /* sin historial incluido: se ofrece importarlo a mano */ }
  }
  await guardarAjustes();
  try { navigator.storage?.persist?.(); } catch (e) { }

  $("semana").innerHTML = [1, 2, 3, 4, 5, 6].map(n => `<option value="${n}">Semana ${n}${n == 6 ? " · descarga" : ""}</option>`).join("");
  $("pFecha").value = hoy();
  meso = mesoInicial(); irSiguiente();
  conectar();
  pintarTodo(); cargarForma();
  registrarSW();
}
function mesoInicial() {
  const ms = Object.keys(prog()).map(Number);
  if (S.ajustes.meso && prog()[S.ajustes.meso]) return +S.ajustes.meso;
  const ult = Object.values(S.entrenos).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  if (ult && prog()[ult.meso]) return ult.meso;
  return Math.max(...ms);
}
/* La siguiente sesión que toca: la primera sin hacer de la semana en curso;
   si ya están todas, la primera de la semana siguiente. */
function irSiguiente() {
  const claves = clavesSes(meso);
  const L = Object.values(S.entrenos).filter(e => e.meso == meso);
  if (!L.length) { semana = 1; sesion = claves[0]; return; }
  let w = Math.max(...L.map(e => e.semana));
  let s = claves.find(k => !S.entrenos[idEntreno(meso, w, k)]);
  if (s == null) { if (w < 6) { w++; s = claves[0]; } else s = claves[claves.length - 1]; }
  semana = w; sesion = s;
}

/* ---------- ENTRENAR ---------- */
function pintarControles() {
  const ms = Object.keys(prog()).map(Number).sort((a, b) => a - b);
  $("mesoChips").innerHTML = ms.map(n => `<button type="button" class="chip" data-m="${n}" aria-pressed="${n == meso}">Mesociclo ${n}</button>`).join("");
  $("semana").value = semana;
  $("sesChips").innerHTML = clavesSes(meso).map(n => {
    const id = idEntreno(meso, semana, n), marca = S.entrenos[id] ? ' <span class="ok" aria-label="hecha">✓</span>' : S.borradores[id] ? ' <span class="pend" aria-label="sin guardar">✎</span>' : "";
    return `<button type="button" class="chip" data-s="${n}" aria-pressed="${n == sesion}"><small>Sesión</small>${n}${marca}</button>`;
  }).join("");
  $("focus").textContent = sesionesDe(meso)[sesion]?.titulo || "";
  $("tipSemana").innerHTML = TIPS[semana] || "";
  pintarAvisos();
}
function pintarAvisos() {
  const n = Object.keys(S.entrenos).length;
  $("bienvenida").hidden = !!S.ajustes.inicializado || n > 0;
  const d = diasSinRespaldo(), a = $("avisoRespaldo");
  const toca = n > 0 && d > 14;
  a.hidden = !toca; $("dotRespaldo").hidden = !toca;
  if (toca) a.innerHTML = `<span>Llevas <b>${d} días</b> sin hacer respaldo de tus datos.</span><button type="button" data-ir="respaldo">Respaldar</button>`;
}
function diasSinRespaldo() { return dias(S.ajustes.ultimoRespaldo || S.ajustes.instalado || hoy(), hoy()); }

function filaSet(k, p, l, u) {
  p = p || {}; l = l || {};
  return `<span class="n">${k + 1}</span>
    <input data-k="peso" inputmode="decimal" autocomplete="off" enterkeyhint="next" placeholder="${esc(l.peso ?? "")}" value="${esc(p.peso ?? "")}" aria-label="Serie ${k + 1}, peso">
    <input data-k="reps" inputmode="numeric" autocomplete="off" enterkeyhint="next" placeholder="${esc(l.reps ?? "")}" value="${esc(p.reps ?? "")}" aria-label="Serie ${k + 1}, repeticiones">
    <input data-k="rir" inputmode="numeric" autocomplete="off" enterkeyhint="next" placeholder="${esc(l.rir ?? "")}" value="${esc(p.rir ?? "")}" aria-label="Serie ${k + 1}, RIR">`;
}
function rangoReps(txt) { const m = String(txt).match(/(\d+)\s*-\s*(\d+)/); if (m) return { min: +m[1], max: +m[2] }; const u = String(txt).match(/\d+/); return u ? { min: +u[0], max: +u[0] } : null; }
/* Sugerencia sencilla de progresión a partir de lo que hice la última vez. */
function sugerencia(ej, ult) {
  if (semana == 6) return "Semana de descarga: baja la carga como te indique tu coach.";
  if (!ult) return "";
  const r = rangoReps(ej.reps); if (!r) return "";
  const sets = ult.x.sets.filter(s => s.reps !== ""), reps = sets.map(s => parseInt(s.reps)).filter(n => !isNaN(n));
  if (!reps.length) return "";
  const sinPeso = sets.every(s => !(numero(s.peso) > 0));
  if (reps.length >= Math.min(ej.series, 2) && reps.every(n => n >= r.max))
    return sinPeso ? `Ya haces ${r.max} reps en todas las series: agrega algo de peso o hazlas más lentas.` : `Ya llegaste a ${r.max} reps en todas las series: prueba subir un poco el peso.`;
  if (reps.some(n => n < r.min)) return `Alguna serie quedó abajo de ${r.min} reps: repite el mismo peso hasta completar ${r.min}–${r.max}.`;
  return `Mismo peso que la vez pasada; busca sumar una rep por serie hasta llegar a ${r.max}.`;
}
function tarjeta(ej, i, src, f, id) {
  const x = src ? src.ejercicios.find(z => norm(z.nombre) === norm(ej.nombre)) : null;
  const ult = ultimaVez(ej.nombre, f, id);
  const u = x ? x.unidad : ult ? ult.x.unidad : unidadPorNombre(ej.nombre);
  const notaPrev = ultimaNota(ej.nombre, f, id);
  const n = Math.max(ej.series, x ? x.sets.length : 0);
  let filas = ""; for (let k = 0; k < n; k++) filas += filaSet(k, x?.sets[k], ult?.x.sets[k], u);
  let ultTxt = "Primera vez: anota con qué peso empiezas.";
  if (ult) {
    const donde = (ult.e.meso != meso || ult.e.sesion != sesion) ? ` · M${ult.e.meso} S${ult.e.sesion}` : "";
    ultTxt = `Última vez (${fmtF(ult.e.fecha)}${donde}): <b>${ult.x.sets.filter(s => s.peso !== "" || s.reps !== "").map(s => `${esc(s.peso || "–")}×${esc(s.reps || "–")}`).join(" · ")} ${ult.x.unidad}</b>`;
  }
  const sug = sugerencia(ej, ult);
  return `<article class="ex" data-i="${i}">
    <div class="ex-h"><div><div class="musc">${esc(ej.musculo)}</div><div class="ex-name">${esc(ej.nombre)}</div></div><span class="rec" hidden>★ Récord</span></div>
    <div class="meta"><span>${ej.series} × ${esc(ej.reps)}</span><span>RIR ${esc(ej.rir)}</span><span>Desc. ${esc(ej.descanso)}</span>${ej.nota ? `<span class="nota-prog">${esc(ej.nota)}</span>` : ""}</div>
    <div class="sets"><span></span><button type="button" class="unit" data-u="${u}" aria-label="Cambiar unidad, ahora ${u}">${u} ⇄</button><span class="hd">Reps</span><span class="hd">RIR</span>${filas}</div>
    <div class="ex-acc"><button type="button" class="mini mas">+ Serie</button><button type="button" class="mini desc">⏱ Descanso</button></div>
    <input class="exnote" autocomplete="off" placeholder="${esc(notaPrev ? "Vez pasada: " + notaPrev : "Nota: máquina, asiento, pin…")}" value="${esc(x?.nota || "")}" aria-label="Nota de ${esc(ej.nombre)}">
    <p class="last">${ultTxt}</p>${sug ? `<p class="sug">${esc(sug)}</p>` : ""}</article>`;
}
function cargarForma() {
  const id = idActual(), reg = S.entrenos[id] || null, bor = S.borradores[id] || null, src = bor || reg;
  $("fecha").value = src ? src.fecha : hoy();
  const f = $("fecha").value;
  sucio = !!bor;
  const est = $("estado"); est.hidden = !src;
  est.classList.toggle("pendiente", !!bor);
  if (bor) est.innerHTML = `<b>✎ Sin guardar.</b> Recuperé lo que estabas anotando${reg ? " sobre esta sesión" : ""}. <button type="button" class="link" id="descartar">Descartar cambios</button>`;
  else if (reg) est.innerHTML = `<b>✓ Ya hiciste esta sesión</b> el ${fmtF(reg.fecha)} (Meso ${meso}, semana ${semana}). Lo que cambies aquí corrige ese registro, no crea otro.`;
  $("guardar").textContent = reg ? "Guardar cambios" : "Guardar sesión";
  $("borrar").hidden = !reg;
  $("notas").value = src?.notas || "";
  const lista = listaEj();
  $("exList").innerHTML = lista.length ? lista.map((ej, i) => tarjeta(ej, i, src, f, id)).join("") : `<p class="empty">Este mesociclo no tiene esa sesión.</p>`;
  document.querySelectorAll("#exList .ex").forEach(revisarRecord);
}
function leerSets(card) {
  const p = card.querySelectorAll('[data-k="peso"]'), r = card.querySelectorAll('[data-k="reps"]'), q = card.querySelectorAll('[data-k="rir"]');
  return Array.from(p, (el, k) => ({ peso: el.value.trim().replace(",", "."), reps: r[k].value.trim(), rir: q[k].value.trim() }));
}
function leerForma() {
  const ejercicios = listaEj().map((ej, i) => {
    const card = document.querySelector(`#exList .ex[data-i="${i}"]`);
    let sets = leerSets(card);
    while (sets.length > ej.series && !sets[sets.length - 1].peso && !sets[sets.length - 1].reps && !sets[sets.length - 1].rir) sets.pop();
    return { nombre: ej.nombre, unidad: card.querySelector(".unit").dataset.u, nota: card.querySelector(".exnote").value.trim(), sets };
  });
  return { id: idActual(), meso, semana, sesion, titulo: sesionesDe(meso)[sesion]?.titulo || "", fecha: $("fecha").value || hoy(), notas: $("notas").value.trim(), ejercicios };
}
function revisarRecord(card) {
  const ej = listaEj()[+card.dataset.i]; if (!ej) return;
  const u = card.querySelector(".unit").dataset.u, b = mejorSerie(leerSets(card));
  let es = false;
  if (b && b.peso > 0 && b.reps > 0) {
    const c = comparable(b.peso, u), h = mejorHistorico(ej.nombre, idActual(), c.tipo);
    if (h && (c.v > h.v + 1e-6 || (Math.abs(c.v - h.v) < 1e-6 && b.reps > h.reps))) es = true;
  }
  card.querySelector(".rec").hidden = !es;
}
/* Borrador: lo que voy anotando se guarda solo, por si se cierra la app antes de "Guardar". */
let _borT = null;
function tocar() { sucio = true; setMsg("msg", ""); clearTimeout(_borT); _borT = setTimeout(soltarBorrador, 500); pedirPantalla(); }
function soltarBorrador() {
  clearTimeout(_borT);
  if (!sucio || vistaSinForma()) return;
  const id = idActual(), nuevo = !S.borradores[id];
  S.borradores[id] = leerForma();
  guardarBorradores().catch(() => { });
  if (nuevo) pintarControles();
}
const vistaSinForma = () => !document.querySelector("#exList .ex");

async function guardarSesion() {
  const d = leerForma();
  if (!d.ejercicios.some(x => x.sets.some(s => s.peso || s.reps))) { setMsg("msg", "Anota al menos una serie antes de guardar.", true); return; }
  const viejo = S.entrenos[d.id];
  if (viejo) { const mios = new Set(d.ejercicios.map(x => norm(x.nombre))); viejo.ejercicios.filter(x => !mios.has(norm(x.nombre)) && conDatos(x)).forEach(x => d.ejercicios.push(x)); }
  try {
    clearTimeout(_borT);
    await guardarEntreno(d);
    delete S.borradores[d.id]; await guardarBorradores();
    if (!S.ajustes.inicializado) { S.ajustes.inicializado = true; await guardarAjustes(); }
    sucio = false;
    pintarTodo(); cargarForma();
    setMsg("msg", `Guardada: Meso ${meso}, semana ${semana}, sesión ${sesion}`);
  } catch (e) { setMsg("msg", "No se pudo guardar. Inténtalo otra vez.", true); }
}
function cambiarA(m, w, s) {
  soltarBorrador();
  meso = m; semana = w; sesion = s; setMsg("msg", "");
  pintarControles(); cargarForma();
}

/* ---------- cronómetro de descanso ---------- */
const T = { ini: 0, min: 120, max: 180, id: null, a1: false, a2: false };
function rangoDescanso(txt) {
  const m = String(txt).match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  if (m) return { min: m[1] * 60, max: m[2] * 60 };
  const u = String(txt).match(/\d+(?:\.\d+)?/);
  return u ? { min: u[0] * 60, max: u[0] * 60 } : { min: 120, max: 180 };
}
let _ac = null;
function avisar(n) {
  if (S.ajustes.sonido === false) return;
  try { navigator.vibrate?.(n == 2 ? [250, 120, 250] : 220); } catch (e) { }
  try {
    _ac = _ac || new (window.AudioContext || window.webkitAudioContext)();
    if (_ac.state === "suspended") _ac.resume();
    const t = _ac.currentTime;
    for (let k = 0; k < n; k++) {
      const o = _ac.createOscillator(), g = _ac.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(_ac.destination);
      g.gain.setValueAtTime(0.0001, t + k * 0.28); g.gain.exponentialRampToValueAtTime(0.25, t + k * 0.28 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + k * 0.28 + 0.22);
      o.start(t + k * 0.28); o.stop(t + k * 0.28 + 0.24);
    }
  } catch (e) { }
}
function iniciarDescanso(ej) {
  const r = rangoDescanso(ej?.descanso || "2-3 min");
  Object.assign(T, { ini: Date.now(), min: r.min, max: r.max, a1: false, a2: false });
  $("timer").hidden = false; $("tMark").style.left = (r.min / (r.max || 1) * 100) + "%";
  $("tMark").hidden = r.min >= r.max;
  clearInterval(T.id); T.id = setInterval(tic, 250); tic(); pedirPantalla();
}
function pararDescanso() { clearInterval(T.id); T.id = null; $("timer").hidden = true; }
function tic() {
  const s = (Date.now() - T.ini) / 1000, el = $("timer");
  $("tReloj").textContent = `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  $("tFill").style.width = Math.min(100, s / T.max * 100) + "%";
  el.classList.toggle("listo", s >= T.min && s < T.max); el.classList.toggle("pasado", s >= T.max);
  const mm = v => (v / 60 % 1 ? (v / 60).toFixed(1) : v / 60);
  $("tTxt").textContent = s < T.min ? `Descansa · meta ${mm(T.min)}${T.max > T.min ? "–" + mm(T.max) : ""} min` : s < T.max ? "Listo: ya puedes empezar" : `Ya pasaron ${mm(T.max)} min: ¡a la siguiente!`;
  if (!T.a1 && s >= T.min) { T.a1 = true; if (T.min < T.max) avisar(1); }
  if (!T.a2 && s >= T.max) { T.a2 = true; avisar(2); }
  if (s > T.max + 300) pararDescanso();
}
/* Pantalla encendida mientras anoto (se suelta sola a los 15 min sin tocar nada). */
let _wl = null, _wlT = null;
async function pedirPantalla() {
  if (S.ajustes.pantalla === false || !("wakeLock" in navigator)) return;
  clearTimeout(_wlT); _wlT = setTimeout(soltarPantalla, 15 * 60000);
  if (_wl || document.visibilityState !== "visible") return;
  try { _wl = await navigator.wakeLock.request("screen"); _wl.addEventListener("release", () => { _wl = null; }); } catch (e) { _wl = null; }
}
function soltarPantalla() { clearTimeout(_wlT); try { _wl?.release(); } catch (e) { } _wl = null; }

/* ---------- HISTORIAL ---------- */
function renderHist() {
  const list = Object.values(S.entrenos).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.meso - a.meso || b.semana - a.semana || b.sesion - a.sesion);
  if (!list.length) { $("histList").innerHTML = `<p class="empty">Aquí aparecerán tus sesiones guardadas. Empieza en la pestaña Entrenar.</p>`; return; }
  $("histList").innerHTML = list.map(e => {
    const tit = sesionesDe(e.meso)[e.sesion]?.titulo || e.titulo || "";
    const items = e.ejercicios.map(x => { const b = mejorSerie(x.sets); return b ? `<li>${esc(x.nombre)}: ${b.peso} ${x.unidad} × ${b.reps}</li>` : ""; }).join("");
    return `<button type="button" class="card hist" data-id="${e.id}"><div class="topl"><h3>M${e.meso} · Sesión ${e.sesion} · ${esc(tit)}</h3><span class="last">${fmtF(e.fecha)} · Sem ${e.semana}</span></div><ul>${items}</ul>${e.notas ? `<p class="last">${esc(e.notas)}</p>` : ""}</button>`;
  }).join("");
}

/* ---------- gráficas ---------- */
function lineas(pts, unit) {
  if (pts.length < 2) return `<p class="empty">${pts.length ? "Con un registro más verás la gráfica." : "Sin registros todavía."}</p>`;
  const W = 360, H = 190, L = 34, R = 12, Tp = 14, B = 26, ys = pts.map(p => p.y); let mn = Math.min(...ys), mx = Math.max(...ys); if (mn == mx) { mn -= 1; mx += 1; }
  const pad = (mx - mn) * .12; mn -= pad; mx += pad;
  const x = i => L + i * (W - L - R) / (pts.length - 1), y = v => Tp + (mx - v) * (H - Tp - B) / (mx - mn);
  const ticks = [mn + pad, (mn + mx) / 2, mx - pad];
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:280px;max-width:560px;height:auto;display:block" role="img" aria-label="Gráfica en ${unit}">
   ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${+t.toFixed(1)}</text>`).join("")}
   <path d="${path} L${x(pts.length - 1)},${H - B} L${x(0)},${H - B}Z" fill="var(--accent)" fill-opacity=".12"/>
   <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>
   ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.y)}" r="${i == pts.length - 1 ? 5 : pts.length > 40 ? 1.5 : 3}" fill="var(--accent)"><title>${fmtF(p.f)}: ${p.y} ${unit}</title></circle>`).join("")}
   <text x="${x(0)}" y="${H - 6}">${fmtF(pts[0].f)}</text><text x="${x(pts.length - 1)}" y="${H - 6}" text-anchor="end">${fmtF(pts[pts.length - 1].f)}</text></svg>`;
}
function barras(pts, goal, unit, fmt) {
  if (!pts.length) return `<p class="empty">Sin datos.</p>`;
  const W = 360, H = 190, L = 34, R = 10, Tp = 12, B = 26, mx = Math.max(goal * 1.15, ...pts.map(p => p.y)), bw = (W - L - R) / pts.length;
  const y = v => Tp + (mx - v) * (H - Tp - B) / mx;
  const ticks = [0, goal]; if (mx > goal * 1.4) ticks.push(mx);
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:280px;max-width:560px;height:auto;display:block" role="img" aria-label="Barras en ${unit}">
  ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`).join("")}
  ${pts.map((p, i) => `<rect x="${L + i * bw + bw * .15}" y="${y(p.y)}" width="${bw * .7}" height="${Math.max(0, H - B - y(p.y))}" rx="2" fill="${p.y >= goal ? "var(--good)" : "var(--accent)"}" fill-opacity="${p.y >= goal ? 1 : .55}"><title>${fmtF(p.f)}: ${fmt(p.y)}</title></rect>`).join("")}
  <line x1="${L}" x2="${W - R}" y1="${y(goal)}" y2="${y(goal)}" stroke="var(--good)" stroke-dasharray="5 4" stroke-width="1.5"/>
  <text x="${L}" y="${H - 6}">${fmtF(pts[0].f)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end">${fmtF(pts[pts.length - 1].f)}</text></svg>`;
}
const stat = (v, t) => `<div class="stat"><b>${v}</b><span>${t}</span></div>`;

/* ---------- PROGRESO ---------- */
function renderConstancia() {
  const cs = clavesSes(meso);
  $("constTit").textContent = `Constancia · Mesociclo ${meso}`;
  let h = `<div class="const" style="--n:${cs.length}"><span></span>${cs.map(s => `<span class="h">S${s}</span>`).join("")}`;
  for (let w = 1; w <= 6; w++) {
    h += `<span class="w">Sem ${w}</span>`;
    cs.forEach(s => { const e = S.entrenos[idEntreno(meso, w, s)]; h += `<span class="c${e ? " si" : ""}${w == semana && s == sesion ? " hoy" : ""}">${e ? fmtCorta(e.fecha) : ""}</span>`; });
  }
  const n = Object.values(S.entrenos).filter(e => e.meso == meso).length;
  $("constancia").innerHTML = h + `</div><p class="last" style="margin-top:8px">${n} de ${cs.length * 6} sesiones hechas. El recuadro azul es la que tienes abierta en Entrenar.</p>`;
}
function opcionesEjercicios() {
  const vistos = new Set(), sel = $("exSel"), antes = sel.value; let html = "";
  Object.keys(prog()).map(Number).sort((a, b) => b - a).forEach((m, idx) => {
    const ops = [];
    clavesSes(m).forEach(s => sesionesDe(m)[s].ejercicios.forEach(e => { const k = norm(e.nombre); if (!vistos.has(k)) { vistos.add(k); ops.push(e.nombre); } }));
    if (ops.length) html += `<optgroup label="${idx == 0 ? "Mesociclo " + m : "Solo en Mesociclo " + m}">${ops.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("")}</optgroup>`;
  });
  const otros = [];
  Object.values(S.entrenos).forEach(e => e.ejercicios.forEach(x => { const k = norm(x.nombre); if (!vistos.has(k) && conDatos(x)) { vistos.add(k); otros.push(x.nombre); } }));
  if (otros.length) html += `<optgroup label="De programas anteriores">${otros.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("")}</optgroup>`;
  sel.innerHTML = html;
  if (antes && [...sel.options].some(o => o.value === antes)) sel.value = antes;
}
function renderProgreso() {
  renderConstancia();
  const p = Object.values(S.peso).sort((a, b) => a.fecha.localeCompare(b.fecha));
  $("pChart").innerHTML = lineas(p.map(r => ({ f: r.fecha, y: +r.kg })), "kg");
  $("pTabla").innerHTML = p.length ? `<table><tr><th>Fecha</th><th>Kg</th><th>Cambio</th><th></th></tr>${p.slice().reverse().slice(0, 10).map((r, i, a) => { const n = a[i + 1]; const d = n ? (r.kg - n.kg) : null; return `<tr><td>${fmtF(r.fecha)}</td><td>${r.kg}</td><td>${d == null ? "–" : (d > 0 ? "+" : "") + d.toFixed(1)}</td><td style="text-align:right"><button type="button" class="x" data-borrar-peso="${r.fecha}" aria-label="Borrar peso del ${fmtF(r.fecha)}">×</button></td></tr>`; }).join("")}</table>` : "";
  const name = $("exSel").value; if (!name) { $("exChart").innerHTML = ""; $("exTabla").innerHTML = ""; $("exStats").innerHTML = ""; return; }
  const rows = historiaEjercicio(name);
  const u = rows.length ? rows[rows.length - 1].u : unidadPorNombre(name);
  /* kg y lb se convierten a la unidad más reciente; las placas solo se comparan con placas */
  const cv = r => r.u == u ? r.b.peso : (r.u == "placa" || u == "placa") ? null : +(u == "kg" ? r.b.peso * LB : r.b.peso / LB).toFixed(1);
  const pts = rows.map(r => ({ f: r.f, y: cv(r) })).filter(q => q.y != null);
  $("exChart").innerHTML = lineas(pts, u);
  if (pts.length) {
    const mx = Math.max(...pts.map(q => q.y)), d = pts[pts.length - 1].y - pts[0].y;
    $("exStats").innerHTML = stat(`${mx} ${u}`, "Mejor marca") + stat(rows.length, rows.length == 1 ? "Vez registrada" : "Veces registradas") + (pts.length > 1 ? stat(`${d > 0 ? "+" : ""}${+d.toFixed(1)} ${u}`, "Cambio desde la primera vez") : "");
  } else $("exStats").innerHTML = "";
  $("exTabla").innerHTML = rows.length ? `<table><tr><th>Fecha</th><th>Mejor serie</th><th></th></tr>${rows.slice().reverse().map(r => `<tr><td>${fmtF(r.f)}</td><td>${r.b.peso} ${r.u} × ${r.b.reps}</td><td class="last">M${r.meso}</td></tr>`).join("")}</table>` : "";
}

/* ---------- RESUMEN PARA LA NUTRIÓLOGA ---------- */
const sumarDias = (f, n) => { const d = new Date(f + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const signo = (n, dec = 1) => { const v = +n.toFixed(dec); return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v); };
function pintarPeriodos() {
  const sel = $("resPer"), antes = sel.value, u = S.ajustes.ultimoResumen;
  sel.innerHTML = (u && u < hoy() ? `<option value="u">Desde mi último resumen (${fmtF(u)})</option>` : "") +
    [[7, "Últimos 7 días"], [14, "Últimos 14 días"], [30, "Últimos 30 días"], [90, "Últimos 3 meses"]].map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
  sel.value = antes && [...sel.options].some(o => o.value === antes) ? antes : (u && u < hoy() ? "u" : "30");
}
function periodoResumen() {
  const v = $("resPer").value, hasta = hoy();
  return { desde: v === "u" ? sumarDias(S.ajustes.ultimoResumen, 1) : sumarDias(hasta, -(+v - 1)), hasta };
}
/* Texto listo para WhatsApp (los *asteriscos* salen en negritas).
   Va en dos partes: lo que le sirve como nutrióloga y lo que le sirve como coach de entrenamiento. */
function armarResumen(desde, hasta, op) {
  const en = f => f >= desde && f <= hasta, nd = dias(desde, hasta) + 1, avg = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  const E = Object.values(S.entrenos).filter(e => en(e.fecha)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const N = [], T = [];

  /* ---- parte de nutrición y salud ---- */
  if (op.peso) {
    const P = Object.values(S.peso).sort((a, b) => a.fecha.localeCompare(b.fecha)), dentro = P.filter(p => en(p.fecha));
    N.push("", "*Peso corporal*");
    if (!P.length) N.push("• Sin registros de peso.");
    else if (dentro.length >= 2) { const a = dentro[0], b = dentro[dentro.length - 1]; N.push(`• De ${a.kg} kg (${fmtF(a.fecha)}) a ${b.kg} kg (${fmtF(b.fecha)}): ${signo(b.kg - a.kg)} kg`); }
    else {
      const b = P[P.length - 1], a = P[P.length - 2];
      N.push(`• Último registro: ${b.kg} kg (${fmtF(b.fecha)})${en(b.fecha) ? "" : ", anterior a este periodo"}`);
      if (a) N.push(`• Cambio contra el registro anterior (${a.kg} kg, ${fmtF(a.fecha)}): ${signo(b.kg - a.kg)} kg`);
    }
    const C = S.reloj?.composicion || [];
    if (C.length) {
      const c = C[C.length - 1], p = C[C.length - 2], d = [];
      N.push("", `*Composición corporal* (medición del ${fmtF(c.fecha)})`);
      if (c.grasa != null) d.push(`Grasa: ${c.grasa} %`); if (c.musculo != null) d.push(`Músculo: ${c.musculo} kg`); if (c.agua != null) d.push(`Agua: ${c.agua} kg`);
      if (d.length) N.push("• " + d.join(" · "));
      if (c.tmb != null) N.push(`• Metabolismo basal: ${c.tmb} kcal`);
      if (p && c.grasa != null && p.grasa != null) N.push(`• Contra la medición del ${fmtF(p.fecha)}: grasa ${signo(c.grasa - p.grasa)} puntos${c.musculo != null && p.musculo != null ? `, músculo ${signo(c.musculo - p.musculo)} kg` : ""}`);
    }
  }
  if (op.reloj) {
    const r = S.reloj || {};
    const P = Object.entries(r.pasos || {}).filter(([f]) => en(f) && (!r.actualizado || f < r.actualizado)).map(x => x[1]);
    const Sn = Object.entries(r.sueno || {}).filter(([f]) => en(f)).map(x => x[1].h), F = Object.entries(r.fcSueno || {}).filter(([f]) => en(f)).map(x => +x[1]);
    N.push("", "*Pasos y sueño (reloj)*");
    if (!P.length && !Sn.length && !F.length) N.push(`• Sin datos del reloj en este periodo${r.actualizado ? ` (los últimos que tengo cargados son del ${fmtF(r.actualizado)})` : ""}.`);
    else {
      if (P.length) N.push(`• Pasos: ${Math.round(avg(P)).toLocaleString("es-MX")} al día en promedio; ${P.filter(v => v >= 12000).length} de ${P.length} días con 12,000 o más`);
      if (Sn.length) N.push(`• Sueño: ${hm(avg(Sn))} en promedio; ${Sn.filter(v => v >= 7).length} de ${Sn.length} noches con 7 h o más`);
      if (F.length) N.push(`• Pulso en reposo durmiendo: ${Math.round(avg(F))} latidos por minuto en promedio`);
      if (r.actualizado && r.actualizado < hasta) N.push(`• Nota: solo tengo cargados datos del reloj hasta el ${fmtF(r.actualizado)}`);
    }
  }

  /* ---- parte de entrenamiento ---- */
  if (op.entreno) {
    T.push("", "*Sesiones de pesas*");
    if (!E.length) T.push("• Sin sesiones registradas en este periodo.");
    else {
      const u = E[E.length - 1];
      T.push(`• Voy en: Mesociclo ${u.meso}, semana ${u.semana}`);
      T.push(`• ${E.length} ${E.length == 1 ? "sesión" : "sesiones"} en ${nd} días${nd >= 7 ? ` (${+(E.length / nd * 7).toFixed(1)} por semana)` : ""}`);
      E.forEach(e => T.push(`• ${fmtCorta(e.fecha)}: M${e.meso} sem ${e.semana} · ${sesionesDe(e.meso)[e.sesion]?.titulo || e.titulo || "Sesión " + e.sesion}`));
    }
  }
  if ((op.fuerza || op.detalle) && E.length) {
    let sube = 0, igual = 0, baja = 0; const vistos = new Set(), det = [];
    E.forEach(e => e.ejercicios.forEach(x => {
      const k = norm(x.nombre); if (vistos.has(k)) return; vistos.add(k);
      const h = historiaEjercicio(x.nombre); let i = -1; h.forEach((r, j) => { if (en(r.f)) i = j; });
      if (i < 0) return;
      const cur = h[i], prev = i > 0 ? h[i - 1] : null;
      if (!prev) { det.push(`• ${x.nombre}: ${cur.b.peso} ${cur.u} × ${cur.b.reps} (primera vez)`); return; }
      const a = comparable(prev.b.peso, prev.u), b = comparable(cur.b.peso, cur.u);
      let marca = "";
      if (a.tipo === b.tipo) {
        const d = Math.abs(b.v - a.v) > 1e-6 ? b.v - a.v : cur.b.reps - prev.b.reps;
        if (d > 0) { sube++; marca = " ↑"; } else if (d < 0) { baja++; marca = " ↓"; } else { igual++; marca = " ="; }
      }
      det.push(`• ${x.nombre}: ${cur.b.peso} ${cur.u} × ${cur.b.reps} (antes ${prev.b.peso} ${prev.u} × ${prev.b.reps})${marca}`);
    }));
    if (op.fuerza && sube + igual + baja) T.push("", "*Fuerza*", `• Contra la vez anterior de cada ejercicio: subí en ${sube}, igual en ${igual}, bajé en ${baja}`);
    if (op.detalle && det.length) T.push("", "*Mejor serie por ejercicio* (última vez y la anterior)", ...det);
  }
  if (op.notas) {
    const con = E.filter(e => e.notas);
    if (con.length) { T.push("", "*Cómo me sentí en cada sesión*"); con.forEach(e => T.push(`• ${fmtCorta(e.fecha)}: ${e.notas}`)); }
  }

  const L = ["*Resumen de avance*", `Del ${fmtF(desde)} al ${fmtF(hasta)}`];
  if (N.length) L.push("", "━━ *NUTRICIÓN Y SALUD* ━━", ...N.slice(1));
  if (T.length) L.push("", "━━ *ENTRENAMIENTO* ━━", ...T.slice(1));
  if (!N.length && !T.length) L.push("", "Marca al menos una sección para armar el resumen.");
  return L.join("\n");
}
/* Atajos: completo, solo lo de nutrición o solo lo de entrenamiento. */
const TIPOS_RESUMEN = {
  todo: { rsPeso: 1, rsReloj: 1, rsEntreno: 1, rsFuerza: 1, rsDetalle: 1, rsNotas: 1 },
  nutri: { rsPeso: 1, rsReloj: 1, rsEntreno: 1, rsFuerza: 0, rsDetalle: 0, rsNotas: 1 },
  entreno: { rsPeso: 0, rsReloj: 0, rsEntreno: 1, rsFuerza: 1, rsDetalle: 1, rsNotas: 1 }
};
function aplicarTipoResumen() { const t = TIPOS_RESUMEN[$("resTipo").value]; if (t) Object.entries(t).forEach(([id, v]) => $(id).checked = !!v); }
function pintarResumen() {
  const p = periodoResumen();
  $("resTxt").value = armarResumen(p.desde, p.hasta, { peso: $("rsPeso").checked, entreno: $("rsEntreno").checked, fuerza: $("rsFuerza").checked, detalle: $("rsDetalle").checked, reloj: $("rsReloj").checked, notas: $("rsNotas").checked });
  $("resCaja").hidden = false; setMsg("resMsg", "");
  $("resCompartir").hidden = !navigator.share;
}
async function resumenEnviado(txt) { S.ajustes.ultimoResumen = hoy(); await guardarAjustes(); setMsg("resMsg", txt); }

/* ---------- RELOJ ---------- */
const hm =h => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
function renderReloj() {
  const r = S.reloj;
  if (!r) { ["rPasosSt", "rSuenoSt"].forEach(i => $(i).innerHTML = ""); ["rPasos", "rSueno", "rFc", "rComp"].forEach(i => $(i).innerHTML = `<p class="empty">Sin datos.</p>`); return; }
  if (r.actualizado) $("rUpd").textContent = `Datos de Samsung Health hasta el ${fmtF(r.actualizado)}. Las barras verdes cumplen la meta del programa.`;
  const avg = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  const P = Object.entries(r.pasos || {}).sort((a, b) => a[0].localeCompare(b[0])).filter(([f]) => !r.actualizado || f < r.actualizado);
  const p30 = P.slice(-30);
  $("rPasosSt").innerHTML = stat(Math.round(avg(p30.map(x => x[1]))).toLocaleString("es-MX"), `Promedio últimos ${p30.length} días`) + stat(`${p30.filter(x => x[1] >= 12000).length} de ${p30.length}`, "Días con 12,000 o más") + stat("12–14 mil", "Meta diaria del programa");
  $("rPasos").innerHTML = barras(p30.map(([f, v]) => ({ f, y: v })), 12000, "pasos", v => v >= 1000 ? Math.round(v / 1000) + "k" : Math.round(v));
  const Sn = Object.entries(r.sueno || {}).sort((a, b) => a[0].localeCompare(b[0])), s20 = Sn.slice(-20);
  $("rSuenoSt").innerHTML = stat(s20.length ? hm(avg(s20.map(x => x[1].h))) : "–", `Promedio últimas ${s20.length} noches registradas`) + stat(`${s20.filter(x => x[1].h >= 7).length} de ${s20.length}`, "Noches con 7 h o más") + stat(Sn.length ? fmtF(Sn[Sn.length - 1][0]) : "–", "Última noche registrada");
  $("rSueno").innerHTML = barras(s20.map(([f, v]) => ({ f, y: v.h })), 7, "horas", v => (+v.toFixed(1)) + "h");
  const F = Object.entries(r.fcSueno || {}).sort((a, b) => a[0].localeCompare(b[0]));
  $("rFc").innerHTML = lineas(F.map(([f, v]) => ({ f, y: +v })), "latidos por minuto");
  const C = r.composicion || [], v = (x, u) => x == null ? "–" : `${x}${u}`;
  $("rComp").innerHTML = C.length ? `<div style="overflow-x:auto"><table><tr><th>Fecha</th><th>Peso</th><th>Grasa</th><th>Músculo esq.</th><th>Agua</th></tr>${C.map(c => `<tr><td>${fmtF(c.fecha)}</td><td>${v(c.kg, " kg")}</td><td>${v(c.grasa, "%")}</td><td>${v(c.musculo, " kg")}</td><td>${v(c.agua, " kg")}</td></tr>`).join("")}</table></div>` : `<p class="empty">Sin mediciones.</p>`;
}

/* ---------- PROGRAMA ---------- */
function renderPrograma() {
  const ms = Object.keys(prog()).map(Number).sort((a, b) => b - a);
  $("progVista").innerHTML = ms.map((m, idx) => {
    const hechas = Object.values(S.entrenos).filter(e => e.meso == m).length;
    return `<details class="det pv"${idx == 0 ? " open" : ""}><summary>Mesociclo ${m} <small>· ${clavesSes(m).length} sesiones · ${hechas} registradas</small></summary>${clavesSes(m).map(s => {
      const ses = sesionesDe(m)[s];
      return `<p class="pv-ses">Sesión ${s} · ${esc(ses.titulo)}</p><ol>${ses.ejercicios.map(e => `<li>${esc(e.nombre)} <span>— ${e.series} × ${esc(e.reps)}${e.nota ? " · " + esc(e.nota) : ""}</span></li>`).join("")}</ol>`;
    }).join("")}</details>`;
  }).join("");
  if (!$("mesoEj").textContent) $("mesoEj").textContent = JSON.stringify({ mesociclos: { "3": { sesiones: { "1": { titulo: "Pecho · Tríceps", ejercicios: [{ musculo: "Pectoral", nombre: "Press de banca plano con barra", series: 3, reps: "8-10", rir: "2-0", nota: "", descanso: "2-3 min" }] }, "2": { titulo: "…", ejercicios: ["…"] } } } } }, null, 1);
}
async function agregarMeso(txt) {
  if (!txt.trim()) { setMsg("mesoMsg", "Pega primero el texto del mesociclo.", true); return; }
  let nuevos;
  try { nuevos = leerMesosNuevos(txt, S.programa); } catch (e) { setMsg("mesoMsg", "No se agregó: " + e.message, true); return; }
  const claves = Object.keys(nuevos).map(Number), ya = claves.filter(k => prog()[k]);
  if (ya.length) {
    const usados = ya.filter(k => Object.values(S.entrenos).some(e => e.meso == k));
    if (!confirm(`Ya existe el Mesociclo ${ya.join(", ")}. ¿Reemplazarlo con el nuevo?${usados.length ? "\n\nYa tienes sesiones registradas ahí; no se borran, pero quedarán ligadas al programa nuevo." : ""}`)) return;
  }
  const p = JSON.parse(JSON.stringify(S.programa)); Object.assign(p.mesociclos, nuevos);
  await guardarPrograma(p);
  soltarBorrador();
  meso = Math.max(...claves); S.ajustes.meso = meso; await guardarAjustes();
  irSiguiente(); $("mesoTxt").value = "";
  pintarTodo(); cargarForma();
  setMsg("mesoMsg", `Listo: agregué el Mesociclo ${claves.join(", ")} (${claves.map(k => clavesSes(k).length + " sesiones").join(", ")}). Ya quedó seleccionado en Entrenar.`);
}

/* ---------- RESPALDO ---------- */
function renderRespaldo() {
  const n = Object.keys(S.entrenos).length, u = S.ajustes.ultimoRespaldo, d = diasSinRespaldo();
  $("resEstado").innerHTML = `Tienes <b>${n} sesiones</b> y <b>${Object.keys(S.peso).length} registros de peso</b> guardados en este celular. ` +
    (u ? `Último respaldo: <b>${fmtF(u)}</b>${d > 0 ? ` (hace ${d} día${d == 1 ? "" : "s"})` : " (hoy)"}.` : "<b>Todavía no has hecho ningún respaldo.</b>");
  $("ajDescanso").checked = S.ajustes.autoDescanso !== false;
  $("ajSonido").checked = S.ajustes.sonido !== false;
  $("ajPantalla").checked = S.ajustes.pantalla !== false;
  $("verInfo").textContent = `Diario Gym · versión ${VERSION_APP} · funciona sin internet`;
  try { $("shareBtn").hidden = !navigator.canShare?.({ files: [new File(["x"], "respaldo.txt", { type: "text/plain" })] }); } catch (e) { $("shareBtn").hidden = true; }
}
async function marcarRespaldo(txt) { S.ajustes.ultimoRespaldo = hoy(); await guardarAjustes(); renderRespaldo(); pintarAvisos(); setMsg("expMsg", txt); }
async function exportar(compartir) {
  soltarBorrador();
  const txt = JSON.stringify(armarRespaldo(), null, 1), base = `diario-gym-respaldo-${hoy()}`;
  if (compartir) {
    try { await navigator.share({ files: [new File([txt], base + ".txt", { type: "text/plain" })], title: "Respaldo Diario Gym" }); await marcarRespaldo("Respaldo compartido. Guárdalo en un lugar seguro."); }
    catch (e) { if (e.name !== "AbortError") setMsg("expMsg", "No se pudo compartir. Usa Descargar respaldo.", true); }
    return;
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type: "application/json" })); a.download = base + ".json";
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  await marcarRespaldo(`Se descargó "${base}.json" a tu carpeta de Descargas. Súbelo a Google Drive para tenerlo a salvo.`);
}
async function importarArchivo(file, msgId) {
  let imp;
  try { imp = interpretarArchivo(JSON.parse(await file.text()), S.programa); }
  catch (e) { setMsg(msgId, "No se importó: " + (e instanceof SyntaxError ? "el archivo está dañado o no es un respaldo." : e.message), true); return; }
  const n = Object.keys(imp.entrenos).length, hay = Object.keys(S.entrenos).length;
  if (hay && !confirm(`El archivo trae ${n} sesiones y ${imp.peso.length} registros de peso.\n\nSe reemplazará lo que hay ahora en este celular (${hay} sesiones). ¿Continuar?`)) return;
  try { await aplicarImportacion(imp); } catch (e) { setMsg(msgId, "No se pudo guardar la importación. Tus datos anteriores siguen intactos.", true); return; }
  sucio = false; meso = mesoInicial(); irSiguiente();
  pintarTodo(); cargarForma();
  setMsg(msgId, `Listo: importé ${n} sesiones y ${imp.peso.length} registros de peso.${imp.avisos.length ? " " + imp.avisos.join(" ") : ""}`);
  toast(`Importé ${n} sesiones.`);
}
async function importarCSV(files) {
  const reloj = JSON.parse(JSON.stringify(S.reloj || {})), pesoNuevo = {}, out = []; let ok = false;
  for (const f of files) {
    let r; try { r = leerCSVSamsung(f.name, await f.text(), reloj, pesoNuevo); } catch (e) { r = { ok: false, txt: "no se pudo leer." }; }
    out.push(`${r.ok ? "✓" : "✗"} ${esc(f.name)}: ${esc(r.txt)}`); ok = ok || r.ok;
  }
  if (ok) {
    await guardarReloj(reloj);
    for (const [f, kg] of Object.entries(pesoNuevo)) if (!S.peso[f]) await guardarPeso(f, kg);
    renderReloj(); renderProgreso();
  }
  $("csvMsg").innerHTML = out.join("<br>");
}

/* ---------- navegación y eventos ---------- */
function mostrar(v) {
  if (vista === "entrenar" && v !== "entrenar") soltarBorrador();
  vista = v;
  document.querySelectorAll("nav.tabs [data-tab]").forEach(b => b.setAttribute("aria-selected", b.dataset.tab == v));
  ["entrenar", "historial", "progreso", "reloj", "programa", "respaldo"].forEach(x => $("v-" + x).hidden = x != v);
  $("btnRespaldo").setAttribute("aria-pressed", v == "respaldo");
  if (v == "historial") renderHist(); if (v == "progreso") renderProgreso(); if (v == "reloj") renderReloj();
  if (v == "programa") renderPrograma(); if (v == "respaldo") renderRespaldo();
  if (v != "entrenar") soltarPantalla();
  scrollTo(0, 0);
}
function pintarTodo() { pintarControles(); opcionesEjercicios(); pintarPeriodos(); renderHist(); renderProgreso(); renderReloj(); renderPrograma(); renderRespaldo(); }

function conectar() {
  document.querySelector("nav.tabs").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (b) mostrar(b.dataset.tab); });
  $("btnRespaldo").addEventListener("click", () => mostrar(vista == "respaldo" ? "entrenar" : "respaldo"));
  document.addEventListener("click", e => { const b = e.target.closest("[data-ir]"); if (b) mostrar(b.dataset.ir); });

  $("mesoChips").addEventListener("click", async e => {
    const b = e.target.closest("[data-m]"); if (!b) return;
    soltarBorrador(); meso = +b.dataset.m; S.ajustes.meso = meso; guardarAjustes().catch(() => { });
    irSiguiente(); setMsg("msg", ""); pintarControles(); cargarForma(); opcionesEjercicios();
  });
  $("sesChips").addEventListener("click", e => { const b = e.target.closest("[data-s]"); if (b) cambiarA(meso, semana, +b.dataset.s); });
  $("semana").addEventListener("change", () => cambiarA(meso, +$("semana").value, sesion));
  $("fecha").addEventListener("change", () => { if (!$("fecha").value) $("fecha").value = hoy(); sucio = true; soltarBorrador(); pintarControles(); cargarForma(); });

  const ex = $("exList");
  ex.addEventListener("input", e => { tocar(); const c = e.target.closest(".ex"); if (c && e.target.dataset.k) revisarRecord(c); });
  ex.addEventListener("change", e => {
    if (e.target.dataset.k !== "reps" || !e.target.value.trim()) return;
    if (S.ajustes.autoDescanso === false || $("fecha").value !== hoy()) return;
    iniciarDescanso(listaEj()[+e.target.closest(".ex").dataset.i]);
  });
  ex.addEventListener("click", e => {
    const card = e.target.closest(".ex"); if (!card) return;
    const u = e.target.closest(".unit");
    if (u) { const n = { kg: "lb", lb: "placa", placa: "kg" }[u.dataset.u] || "kg"; u.dataset.u = n; u.textContent = n + " ⇄"; u.setAttribute("aria-label", "Cambiar unidad, ahora " + n); tocar(); revisarRecord(card); return; }
    if (e.target.closest(".mas")) { const s = card.querySelector(".sets"), k = s.querySelectorAll('[data-k="peso"]').length; s.insertAdjacentHTML("beforeend", filaSet(k)); s.querySelectorAll('[data-k="peso"]')[k].focus(); return; }
    if (e.target.closest(".desc")) iniciarDescanso(listaEj()[+card.dataset.i]);
  });
  $("notas").addEventListener("input", tocar);
  $("tStop").addEventListener("click", pararDescanso);
  $("guardar").addEventListener("click", guardarSesion);
  $("estado").addEventListener("click", async e => {
    if (e.target.id !== "descartar") return;
    clearTimeout(_borT); delete S.borradores[idActual()]; await guardarBorradores(); sucio = false; pintarControles(); cargarForma();
  });
  $("borrar").addEventListener("click", async () => {
    const id = idActual(), reg = S.entrenos[id]; if (!reg) return;
    if (!confirm(`¿Borrar el registro de Meso ${meso}, semana ${semana}, sesión ${sesion} (${fmtF(reg.fecha)})?\n\nNo se puede deshacer.`)) return;
    clearTimeout(_borT); await borrarEntreno(id); delete S.borradores[id]; await guardarBorradores(); sucio = false;
    pintarTodo(); cargarForma(); setMsg("msg", "Registro borrado.");
  });
  $("bvImportar").addEventListener("click", () => $("impFile").click());
  $("bvCero").addEventListener("click", async () => { S.ajustes.inicializado = true; await guardarAjustes(); pintarAvisos(); });

  $("histList").addEventListener("click", e => {
    const b = e.target.closest("[data-id]"); if (!b) return; const x = S.entrenos[b.dataset.id]; if (!x) return;
    if (!prog()[x.meso]?.sesiones?.[x.sesion]) { toast("Esa sesión ya no está en el programa."); return; }
    cambiarA(x.meso, x.semana, x.sesion); mostrar("entrenar");
  });

  $("exSel").addEventListener("change", renderProgreso);
  $("pGuardar").addEventListener("click", async () => {
    const kg = numero($("pKg").value), f = $("pFecha").value || hoy(); if (kg == null || kg <= 0) return;
    await guardarPeso(f, +kg.toFixed(1)); $("pKg").value = ""; renderProgreso(); renderRespaldo();
  });
  $("pTabla").addEventListener("click", async e => {
    const b = e.target.closest("[data-borrar-peso]"); if (!b) return;
    if (!confirm(`¿Borrar el peso del ${fmtF(b.dataset.borrarPeso)}?`)) return;
    await borrarPeso(b.dataset.borrarPeso); renderProgreso();
  });

  $("resArmar").addEventListener("click", pintarResumen);
  $("resTipo").addEventListener("change", () => { aplicarTipoResumen(); if (!$("resCaja").hidden) pintarResumen(); });
  ["resPer", "rsPeso", "rsEntreno", "rsFuerza", "rsDetalle", "rsReloj", "rsNotas"].forEach(id => $(id).addEventListener("change", () => { if (!$("resCaja").hidden) pintarResumen(); }));
  $("resCopiar").addEventListener("click", async () => {
    const t = $("resTxt");
    try { await navigator.clipboard.writeText(t.value); } catch (e) { t.select(); try { document.execCommand("copy"); } catch (e2) { setMsg("resMsg", "No pude copiarlo solo: mantén presionado el texto y elige Copiar.", true); return; } }
    await resumenEnviado("Copiado. Ábrele el chat a tu coach y pégalo.");
  });
  $("resCompartir").addEventListener("click", async () => {
    try { await navigator.share({ text: $("resTxt").value }); await resumenEnviado("Listo."); }
    catch (e) { if (e.name !== "AbortError") setMsg("resMsg", "No se pudo compartir. Usa Copiar.", true); }
  });

  $("csvBtn").addEventListener("click", () => $("csvFile").click());
  $("csvFile").addEventListener("change", async e => { if (e.target.files.length) await importarCSV([...e.target.files]); e.target.value = ""; });

  $("mesoAdd").addEventListener("click", () => agregarMeso($("mesoTxt").value));
  $("mesoFileBtn").addEventListener("click", () => $("mesoFile").click());
  $("mesoFile").addEventListener("change", async e => { const f = e.target.files[0]; if (f) { $("mesoTxt").value = await f.text(); setMsg("mesoMsg", 'Archivo cargado. Toca "Agregar mesociclo".'); } e.target.value = ""; });

  $("expBtn").addEventListener("click", () => exportar(false));
  $("shareBtn").addEventListener("click", () => exportar(true));
  $("impBtn").addEventListener("click", () => $("impFile").click());
  $("impFile").addEventListener("change", async e => { const f = e.target.files[0]; if (f) await importarArchivo(f, "impMsg"); e.target.value = ""; });
  const aj = (id, k) => $(id).addEventListener("change", e => { S.ajustes[k] = e.target.checked; guardarAjustes().catch(() => { }); if (k == "pantalla" && !e.target.checked) soltarPantalla(); });
  aj("ajDescanso", "autoDescanso"); aj("ajSonido", "sonido"); aj("ajPantalla", "pantalla");

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") soltarBorrador(); else if (T.id) tic(); });
  addEventListener("pagehide", soltarBorrador);
}

/* ---------- funcionar sin internet ---------- */
function registrarSW() {
  if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
  const tenia = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (tenia) toast("Hay una versión nueva de la app.", "Actualizar", () => location.reload(), 0); });
  navigator.serviceWorker.register("sw.js").catch(() => { });
}

iniciar();
