/* Diario Gym — datos: guardado en el celular (IndexedDB), importación, respaldo y archivos de Samsung Health.
   Regla central: cada entreno se guarda con la llave "m<meso>-w<semana>-s<sesion>", así que
   es imposible que existan dos registros de la misma combinación. */
"use strict";

const VERSION_APP = "1.0";
const LB = 0.453592;

/* ---------- utilidades ---------- */
const hoy = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const norm = s => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const idEntreno = (m, w, s) => `m${+m}-w${+w}-s${+s}`;
const unidadPorNombre = n => /mancuerna/i.test(n) ? "lb" : "kg";
const numero = v => { const n = parseFloat(String(v ?? "").replace(",", ".")); return isNaN(n) ? null : n; };

/* ---------- estado en memoria ---------- */
const S = { programa: null, entrenos: {}, peso: {}, reloj: null, ajustes: {}, borradores: {} };

/* ---------- IndexedDB ---------- */
let _db = null;
function abrirDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("diario-gym", 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains("entrenos")) d.createObjectStore("entrenos", { keyPath: "id" });
      if (!d.objectStoreNames.contains("peso")) d.createObjectStore("peso", { keyPath: "fecha" });
      if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
    };
    r.onsuccess = () => { _db = r.result; res(_db); };
    r.onerror = () => rej(r.error);
  });
}
function tx(stores, fn) {
  return new Promise((res, rej) => {
    const t = _db.transaction(stores, "readwrite");
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error("No se pudo guardar"));
    fn(t);
  });
}
function leerTodo(store) {
  return new Promise((res, rej) => {
    const r = _db.transaction(store).objectStore(store).getAll();
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
function kvGet(k) {
  return new Promise((res, rej) => {
    const r = _db.transaction("kv").objectStore("kv").get(k);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
const kvSet = (k, v) => tx(["kv"], t => t.objectStore("kv").put(v, k));

async function cargarEstado() {
  await abrirDB();
  const [ent, peso, programa, reloj, ajustes, borradores] = await Promise.all([
    leerTodo("entrenos"), leerTodo("peso"), kvGet("programa"), kvGet("reloj"), kvGet("ajustes"), kvGet("borradores")]);
  S.entrenos = {}; ent.forEach(e => S.entrenos[e.id] = e);
  S.peso = {}; peso.forEach(p => S.peso[p.fecha] = p);
  S.programa = programa || null; S.reloj = reloj || null; S.ajustes = ajustes || {}; S.borradores = borradores || {};
}
const guardarAjustes = () => kvSet("ajustes", S.ajustes);
const guardarBorradores = () => kvSet("borradores", S.borradores);
async function guardarPrograma(p) { S.programa = p; await kvSet("programa", p); }
async function guardarReloj(r) { S.reloj = r; await kvSet("reloj", r); }

/* Guarda (o corrige) un entreno. La llave es meso+semana+sesión: nunca se duplica. */
async function guardarEntreno(reg) {
  reg.id = idEntreno(reg.meso, reg.semana, reg.sesion);
  await tx(["entrenos"], t => t.objectStore("entrenos").put(reg));
  S.entrenos[reg.id] = reg;
  return reg;
}
async function borrarEntreno(id) {
  await tx(["entrenos"], t => t.objectStore("entrenos").delete(id));
  delete S.entrenos[id];
}
async function guardarPeso(fecha, kg) {
  const r = { fecha, kg };
  await tx(["peso"], t => t.objectStore("peso").put(r));
  S.peso[fecha] = r;
}
async function borrarPeso(fecha) {
  await tx(["peso"], t => t.objectStore("peso").delete(fecha));
  delete S.peso[fecha];
}

/* ---------- programa ---------- */
function limpiarEjercicio(x, i) {
  if (!x || typeof x !== "object" || !String(x.nombre || "").trim()) throw new Error(`al ejercicio ${i + 1} le falta el "nombre"`);
  const series = parseInt(x.series);
  return {
    id: x.id || `e${i + 1}`, musculo: String(x.musculo || "").trim(), nombre: String(x.nombre).trim(),
    series: series > 0 && series < 20 ? series : 3, reps: String(x.reps ?? "").trim(), rir: String(x.rir ?? "2-0").trim(),
    nota: String(x.nota || "").trim(), descanso: String(x.descanso || "2-3 min").trim()
  };
}
function limpiarMeso(m, etiqueta) {
  if (!m || typeof m !== "object" || !m.sesiones || typeof m.sesiones !== "object") throw new Error(`${etiqueta}: no encontré sus "sesiones"`);
  const out = { sesiones: {} };
  const claves = Object.keys(m.sesiones);
  if (!claves.length) throw new Error(`${etiqueta}: no trae ninguna sesión`);
  for (const k of claves) {
    if (!/^\d+$/.test(k)) throw new Error(`${etiqueta}: la sesión "${k}" debe ser un número (1, 2, 3…)`);
    const s = m.sesiones[k];
    if (!s || !Array.isArray(s.ejercicios) || !s.ejercicios.length) throw new Error(`${etiqueta}, sesión ${k}: no trae "ejercicios"`);
    try { out.sesiones[+k] = { titulo: String(s.titulo || `Sesión ${k}`).trim(), ejercicios: s.ejercicios.map(limpiarEjercicio) }; }
    catch (e) { throw new Error(`${etiqueta}, sesión ${k}: ${e.message}`); }
  }
  return out;
}
function limpiarPrograma(p) {
  if (!p || typeof p !== "object" || !p.mesociclos) throw new Error('no encontré "mesociclos"');
  const out = { mesociclos: {} };
  for (const k of Object.keys(p.mesociclos)) {
    if (!/^\d+$/.test(k)) throw new Error(`el mesociclo "${k}" debe ser un número`);
    out.mesociclos[+k] = limpiarMeso(p.mesociclos[k], `Mesociclo ${k}`);
  }
  if (!Object.keys(out.mesociclos).length) throw new Error("no trae ningún mesociclo");
  return out;
}
/* Interpreta el texto pegado para un mesociclo nuevo. Acepta:
   {"mesociclos":{"3":{…}}}  ·  {"3":{"sesiones":{…}}}  ·  {"sesiones":{…}} (se numera solo) */
function leerMesosNuevos(txt, programaActual) {
  let d;
  try { d = JSON.parse(txt); } catch (e) { throw new Error("no pude leer el texto. Revisa que esté completo, desde la primera llave { hasta la última }."); }
  if (!d || typeof d !== "object" || Array.isArray(d)) throw new Error("el texto no tiene el formato de un mesociclo.");
  let crudos;
  if (d.mesociclos) crudos = d.mesociclos;
  else if (d.sesiones) {
    const sig = Math.max(0, ...Object.keys(programaActual.mesociclos).map(Number)) + 1;
    crudos = { [sig]: d };
  } else if (Object.keys(d).length && Object.values(d).every(v => v && typeof v === "object" && v.sesiones)) crudos = d;
  else throw new Error('no encontré "mesociclos" ni "sesiones" en el texto.');
  return limpiarPrograma({ mesociclos: crudos }).mesociclos;
}

/* ---------- importar historial original y respaldos ---------- */
const claveVieja = (m, s, i) => m == 1 ? `s${s}e${i + 1}` : `m${m}s${s}e${i + 1}`;

function limpiarSet(z) {
  return { peso: String(z?.peso ?? z?.kg ?? "").trim(), reps: String(z?.reps ?? "").trim(), rir: String(z?.rir ?? "").trim() };
}
/* Convierte el historial.json de la página anterior al formato de la app. */
function convertirHistorialViejo(h, programa) {
  const lista = [], avisos = [];
  for (const [k, e] of Object.entries(h.entrenos || {})) {
    const m = +e.meso || 1, s = +e.sesion, w = +e.semana || 1;
    const ses = programa.mesociclos?.[m]?.sesiones?.[s];
    if (!ses || !e.fecha) { avisos.push(`No pude ubicar el registro "${k}" en el programa.`); continue; }
    const ejercicios = ses.ejercicios.map((x, i) => {
      const c = claveVieja(m, s, i);
      return { nombre: x.nombre, unidad: e.unidades?.[c] || unidadPorNombre(x.nombre), nota: String(e.notasEx?.[c] || ""), sets: (e.sets?.[c] || []).map(limpiarSet) };
    });
    lista.push({ id: idEntreno(m, w, s), meso: m, semana: w, sesion: s, titulo: ses.titulo, fecha: e.fecha, notas: String(e.notas || ""), ejercicios });
  }
  const peso = (Array.isArray(h.peso) ? h.peso : Object.values(h.peso || {})).filter(p => p && p.fecha && numero(p.kg) != null).map(p => ({ fecha: p.fecha, kg: numero(p.kg) }));
  return { entrenos: lista, peso, reloj: h.reloj || null, avisos };
}
/* Deja un solo registro por meso+semana+sesión (se queda el de fecha más reciente). */
function sinRepetidos(lista) {
  const mapa = {}; let repetidos = 0;
  for (const e of lista) {
    const id = idEntreno(e.meso, e.semana, e.sesion);
    const reg = { ...e, id };
    if (mapa[id]) { repetidos++; if (String(reg.fecha) < String(mapa[id].fecha)) continue; }
    mapa[id] = reg;
  }
  return { mapa, repetidos };
}
/* Lee un archivo (respaldo de la app o historial original) y lo deja listo para guardar. */
function interpretarArchivo(data, programaActual) {
  if (!data || typeof data !== "object") throw new Error("el archivo no es un respaldo de Diario Gym.");
  let programa = null, entrenos, peso, reloj, avisos = [], ajustes = {}, tipo;
  if (data.app === "diario-gym" && Array.isArray(data.entrenos)) {
    tipo = "respaldo";
    programa = limpiarPrograma(data.programa);
    entrenos = data.entrenos.filter(e => e && e.fecha && e.meso && e.semana && e.sesion && Array.isArray(e.ejercicios)).map(e => ({
      meso: +e.meso, semana: +e.semana, sesion: +e.sesion, titulo: String(e.titulo || ""), fecha: String(e.fecha), notas: String(e.notas || ""),
      ejercicios: e.ejercicios.map(x => ({ nombre: String(x.nombre || ""), unidad: ["kg", "lb", "placa"].includes(x.unidad) ? x.unidad : "kg", nota: String(x.nota || ""), sets: (x.sets || []).map(limpiarSet) }))
    }));
    peso = (data.peso || []).filter(p => p && p.fecha && numero(p.kg) != null).map(p => ({ fecha: p.fecha, kg: numero(p.kg) }));
    reloj = data.reloj || null; ajustes = data.ajustes || {};
  } else if (data.entrenos && typeof data.entrenos === "object" && !Array.isArray(data.entrenos)) {
    tipo = "historial";
    if (!programaActual) throw new Error("falta el programa para leer este historial.");
    const c = convertirHistorialViejo(data, programaActual);
    entrenos = c.entrenos; peso = c.peso; reloj = c.reloj; avisos = c.avisos;
  } else throw new Error("el archivo no es un respaldo de Diario Gym ni un historial.");
  const { mapa, repetidos } = sinRepetidos(entrenos);
  if (repetidos) avisos.push(repetidos == 1 ? "Venía 1 sesión repetida; dejé solo la más reciente." : `Venían ${repetidos} sesiones repetidas; dejé solo la más reciente de cada una.`);
  return { tipo, programa, entrenos: mapa, peso, reloj, avisos, ajustes };
}
/* Reemplaza todo lo guardado con el contenido de un archivo ya interpretado. */
async function aplicarImportacion(imp) {
  await tx(["entrenos", "peso", "kv"], t => {
    const e = t.objectStore("entrenos"), p = t.objectStore("peso"), kv = t.objectStore("kv");
    e.clear(); p.clear();
    Object.values(imp.entrenos).forEach(x => e.put(x));
    imp.peso.forEach(x => p.put(x));
    kv.put(imp.reloj || null, "reloj");
    if (imp.programa) kv.put(imp.programa, "programa");
    kv.put({}, "borradores");
  });
  S.entrenos = imp.entrenos;
  S.peso = {}; imp.peso.forEach(x => S.peso[x.fecha] = x);
  S.reloj = imp.reloj || null; S.borradores = {};
  if (imp.programa) S.programa = imp.programa;
  if (imp.ajustes && imp.ajustes.meso) S.ajustes.meso = imp.ajustes.meso;
  if (S.ajustes.meso && !S.programa.mesociclos[S.ajustes.meso]) delete S.ajustes.meso;
  S.ajustes.inicializado = true;
  await guardarAjustes();
}
function armarRespaldo() {
  return { app: "diario-gym", version: 1, exportado: hoy(), programa: S.programa, entrenos: Object.values(S.entrenos).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    peso: Object.values(S.peso).sort((a, b) => a.fecha.localeCompare(b.fecha)), reloj: S.reloj, ajustes: { meso: S.ajustes.meso || null } };
}

/* ---------- cálculos sobre los entrenos ---------- */
function mejorSerie(sets) {
  let b = null;
  (sets || []).forEach(s => {
    const p = numero(s.peso), r = parseInt(s.reps) || 0;
    if (p == null) return;
    if (!b || p > b.peso || (p == b.peso && r > b.reps)) b = { peso: p, reps: r };
  });
  return b;
}
const conDatos = x => x.sets.some(s => s.peso !== "" || s.reps !== "");
/* Lo último que hice de un ejercicio, buscándolo por nombre en cualquier mesociclo o sesión. */
function ultimaVez(nombre, fecha, idActual) {
  const n = norm(nombre); let m = null;
  for (const e of Object.values(S.entrenos)) {
    if (e.id === idActual || e.fecha > fecha) continue;
    const x = e.ejercicios.find(z => norm(z.nombre) === n && conDatos(z));
    if (x && (!m || e.fecha > m.e.fecha)) m = { e, x };
  }
  return m;
}
function ultimaNota(nombre, fecha, idActual) {
  const n = norm(nombre); let m = null;
  for (const e of Object.values(S.entrenos)) {
    if (e.id === idActual || e.fecha > fecha) continue;
    const x = e.ejercicios.find(z => norm(z.nombre) === n && z.nota);
    if (x && (!m || e.fecha > m.e.fecha)) m = { e, x };
  }
  return m ? m.x.nota : "";
}
/* Valor comparable: kg y lb se comparan en kg; las placas solo contra placas. */
const comparable = (peso, unidad) => unidad === "placa" ? { tipo: "placa", v: peso } : { tipo: "kg", v: unidad === "lb" ? peso * LB : peso };
/* Mejor marca histórica de un ejercicio (sin contar el registro que se está editando). */
function mejorHistorico(nombre, idActual, tipo) {
  const n = norm(nombre); let best = null;
  for (const e of Object.values(S.entrenos)) {
    if (e.id === idActual) continue;
    for (const x of e.ejercicios) {
      if (norm(x.nombre) !== n) continue;
      const b = mejorSerie(x.sets); if (!b) continue;
      const c = comparable(b.peso, x.unidad); if (c.tipo !== tipo) continue;
      if (!best || c.v > best.v + 1e-9 || (Math.abs(c.v - best.v) < 1e-9 && b.reps > best.reps)) best = { v: c.v, reps: b.reps };
    }
  }
  return best;
}
/* Historia de un ejercicio para la gráfica de fuerza. */
function historiaEjercicio(nombre) {
  const n = norm(nombre), rows = [];
  for (const e of Object.values(S.entrenos)) {
    const x = e.ejercicios.find(z => norm(z.nombre) === n); if (!x) continue;
    const b = mejorSerie(x.sets); if (!b) continue;
    rows.push({ f: e.fecha, b, u: x.unidad, meso: e.meso });
  }
  return rows.sort((a, b) => a.f.localeCompare(b.f));
}

/* ---------- archivos .csv de Samsung Health ---------- */
function parseCSV(txt) {
  const rows = []; let row = [], cur = "", q = false;
  txt = txt.replace(/^﻿/, "");
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && txt[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = []; }
    else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const _utc = s => { const m = String(s).trim().match(/^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)(?::(\d\d))?/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : (/^\d{11,}$/.test(String(s).trim()) ? +s : null); };
const _offset = s => { const m = String(s || "").match(/([+-])(\d\d):?(\d\d)/); return m ? (m[1] === "-" ? -1 : 1) * (+m[2] * 60 + +m[3]) * 60000 : 0; };
const _fecha = ms => new Date(ms).toISOString().slice(0, 10);
const _hora = ms => new Date(ms).toISOString().slice(11, 16);
/* Lee un .csv de Samsung Health y mezcla lo que reconozca en "reloj". Devuelve un texto con lo que encontró. */
function leerCSVSamsung(nombreArchivo, txt, reloj, pesoNuevo) {
  const rows = parseCSV(txt);
  const hi = rows.findIndex(r => r.length > 3);
  if (hi < 0) return { ok: false, txt: "no tiene datos que pueda leer." };
  const head = rows[hi].map(h => h.trim().toLowerCase()), data = rows.slice(hi + 1);
  const col = (...ns) => { for (const n of ns) { let i = head.indexOf(n); if (i < 0) i = head.findIndex(h => h.endsWith("." + n)); if (i >= 0) return i; } return -1; };
  const marca = (nombreArchivo + " " + (rows[0] || []).join(" ")).toLowerCase();

  if (marca.includes("step_daily_trend") || (col("count") >= 0 && col("day_time") >= 0)) {
    const cD = col("day_time"), cC = col("count"), cS = col("source_type");
    if (cD < 0 || cC < 0) return { ok: false, txt: "parece de pasos, pero no encontré las columnas de día y cantidad." };
    const total = {}, max = {};
    for (const r of data) {
      const ms = _utc(r[cD]), n = numero(r[cC]); if (ms == null || n == null) continue;
      const f = _fecha(ms);
      if (cS >= 0 && String(r[cS]).trim() === "-2") total[f] = Math.max(total[f] || 0, n);
      max[f] = Math.max(max[f] || 0, n);
    }
    const dias = { ...max, ...total }; const n = Object.keys(dias).length;
    if (!n) return { ok: false, txt: "no encontré días de pasos." };
    reloj.pasos = { ...(reloj.pasos || {}), ...Object.fromEntries(Object.entries(dias).map(([f, v]) => [f, Math.round(v)])) };
    const ult = Object.keys(dias).sort().pop();
    if (!reloj.actualizado || ult > reloj.actualizado) reloj.actualizado = ult;
    return { ok: true, txt: `${n} días de pasos.` };
  }
  if (marca.includes("vitality")) {
    const cD = col("day_time", "start_time", "create_time");
    const cH = col("shr_value", "sleep_hr", "sleeping_hr", "sleep_heart_rate", "shr");
    if (cD < 0 || cH < 0) return { ok: false, txt: "es el de vitality_score, pero no encontré la columna del pulso durmiendo. Mándamelo y lo ajusto." };
    let n = 0; reloj.fcSueno = reloj.fcSueno || {};
    for (const r of data) { const ms = _utc(r[cD]), v = numero(r[cH]); if (ms == null || v == null || v < 25 || v > 130) continue; reloj.fcSueno[_fecha(ms)] = Math.round(v); n++; }
    return n ? { ok: true, txt: `${n} noches de pulso en reposo.` } : { ok: false, txt: "no encontré datos de pulso durmiendo." };
  }
  if (marca.includes("sleep") && col("sleep_duration", "sleep_score", "efficiency") >= 0) {
    const cI = col("start_time"), cF = col("end_time"), cO = col("time_offset"), cDur = col("sleep_duration"), cSc = col("sleep_score");
    if (cI < 0 || cF < 0) return { ok: false, txt: "parece de sueño, pero no encontré la hora de inicio y fin." };
    reloj.sueno = reloj.sueno || {}; const nuevas = {};
    for (const r of data) {
      const a = _utc(r[cI]), b = _utc(r[cF]); if (a == null || b == null || b <= a) continue;
      const off = cO >= 0 ? _offset(r[cO]) : 0, dur = cDur >= 0 ? numero(r[cDur]) : null;
      const h = +((dur != null && dur > 0 ? dur / 60 : (b - a) / 3600000)).toFixed(2);
      const f = _fecha(b + off), sc = cSc >= 0 ? numero(r[cSc]) : null;
      if (!nuevas[f] || h > nuevas[f].h) nuevas[f] = { h, score: sc, inicio: _hora(a + off), fin: _hora(b + off) };
    }
    const n = Object.keys(nuevas).length;
    if (!n) return { ok: false, txt: "no encontré noches de sueño." };
    Object.assign(reloj.sueno, nuevas);
    return { ok: true, txt: `${n} noches de sueño.` };
  }
  if (col("weight") >= 0 && col("start_time") >= 0) {
    const cT = col("start_time"), cO = col("time_offset"), cW = col("weight"), cG = col("body_fat"), cM = col("skeletal_muscle_mass"), cA = col("total_body_water"), cB = col("basal_metabolic_rate");
    const comp = {}; (reloj.composicion || []).forEach(c => comp[c.fecha] = c); let n = 0;
    for (const r of data) {
      const ms = _utc(r[cT]), kg = numero(r[cW]); if (ms == null || kg == null || kg < 20 || kg > 400) continue;
      const f = _fecha(ms + (cO >= 0 ? _offset(r[cO]) : 0)); n++;
      pesoNuevo[f] = +kg.toFixed(1);
      const g = cG >= 0 ? numero(r[cG]) : null;
      if (g != null) comp[f] = { fecha: f, kg: +kg.toFixed(1), grasa: +g.toFixed(1), musculo: cM >= 0 && numero(r[cM]) != null ? +numero(r[cM]).toFixed(1) : null,
        agua: cA >= 0 && numero(r[cA]) != null ? +numero(r[cA]).toFixed(1) : null, tmb: cB >= 0 && numero(r[cB]) != null ? Math.round(numero(r[cB])) : null };
    }
    if (!n) return { ok: false, txt: "no encontré mediciones de peso." };
    reloj.composicion = Object.values(comp).sort((a, b) => a.fecha.localeCompare(b.fecha));
    return { ok: true, txt: `${n} mediciones de peso.` };
  }
  return { ok: false, txt: "no reconocí qué tipo de archivo es." };
}
