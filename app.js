/* =========================================================
   Tablero: rotación de funcionarios del Estado (2020–2026)
   Todo el estado vive en `estado`; los controles avisan cambios con
   cambiar(parche) y cada pestaña se dibuja desde el estado.
   Los datos vienen de datos/*.json (tablero/construir_datos_v2.py).
   ========================================================= */
(() => {
  const Obs = window.Obs;
  const $ = (s) => document.querySelector(s);
  const esc = Obs.escapar;
  const DIA = 864e5, T0 = Date.UTC(2020, 0, 1);
  const fecha = (d) => new Date(T0 + d * DIA);
  const anioDe = (d) => fecha(d).getUTCFullYear();
  const fmtFecha = (d) => (d == null ? "hoy" : fecha(d).toLocaleDateString("es-PE", { month: "short", year: "numeric", timeZone: "UTC" }));
  const n = Obs.fmtN, n1 = Obs.fmt1, pct = Obs.fmtPct;
  const fuerte = (s) => `<strong>${s}</strong>`;

  const MODULOS = [
    { id: "rotacion", nombre: "¿Dónde se rota más?" },
    { id: "intercambio", nombre: "¿Entre qué entidades se mueven?" },
    { id: "mecanismos", nombre: "¿Cómo funcionan las rotaciones?" },
    { id: "redes", nombre: "Redes: ¿quién llega con quién?" },
    { id: "casos", nombre: "Funcionarios con muchas rotaciones" },
    { id: "oci", nombre: "Jefes de control (OCI)" },
    { id: "metodo", nombre: "Cómo se hizo" },
  ];
  // en qué pestañas aplica cada filtro
  const APLICA = {
    ent: ["rotacion", "intercambio", "mecanismos", "redes", "casos"],
    tipo: ["rotacion", "intercambio", "mecanismos", "redes", "casos"],
    gob: ["rotacion", "intercambio", "mecanismos", "redes", "casos", "oci"],
    nivel: ["rotacion", "intercambio", "mecanismos"],
  };
  const NIVELES = [
    { v: "todos", nombre: "Todos", j: [2, 3, 4, 5, 6, 7] },
    { v: "alta", nombre: "Alta dirección", j: [2, 3] },
    { v: "dir", nombre: "Directores generales", j: [4] },
    { v: "ase", nombre: "Asesores", j: [5] },
    { v: "jefe", nombre: "Jefes de unidad", j: [6] },
  ];

  let D = {};          // datos
  let estado = {};     // estado del tablero
  let ctl = {};        // controles

  /* ------------------------------------------------ carga */
  const ARCHIVOS = ["meta", "periodos", "mensual", "movimientos", "personas", "trayectorias", "seguimiento", "cotraslado", "mecanismos", "oci"];
  Promise.all(ARCHIVOS.map((a) => fetch(`datos/${a}.json`).then((r) => { if (!r.ok) throw new Error(a); return r.json(); })))
    .then((res) => { ARCHIVOS.forEach((a, i) => (D[a] = res[i])); }, (e) => { mostrarError(`No se pudieron cargar los datos (${e.message}). Abre el tablero desde un servidor web, no como archivo local.`); throw e; })
    .then(iniciar)
    .catch((e) => { console.error(e); if ($("#error").hidden) mostrarError(`Ocurrió un error al dibujar el tablero: ${e.message}`); });
  function mostrarError(txt) { const el = $("#error"); el.hidden = false; el.textContent = txt; }

  /* ------------------------------------------------ utilidades de datos */
  const ENT = () => D.meta.entidades;
  const nombreEnt = (e) => ENT()[e].corta;
  const GOBS = () => D.meta.gobiernos;
  const gobDeDia = (d) => { const g = GOBS(); for (let i = g.length - 1; i >= 0; i--) if (d >= g[i].ini) return i; return 0; };
  const nivelJ = () => NIVELES.find((x) => x.v === estado.nivel).j;
  const todasEnt = () => estado.ent.size === ctl.entOpciones.length;
  const pasaEnt = (e) => estado.ent.has(e) && estado.tipo.has(ENT()[e].tipo);
  const filtroEntActivo = () => !todasEnt() || estado.tipo.size !== Object.keys(D.meta.tipos).length;

  // Kaplan-Meier: mediana (días) y curva [(t, s)] con censura de los que siguen en el cargo
  function km(ds, xs) {
    const m = ds.length;
    if (!m) return { med: null, curva: [[0, 1]] };
    const idx = Array.from({ length: m }, (_, i) => i).sort((a, b) => ds[a] - ds[b]);
    let s = 1, enRiesgo = m, med = null, k = 0;
    const curva = [[0, 1]];
    while (k < m) {
      const t = ds[idx[k]];
      let muertes = 0, grupo = 0;
      while (k < m && ds[idx[k]] === t) { muertes += xs[idx[k]]; grupo++; k++; }
      if (muertes) { s *= 1 - muertes / enRiesgo; curva.push([t, s]); if (med == null && s <= 0.5) med = t; }
      enRiesgo -= grupo;
    }
    return { med, curva };
  }
  const sobrevive = (curva, t) => { let s = 1; for (const [d, v] of curva) { if (d <= t) s = v; else break; } return s; };

  // índices de periodos que pasan los filtros (opciones para ignorar entidad)
  function periodosFiltrados({ conEnt = true, conNivel = true } = {}) {
    const P = D.periodos, j = nivelJ(), out = [];
    for (let k = 0; k < P.e.length; k++) {
      if (!estado.gob.has(P.g[k])) continue;
      if (conNivel && !j.includes(P.j[k])) continue;
      if (conEnt ? !pasaEnt(P.e[k]) : !estado.tipo.has(ENT()[P.e[k]].tipo)) continue;
      out.push(k);
    }
    return out;
  }
  function resumenPeriodos(ix) {
    const P = D.periodos;
    const ds = ix.map((k) => P.d[k]), xs = ix.map((k) => P.x[k]);
    const r = km(ds, xs);
    const sale6 = ix.filter((k) => P.d[k] < 183 && P.x[k]).length;
    const porPuesto = new Map();
    ix.forEach((k) => { if (!porPuesto.has(P.u[k])) porPuesto.set(P.u[k], new Set()); porPuesto.get(P.u[k]).add(P.p[k]); });
    let suma = 0; porPuesto.forEach((s) => (suma += s.size));
    return { n: ix.length, med: r.med, curva: r.curva, pct6: ix.length ? (sale6 / ix.length) * 100 : null, titulares: porPuesto.size ? suma / porPuesto.size : null };
  }
  const textoSeleccion = () => {
    const partes = [];
    if (!todasEnt()) partes.push(estado.ent.size === 1 ? nombreEnt([...estado.ent][0]) : `${estado.ent.size} entidades`);
    else partes.push("todo el Estado");
    if (estado.gob.size !== GOBS().length) partes.push(estado.gob.size === 1 ? `durante el gobierno de ${GOBS()[[...estado.gob][0]].g}` : `en ${estado.gob.size} gobiernos`);
    if (estado.nivel !== "todos") partes.push(`(${NIVELES.find((x) => x.v === estado.nivel).nombre.toLowerCase()})`);
    return partes.join(" ");
  };

  /* ------------------------------------------------ inicio: filtros y pestañas */
  function iniciar() {
    $("#corte").textContent = fmtCorte(D.meta.corte);
    $("#corte-pie").textContent = fmtCorte(D.meta.corte);
    if (new URLSearchParams(location.search).get("embed") === "1") document.body.classList.add("embed");

    // entidades con datos, ordenadas por tipo y nombre
    const usadas = new Set([...D.periodos.e, ...D.movimientos.a, ...D.movimientos.b, ...D.mensual.e]);
    const ordenTipo = Object.keys(D.meta.tipos);
    ctl.entOpciones = [...usadas].sort((a, b) => ordenTipo.indexOf(ENT()[a].tipo) - ordenTipo.indexOf(ENT()[b].tipo) || ENT()[a].nombre.localeCompare(ENT()[b].nombre, "es"))
      .map((e) => ({ valor: e, etiqueta: ENT()[e].sigla ? `${ENT()[e].sigla} · ${ENT()[e].nombre}` : ENT()[e].nombre }));

    estado = {
      modulo: (location.hash || "#rotacion").slice(1),
      ent: new Set(ctl.entOpciones.map((o) => o.valor)),
      tipo: new Set(Object.keys(D.meta.tipos)),
      gob: new Set(GOBS().map((_, i) => i)),
      nivel: "todos", metrica: "mediana", red: "seguimiento", persona: null, orden: "n", detalleRed: null, ruta: null,
    };
    if (!MODULOS.some((m) => m.id === estado.modulo)) estado.modulo = "rotacion";

    const f = $("#filtros");
    ctl.ent = new Obs.Multiseleccion(f, { id: "f-ent", etiqueta: "Entidad", todos: "Todas las entidades", opciones: ctl.entOpciones,
      alCambiar: (s) => cambiar({ ent: s }) });
    ctl.tipo = new Obs.Multiseleccion(f, { id: "f-tipo", etiqueta: "Tipo de entidad", todos: "Todos los tipos",
      opciones: Object.entries(D.meta.tipos).map(([v, e]) => ({ valor: v, etiqueta: e })), alCambiar: (s) => cambiar({ tipo: s }) });
    ctl.gob = new Obs.Multiseleccion(f, { id: "f-gob", etiqueta: "Gobierno", todos: "Todos los gobiernos",
      opciones: GOBS().map((g, i) => ({ valor: i, etiqueta: `${g.g} (${fmtFecha(g.ini)} – ${i === GOBS().length - 1 ? "hoy" : fmtFecha(g.fin)})` })),
      alCambiar: (s) => cambiar({ gob: s }) });
    f.insertAdjacentHTML("beforeend", `<div class="filtro" id="f-nivel"><span class="etiqueta" id="lbl-nivel">Nivel del cargo</span>
      <div class="segmentado" role="group" aria-labelledby="lbl-nivel">${NIVELES.map((x) => `<button type="button" data-nivel="${x.v}">${x.nombre}</button>`).join("")}</div>
      <span class="nota-filtro" hidden>No se aplica en este módulo</span></div>`);
    f.querySelectorAll("[data-nivel]").forEach((b) => (b.onclick = () => cambiar({ nivel: b.dataset.nivel })));

    $("#modulos").innerHTML = MODULOS.map((m) => `<button type="button" role="tab" id="tab-${m.id}" data-modulo="${m.id}">${m.nombre}</button>`).join("");
    $("#modulos").onclick = (e) => { const b = e.target.closest("[data-modulo]"); if (b) cambiar({ modulo: b.dataset.modulo }); };
    document.querySelectorAll("[data-ir]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); cambiar({ modulo: a.dataset.ir }); }));
    window.addEventListener("hashchange", () => { const m = location.hash.slice(1); if (m !== estado.modulo && MODULOS.some((x) => x.id === m)) cambiar({ modulo: m }); });

    // controles locales
    segmentado("#s1-metrica", "metrica");
    segmentado("#s4-red", "red", () => ({ detalleRed: null }));
    $("#s5-orden").onchange = (e) => cambiar({ orden: e.target.value, persona: null });
    $("#i5-buscar").onchange = (e) => {
      const p = D.personas.indexOf(e.target.value);
      if (p >= 0 && ctl.trayPorPersona.has(p)) cambiar({ persona: p });
    };
    ctl.trayPorPersona = new Map(D.trayectorias.map((t) => [t.p, t]));
    pintarPasosRedes();
    pintarMetodo();

    let espera;
    window.addEventListener("resize", () => { clearTimeout(espera); espera = setTimeout(() => { Obs.redimensionar(); dibujar(); }, 200); });
    dibujar();
  }
  const fmtCorte = (s) => new Date(s + "T00:00:00").toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });
  function segmentado(sel, clave, extra = () => ({})) {
    document.querySelectorAll(`${sel} [data-v]`).forEach((b) => (b.onclick = () => cambiar({ [clave]: b.dataset.v, ...extra() })));
  }

  function cambiar(parche) {
    const cambiaFiltro = ["ent", "tipo", "gob", "nivel"].some((k) => k in parche);
    Object.assign(estado, parche);
    if (cambiaFiltro) { estado.detalleRed = null; estado.ruta = null; }
    if ("modulo" in parche && location.hash.slice(1) !== estado.modulo) history.replaceState(null, "", `#${estado.modulo}`);
    dibujar();
  }

  function sincronizar() {
    const m = estado.modulo;
    ctl.ent.sincronizar(estado.ent, { noAplica: !APLICA.ent.includes(m) });
    ctl.tipo.sincronizar(estado.tipo, { noAplica: !APLICA.tipo.includes(m) });
    ctl.gob.sincronizar(estado.gob, { noAplica: !APLICA.gob.includes(m) });
    const fn = $("#f-nivel"), noNivel = !APLICA.nivel.includes(m);
    fn.classList.toggle("no-aplica", noNivel); fn.querySelector(".nota-filtro").hidden = !noNivel;
    fn.querySelectorAll("[data-nivel]").forEach((b) => { b.setAttribute("aria-pressed", b.dataset.nivel === estado.nivel); b.disabled = noNivel; });
    $("#filtros").hidden = m === "metodo";
    document.querySelectorAll("#modulos [data-modulo]").forEach((b) => b.setAttribute("aria-selected", b.dataset.modulo === m));
    document.querySelectorAll("main > section[data-modulo]").forEach((s) => (s.hidden = s.dataset.modulo !== m));
    document.querySelectorAll("[data-v]").forEach((b) => {
      const grupo = b.parentElement.id;
      const clave = { "s1-metrica": "metrica", "s4-red": "red" }[grupo];
      if (clave) b.setAttribute("aria-pressed", estado[clave] === b.dataset.v);
    });
    $("#s5-orden").value = estado.orden;
  }

  function dibujar() {
    try { dibujarModulo(); } catch (e) { console.error(e); mostrarError(`Ocurrió un error al dibujar esta pestaña: ${e.message}`); }
  }
  function dibujarModulo() {
    $("#error").hidden = true;
    sincronizar();
    ({ rotacion: dibujarRotacion, intercambio: dibujarIntercambio, mecanismos: dibujarMecanismos, redes: dibujarRedes,
       casos: dibujarCasos, oci: dibujarOci, metodo: () => {} })[estado.modulo]();
  }
  const lectura = (id, html) => ($(id).innerHTML = html);

  /* ================================================ 1. Dónde se rota más */
  function dibujarRotacion() {
    const P = D.periodos, t = Obs.tema();
    const ix = periodosFiltrados();
    const r = resumenPeriodos(ix);
    const ixTot = periodosFiltrados({ conEnt: false });
    const tot = resumenPeriodos(ixTot);
    const quien = textoSeleccion();

    Obs.kpi("k1-mediana", { etiqueta: "La mitad dejó el cargo antes de", valor: r.med == null ? "—" : `${n(r.med)} días`,
      pie: tot.med && filtroEntActivo() ? `Total del Estado: ${n(tot.med)} días` : `≈ ${n1((r.med || 0) / 30.4)} meses` });
    Obs.kpi("k1-6m", { etiqueta: "Salió antes de 6 meses", valor: pct(r.pct6), pie: `${n(r.n)} periodos en el cargo` });
    Obs.kpi("k1-titulares", { etiqueta: "Personas distintas por puesto", valor: n1(r.titulares),
      pie: "En promedio, cuántas personas ocuparon un mismo puesto" });
    lectura("#r1-resumen", r.n
      ? `En ${quien}, la mitad de los directivos dejó su cargo antes de ${fuerte(`${n(r.med)} días`)} y ${fuerte(pct(r.pct6))} salió antes de cumplir 6 meses.`
      : "No hay periodos para esta selección. Prueba con otros filtros.");

    // ranking de entidades (sin el filtro de entidad, para comparar)
    const porEnt = new Map();
    ixTot.forEach((k) => { const e = P.e[k]; if (!porEnt.has(e)) porEnt.set(e, []); porEnt.get(e).push(k); });
    let items = [];
    porEnt.forEach((ks, e) => {
      if (ks.length < 30) return;
      const s = resumenPeriodos(ks);
      const valor = { mediana: s.med, pct6: s.pct6, titulares: s.titulares }[estado.metrica];
      if (valor != null) items.push({ clave: e, etiqueta: nombreEnt(e), valor, n: s.n, comp: { mediana: tot.med, pct6: tot.pct6, titulares: tot.titulares }[estado.metrica] });
    });
    items.sort((a, b) => (estado.metrica === "mediana" ? a.valor - b.valor : b.valor - a.valor));
    const formato = { mediana: (v) => `${n(v)} d`, pct6: (v) => pct(v), titulares: (v) => n1(v) }[estado.metrica];
    Obs.barras("g1-ranking", items, {
      ordenar: false, limite: 25, formato, comparacion: "Total del Estado", nombre: { mediana: "La mitad dura", pct6: "Sale antes de 6 meses", titulares: "Personas por puesto" }[estado.metrica],
      seleccion: todasEnt() ? null : estado.ent, detalle: (d) => `${n(d.n)} periodos`, alClic: (e) => cambiar({ ent: new Set([+e]) }),
    });
    $("#ley1-ranking").innerHTML = `<span><i style="background:${t.unica}"></i>Entidad</span><span><i class="marca" style="background:${t.navy}"></i>Total del Estado</span>`;
    if (items.length) {
      const top = items[0];
      lectura("#lec1-ranking", {
        mediana: `En ${fuerte(top.etiqueta)} la mitad de los directivos se va antes de ${fuerte(`${n(top.valor)} días`)}, frente a ${n(tot.med)} en el total del Estado.`,
        pct6: `En ${fuerte(top.etiqueta)}, ${fuerte(pct(top.valor))} de los directivos salió antes de 6 meses.`,
        titulares: `En ${fuerte(top.etiqueta)}, por cada puesto pasaron en promedio ${fuerte(n1(top.valor))} personas.`,
      }[estado.metrica]);
    } else lectura("#lec1-ranking", "");

    // curva de permanencia: selección vs total
    const meses = Array.from({ length: 17 }, (_, i) => i * 3);
    const serie = (c) => meses.map((m) => Math.round(sobrevive(c, m * 30.4) * 1000) / 10);
    const series = [{ nombre: filtroEntActivo() ? "Selección" : "Todo el Estado", valores: serie(r.curva), color: t.categorias[0] }];
    if (filtroEntActivo()) series.push({ nombre: "Total del Estado", valores: serie(tot.curva), color: t.otros });
    if (r.n) Obs.lineas("g1-curva", meses.map((m) => `${m} m`), [{ titulo: "", series }], { formato: (v) => pct(v), altoPanel: 360 });
    else Obs.vacio("g1-curva");
    lectura("#lec1-curva", r.n ? `Al año, solo ${fuerte(pct(sobrevive(r.curva, 365) * 100))} sigue en el mismo cargo; a los dos años, ${fuerte(pct(sobrevive(r.curva, 730) * 100))}.` : "");

    // por familia funcional
    const porFam = new Map();
    ix.forEach((k) => { const f = P.f[k]; if (f < 0) return; if (!porFam.has(f)) porFam.set(f, []); porFam.get(f).push(k); });
    const fam = [];
    porFam.forEach((ks, f) => { if (ks.length < 40) return; const s = km(ks.map((k) => P.d[k]), ks.map((k) => P.x[k])); if (s.med) fam.push({ clave: f, etiqueta: D.meta.familias[f], valor: s.med, n: ks.length }); });
    fam.sort((a, b) => a.valor - b.valor);
    Obs.barras("g1-familia", fam, { ordenar: false, formato: (v) => `${n(v)} d`, nombre: "La mitad dura", detalle: (d) => `${n(d.n)} periodos` });
    lectura("#lec1-familia", fam.length ? `Las oficinas de ${fuerte(fam[0].etiqueta.toLowerCase())} son las que rotan más rápido: la mitad se va antes de ${fuerte(`${n(fam[0].valor)} días`)}.` : "");

    // mapa de calor entidad x año
    const anios = [2020, 2021, 2022, 2023, 2024, 2025, 2026];
    const candidatas = [...porEnt.entries()].filter(([e]) => todasEnt() || estado.ent.has(e)).sort((a, b) => b[1].length - a[1].length).slice(0, 20).map(([e]) => e);
    const celdas = [];
    candidatas.forEach((e, fila) => {
      // denominador fijo: puestos distintos de la entidad en todo el periodo (la base empieza en 2020 y no ve a
      // quienes ya estaban, así que contar solo los puestos "activos" inflaría los primeros años)
      const ks = porEnt.get(e);
      const puestos = new Set(ks.map((k) => P.u[k])).size;
      anios.forEach((a, col) => {
        const nuevos = ks.filter((k) => anioDe(P.i[k]) === a).length;
        const v = Math.round((nuevos / puestos) * 100) / 100;
        celdas.push({ value: [col, fila, v], label: { color: v < 0.15 ? t.navy : "#fff" } });
      });
    });
    if (!celdas.length) Obs.vacio("g1-calor");
    else {
      const g = Obs.grafico("g1-calor");
      const el = document.getElementById("g1-calor");
      el.style.height = `${Math.max(300, candidatas.length * 30 + 90)}px`; g.resize();
      g.setOption({
        textStyle: { fontFamily: t.fuente },
        tooltip: { ...Obs.tooltipBase(), formatter: (p) => `<strong>${esc(nombreEnt(candidatas[p.value[1]]))}</strong> · ${anios[p.value[0]]}<br>${n1(p.value[2])} designaciones por puesto` },
        grid: { left: 150, right: 20, top: 10, bottom: 70 },
        xAxis: { type: "category", data: anios, axisLabel: { fontSize: 14, color: t.textoSuave }, axisTick: { show: false }, splitArea: { show: false } },
        yAxis: { type: "category", data: candidatas.map(nombreEnt), inverse: true, axisLabel: { fontSize: 14, color: t.texto, width: 140, overflow: "truncate" }, axisTick: { show: false } },
        visualMap: { min: 0, max: 0.6, calculable: false, orient: "horizontal", left: "center", bottom: 0, itemWidth: 12, itemHeight: 200,
          inRange: { color: t.escala }, text: ["0,6 o más", "0"], textStyle: { fontSize: 14, color: t.textoSuave } },
        series: [{ type: "heatmap", data: celdas, label: { show: el.clientWidth > 600, fontSize: 14, formatter: (p) => n1(p.value[2]) },
          itemStyle: { borderColor: "#fff", borderWidth: 2 } }],
      }, true);
      const max = celdas.map((c) => c.value).filter((c) => c[0] < 6).reduce((a, c) => (c[2] > a[2] ? c : a));
      lectura("#lec1-calor", `El año más movido fue ${fuerte(anios[max[0]])} en ${fuerte(nombreEnt(candidatas[max[1]]))}: ${fuerte(n1(max[2]))} designaciones por puesto. Es decir, ese año se designó a alguien en ${fuerte(pct(max[2] * 100))} de sus puestos. 2026 llega hasta el corte.`);
    }
  }

  /* ================================================ 2. Intercambio */
  function movFiltrados() {
    const M = D.movimientos, j = nivelJ(), out = [];
    for (let k = 0; k < M.a.length; k++) {
      if (!estado.gob.has(M.g[k]) || !j.includes(M.jb[k])) continue;
      if (!(pasaEnt(M.a[k]) || pasaEnt(M.b[k]))) continue;
      out.push(k);
    }
    return out;
  }
  function dibujarIntercambio() {
    const M = D.movimientos, t = Obs.tema();
    const ix = movFiltrados();
    const rutas = new Map();
    ix.forEach((k) => { const c = `${M.a[k]}>${M.b[k]}`; if (!rutas.has(c)) rutas.set(c, []); rutas.get(c).push(k); });
    const lista = [...rutas.entries()].map(([c, ks]) => { const [a, b] = c.split(">").map(Number); return { a, b, ks, personas: new Set(ks.map((k) => M.p[k])).size }; })
      .sort((x, y) => y.personas - x.personas);
    const personas = new Set(ix.map((k) => M.p[k])).size;
    // par con más intercambio (ida y vuelta)
    const pares = new Map();
    lista.forEach((r) => { const c = [r.a, r.b].sort((x, y) => x - y).join("-"); pares.set(c, (pares.get(c) || 0) + r.personas); });
    const topPar = [...pares.entries()].sort((a, b) => b[1] - a[1])[0];
    Obs.kpi("k2-mov", { etiqueta: "Cambios de entidad", valor: n(ix.length), pie: "Una persona deja una entidad y en menos de un año asume un cargo en otra" });
    Obs.kpi("k2-personas", { etiqueta: "Personas que cambiaron de entidad", valor: n(personas), pie: textoSeleccion() });
    Obs.kpi("k2-par", { etiqueta: "Par con más intercambio", texto: topPar ? topPar[0].split("-").map((e) => nombreEnt(+e)).join(" ↔ ") : "—",
      pie: topPar ? `${n(topPar[1])} personas en ambos sentidos` : "" });
    lectura("#r2-resumen", ix.length
      ? `En ${textoSeleccion()}, ${fuerte(n(personas))} personas pasaron de una entidad a otra. La ruta más transitada es ${fuerte(`${nombreEnt(lista[0].a)} → ${nombreEnt(lista[0].b)}`)}, con ${n(lista[0].personas)} personas.`
      : "No hay cambios de entidad para esta selección.");

    // Sankey
    const top = lista.slice(0, 20);
    if (!top.length) Obs.vacio("g2-sankey");
    else {
      const izq = (e) => nombreEnt(e), der = (e) => `${nombreEnt(e)}​`;
      const nodos = new Map();
      top.forEach((r) => { nodos.set(izq(r.a), { name: izq(r.a), itemStyle: { color: t.categorias[0] } }); nodos.set(der(r.b), { name: der(r.b), itemStyle: { color: t.navy } }); });
      const g = Obs.grafico("g2-sankey");
      g.setOption({
        textStyle: { fontFamily: t.fuente },
        tooltip: { ...Obs.tooltipBase(), formatter: (p) => p.dataType === "edge"
          ? `<strong>${esc(p.data.source)} → ${esc(p.data.target.replace("​", ""))}</strong><br>${n(p.data.value)} personas` : `<strong>${esc(p.name.replace("​", ""))}</strong><br>${n(p.value)} personas` },
        series: [{ type: "sankey", left: 10, right: 160, top: 10, bottom: 10, nodeWidth: 14, nodeGap: 10, draggable: false,
          data: [...nodos.values()], links: top.map((r) => ({ source: izq(r.a), target: der(r.b), value: r.personas })),
          lineStyle: { color: "source", opacity: 0.3, curveness: 0.5 }, emphasis: { focus: "adjacency" },
          label: { fontSize: 14, color: t.texto, formatter: (p) => p.name.replace("​", "") } }],
      }, true);
      lectura("#lec2-sankey", `Las 20 rutas principales suman ${fuerte(n(top.reduce((s, r) => s + r.personas, 0)))} personas.`);
    }

    // balance
    const bal = new Map();
    ix.forEach((k) => { bal.set(M.b[k], (bal.get(M.b[k]) || 0) + 1); bal.set(M.a[k], (bal.get(M.a[k]) || 0) - 1); });
    let bl = [...bal.entries()].filter(([e]) => todasEnt() || estado.ent.has(e)).sort((a, b) => b[1] - a[1]);
    bl = [...bl.slice(0, 10), ...bl.slice(-10)].filter((x, i, arr) => arr.findIndex((y) => y[0] === x[0]) === i && x[1] !== 0);
    if (!bl.length) Obs.vacio("g2-balance");
    else {
      const g = Obs.grafico("g2-balance");
      document.getElementById("g2-balance").style.height = `${Math.max(300, bl.length * 28 + 40)}px`; g.resize();
      g.setOption({
        textStyle: { fontFamily: t.fuente },
        tooltip: { ...Obs.tooltipBase(), trigger: "axis", axisPointer: { type: "shadow" }, formatter: (ps) => `<strong>${esc(ps[0].name)}</strong><br>${ps[0].value > 0 ? "Recibe" : "Entrega"} ${n(Math.abs(ps[0].value))} personas más de las que ${ps[0].value > 0 ? "entrega" : "recibe"}` },
        grid: { left: 150, right: 50, top: 10, bottom: 10 },
        xAxis: { type: "value", splitLine: { lineStyle: { color: t.linea } }, axisLabel: { fontSize: 14, color: t.textoSuave } },
        yAxis: { type: "category", data: bl.map(([e]) => nombreEnt(e)), inverse: true, axisTick: { show: false }, axisLabel: { fontSize: 14, color: t.texto, width: 140, overflow: "truncate" }, axisLine: { show: false } },
        series: [{ type: "bar", barMaxWidth: 16, data: bl.map(([, v]) => ({ value: v, itemStyle: { color: v > 0 ? t.categorias[2] : t.categorias[1] } })),
          label: { show: true, position: "right", fontSize: 14, fontWeight: 700, color: t.texto, formatter: (p) => (p.value > 0 ? "+" : "") + n(p.value) } }],
      }, true);
      lectura("#lec2-balance", `${fuerte(nombreEnt(bl[0][0]))} es la que más recibe (+${n(bl[0][1])}); ${fuerte(nombreEnt(bl[bl.length - 1][0]))} la que más entrega (${n(bl[bl.length - 1][1])}).`);
    }

    // matriz
    const tamano = new Map();
    lista.forEach((r) => { tamano.set(r.a, (tamano.get(r.a) || 0) + r.personas); tamano.set(r.b, (tamano.get(r.b) || 0) + r.personas); });
    const ejes = [...tamano.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([e]) => e);
    const celdas = [];
    lista.forEach((r) => { const i = ejes.indexOf(r.a), j = ejes.indexOf(r.b); if (i >= 0 && j >= 0) celdas.push([j, i, r.personas]); });
    if (!celdas.length) Obs.vacio("g2-matriz");
    else {
      const g = Obs.grafico("g2-matriz");
      g.setOption({
        textStyle: { fontFamily: t.fuente },
        tooltip: { ...Obs.tooltipBase(), formatter: (p) => `<strong>${esc(nombreEnt(ejes[p.value[1]]))} → ${esc(nombreEnt(ejes[p.value[0]]))}</strong><br>${n(p.value[2])} personas` },
        grid: { left: 120, right: 10, top: 10, bottom: 110 },
        xAxis: { type: "category", data: ejes.map(nombreEnt), axisLabel: { fontSize: 14, rotate: 50, color: t.texto, width: 100, overflow: "truncate", interval: 0 }, axisTick: { show: false }, name: "Destino", nameLocation: "middle", nameGap: 95, nameTextStyle: { fontSize: 14, color: t.textoSuave } },
        yAxis: { type: "category", data: ejes.map(nombreEnt), inverse: true, axisLabel: { fontSize: 14, color: t.texto, width: 110, overflow: "truncate", interval: 0 }, axisTick: { show: false } },
        visualMap: { show: false, min: 0, max: Math.max(...celdas.map((c) => c[2])), inRange: { color: t.escala } },
        series: [{ type: "heatmap", data: celdas, itemStyle: { borderColor: "#fff", borderWidth: 1 } }],
      }, true);
    }

    // tabla de rutas
    const filas = lista.slice(0, 40);
    $("#t2-rutas").innerHTML = `<table class="tabla"><thead><tr><th>Sale de</th><th>Llega a</th><th class="num">Personas</th></tr></thead><tbody>${
      filas.map((r, i) => `<tr class="clic${estado.ruta === i ? " elegida" : ""}" data-i="${i}"><td>${esc(ENT()[r.a].nombre)}</td><td>${esc(ENT()[r.b].nombre)}</td><td class="num">${n(r.personas)}</td></tr>`).join("")}</tbody></table>`;
    $("#t2-rutas tbody").onclick = (e) => { const tr = e.target.closest("tr[data-i]"); if (tr) cambiar({ ruta: +tr.dataset.i }); };
    const r = estado.ruta != null ? filas[estado.ruta] : null;
    $("#d2-ruta").innerHTML = r ? `<div class="detalle"><h4>${esc(nombreEnt(r.a))} → ${esc(nombreEnt(r.b))}</h4><ul>${
      r.ks.sort((x, y) => M.t[x] - M.t[y]).map((k) => `<li><strong>${esc(D.personas[M.p[k]])}</strong>: ${esc(M.cargos[M.ca[k]])} → ${esc(M.cargos[M.cb[k]])} <span class="etq">(${fmtFecha(M.t[k])})</span></li>`).join("")}</ul></div>` : "";
  }

  /* ================================================ 3. Cómo funcionan */
  function dibujarMecanismos() {
    const t = Obs.tema(), Me = D.mecanismos, G = GOBS();
    const act = Me.ritmo[Me.ritmo.length - 1];
    const prev = Me.ritmo.slice(0, -1);
    const promPrev = prev.reduce((s, r) => s + r.por_dia, 0) / Math.max(prev.length, 1);
    Obs.kpi("k3-sg30", { etiqueta: "Cambia el secretario general en 30 días", valor: pct(Me.sg.pct30), pie: `Tras ${n(Me.sg.cambios)} llegadas de ministros` });
    Obs.kpi("k3-sg90", { etiqueta: "…y en 90 días", valor: pct(Me.sg.pct90), pie: "El SG es el primer cargo que se cambia" });
    Obs.kpi("k3-ritmo", { etiqueta: `Designaciones por día, gobierno de ${G[act.g].g}`, valor: n1(act.por_dia), pie: `Primeros ${n(Me.n_dias_actual)} días. Antes: ${n1(promPrev)} en promedio` });
    lectura("#r3-resumen", `Las rotaciones llegan en olas: cuando cambia un ministro, en ${fuerte(pct(Me.sg.pct30))} de los casos el secretario general cambia en menos de un mes, y después se mueven las oficinas de confianza.`);

    // serie mensual
    const Mn = D.mensual, porMes = new Map();
    for (let k = 0; k < Mn.mes.length; k++) {
      if (!pasaEnt(Mn.e[k])) continue;
      const v = porMes.get(Mn.mes[k]) || [0, 0];
      v[0] += Mn.des[k]; v[1] += Mn.sal[k]; porMes.set(Mn.mes[k], v);
    }
    const ultimo = Math.max(...Mn.mes);
    const meses = Array.from({ length: ultimo + 1 }, (_, i) => i);
    const etq = meses.map((m) => `${["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"][m % 12]} ${2020 + Math.floor(m / 12)}`);
    const mesDe = (d) => { const f = fecha(d); return (f.getUTCFullYear() - 2020) * 12 + f.getUTCMonth(); };
    const bandas = G.map((g, i) => [{ xAxis: etq[Math.max(0, mesDe(g.ini))], name: g.g, itemStyle: { color: estado.gob.has(i) ? (i % 2 ? "rgba(40,65,221,.07)" : "rgba(173,215,84,.16)") : "rgba(0,0,0,0)" } },
      { xAxis: etq[Math.min(ultimo, mesDe(g.fin))] }]);
    const g = Obs.grafico("g3-mensual");
    g.setOption({
      textStyle: { fontFamily: t.fuente },
      legend: { top: 0, left: 0, icon: "rect", itemWidth: 14, itemHeight: 4, textStyle: { fontSize: 14, color: t.textoSuave } },
      tooltip: { ...Obs.tooltipBase(), trigger: "axis" },
      grid: { left: 50, right: 16, top: 56, bottom: 70 },
      dataZoom: [{ type: "slider", bottom: 10, height: 28, textStyle: { fontSize: 14 } }, { type: "inside", zoomOnMouseWheel: false, moveOnMouseWheel: false }],
      xAxis: { type: "category", data: etq, axisLabel: { fontSize: 14, color: t.textoSuave }, axisTick: { show: false }, axisLine: { lineStyle: { color: t.linea } } },
      yAxis: { type: "value", splitLine: { lineStyle: { color: t.linea } }, axisLabel: { fontSize: 14, color: t.textoSuave } },
      series: [
        { name: "Designaciones", type: "line", data: meses.map((m) => (porMes.get(m) || [0])[0]), symbol: "none", lineStyle: { width: 2, color: t.categorias[0] }, itemStyle: { color: t.categorias[0] },
          markArea: { silent: true, label: { show: true, position: "insideTop", fontSize: 14, fontWeight: 700, color: t.navy }, data: bandas } },
        { name: "Salidas (renuncias y conclusiones)", type: "line", data: meses.map((m) => (porMes.get(m) || [0, 0])[1]), symbol: "none", lineStyle: { width: 2, color: t.categorias[1] }, itemStyle: { color: t.categorias[1] } },
      ],
    }, true);
    let pico = 0; porMes.forEach((v, m) => { if (v[0] > (porMes.get(pico) || [0])[0]) pico = m; });
    lectura("#lec3-mensual", porMes.size ? `El mes con más designaciones en ${textoSeleccion()} fue ${fuerte(etq[pico])}, con ${fuerte(n(porMes.get(pico)[0]))}.` : "");

    // tras ministro
    Obs.barras("g3-tras", Me.tras_ministro.map((r) => ({ clave: r.familia, etiqueta: r.familia, valor: r.mult, n: r.n })),
      { formato: (v) => `${n1(v)} veces`, nombre: "Designaciones frente a lo normal", detalle: (d) => `${n(d.n)} designaciones` });
    const tm = Me.tras_ministro[0];
    lectura("#lec3-tras", `En ${fuerte(tm.familia.toLowerCase())} hay ${fuerte(`${n1(tm.mult)} veces`)} más designaciones de lo normal en los 60 días siguientes a la llegada de un ministro.`);

    // cómo termina un periodo, por gobierno
    const P = D.periodos, ix = periodosFiltrados();
    const conteo = G.map(() => new Array(D.meta.motivos.length).fill(0));
    ix.forEach((k) => conteo[P.g[k]][P.m[k]]++);
    const gobs = G.map((x, i) => i).filter((i) => estado.gob.has(i) && conteo[i].reduce((a, b) => a + b, 0) >= 30);
    const orden = [1, 2, 3, 4, 0]; // renuncia, cese, sucesor, nuevo cargo, sigue
    const colorMot = (m) => (m === 0 ? t.otros : t.categorias[orden.indexOf(m)]);
    if (!gobs.length) Obs.vacio("g3-motivo");
    else {
      const g2 = Obs.grafico("g3-motivo");
      g2.setOption({
        textStyle: { fontFamily: t.fuente },
        tooltip: { ...Obs.tooltipBase(), trigger: "axis", axisPointer: { type: "shadow" }, formatter: (ps) => `<strong>${ps[0].name}</strong>` + ps.map((p) => `<br>${p.marker}${esc(p.seriesName)}: <strong>${pct(p.value)}</strong>`).join("") },
        grid: { left: 90, right: 20, top: 10, bottom: 30 },
        xAxis: { type: "value", max: 100, axisLabel: { fontSize: 14, color: t.textoSuave, formatter: "{value}%" }, splitLine: { lineStyle: { color: t.linea } } },
        yAxis: { type: "category", data: gobs.map((i) => G[i].g), inverse: true, axisTick: { show: false }, axisLabel: { fontSize: 14, color: t.texto } },
        series: orden.map((m) => ({ name: D.meta.motivos[m].nombre, type: "bar", stack: "t", barMaxWidth: 26, itemStyle: { color: colorMot(m) },
          data: gobs.map((i) => { const tot = conteo[i].reduce((a, b) => a + b, 0); return Math.round((conteo[i][m] / tot) * 1000) / 10; }) })),
      }, true);
      $("#ley3-motivo").innerHTML = orden.map((m) => `<span><i style="background:${colorMot(m)}"></i>${esc(D.meta.motivos[m].nombre)}</span>`).join("");
      const totR = ix.filter((k) => P.m[k] === 1).length, totC = ix.length - ix.filter((k) => P.m[k] === 0).length;
      lectura("#lec3-motivo", totC ? `De los periodos que ya terminaron, ${fuerte(pct((totR / totC) * 100))} acabó con una renuncia. Los periodos de los gobiernos recientes siguen abiertos en su mayoría.` : "");
    }

    // ritmo y continuidad
    $("#p3-ritmo").textContent = `Designaciones por día en los primeros ${Me.n_dias_actual} días de cada gobierno (los que duraron menos, en todos sus días).`;
    Obs.barras("g3-ritmo", Me.ritmo.map((r) => ({ clave: r.g, etiqueta: G[r.g].g, valor: r.por_dia, color: r.g === act.g ? t.categorias[1] : t.unica })),
      { ordenar: false, formato: (v) => n1(v), nombre: "Designaciones por día", seleccion: estado.gob.size === G.length ? null : estado.gob });
    lectura("#lec3-ritmo", `El gobierno de ${fuerte(G[act.g].g)} designa ${fuerte(n1(act.por_dia))} personas por día en sus primeros ${n(Me.n_dias_actual)} días.`);
    Obs.barras("g3-cont", Me.continuidad.map((r) => ({ clave: r.g, etiqueta: G[r.g].g, valor: r.pct, n: r.personas })),
      { ordenar: false, formato: (v) => pct(v), nombre: "Ya estaba en el Estado", detalle: (d) => `${n(d.n)} personas designadas`, seleccion: estado.gob.size === G.length ? null : estado.gob });
    const c = Me.continuidad[Me.continuidad.length - 1];
    lectura("#lec3-cont", `En el gobierno de ${fuerte(G[c.g].g)}, ${fuerte(pct(c.pct))} de los designados ya había tenido un cargo antes.`);
  }

  /* ================================================ 4. Redes */
  function pintarPasosRedes() {
    const nodo = (x, y, c, r = 9) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
    const caja = (x, txt) => `<rect x="${x}" y="58" width="72" height="30" rx="4" fill="#fff" stroke="var(--linea)"/><text x="${x + 36}" y="78" text-anchor="middle" font-size="14" font-weight="700" fill="var(--navy)">${txt}</text>`;
    const flecha = (x1, y1, x2, y2) => `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="var(--texto-suave)" stroke-width="2" marker-end="url(#pt)"/>`;
    const defs = `<defs><marker id="pt" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--texto-suave)"/></marker></defs>`;
    const pasos = [
      { t: "Leemos quién firma", p: "Cada resolución dice quién designa (el ministro, el jefe o el gerente). Así sabemos quién es el jefe de cada persona designada.",
        svg: `<rect x="70" y="8" width="70" height="84" rx="4" fill="#fff" stroke="var(--linea)"/><path d="M82 26h46M82 38h46M82 50h30" stroke="var(--linea)" stroke-width="4"/><path d="M84 76c8-10 14 6 22-4s10 4 18-2" stroke="var(--azul)" stroke-width="3" fill="none"/>` },
      { t: "Seguimiento al jefe", p: "Si un jefe pasa de la entidad A a la B, y alguien que él designó en A aparece designado por él en B, decimos que lo siguió. El jefe debe haber firmado al menos 3 normas en cada entidad.",
        svg: `${defs}${caja(4, "A")}${caja(134, "B")}${nodo(40, 30, "var(--navy)", 11)}${nodo(170, 30, "var(--navy)", 11)}${flecha(54, 30, 154, 30)}${nodo(30, 50, "var(--azul)", 6)}${nodo(160, 50, "var(--azul)", 6)}${flecha(40, 50, 150, 50)}` },
      { t: "Grupos que se mudan juntos", p: "Personas que coincidieron en la entidad A y llegan a la misma entidad B con menos de 180 días de diferencia. Si son 3 o más, es un “episodio”.",
        svg: `${defs}${caja(4, "A")}${caja(134, "B")}${[0, 1, 2].map((i) => nodo(22 + i * 18, 40, "var(--azul)", 7) + nodo(152 + i * 18, 40, "var(--azul)", 7)).join("")}${flecha(78, 40, 140, 40)}<text x="110" y="24" text-anchor="middle" font-size="14" fill="var(--texto-suave)">≤ 180 días</text>` },
      { t: "¿Pasa más que por azar?", p: `Barajamos 20 veces las fechas de llegada a cada entidad, como un mazo de cartas, y contamos cuántos pares saldrían por casualidad. Si los datos reales tienen muchos más, los grupos se mueven a propósito.`,
        svg: `${[0, 1, 2, 3].map((i) => `<rect x="${60 + i * 16}" y="${18 + (i % 2) * 8}" width="44" height="62" rx="4" fill="#fff" stroke="var(--azul)" transform="rotate(${-12 + i * 8} ${82 + i * 16} 50)"/>`).join("")}` },
    ];
    $("#pasos-redes").innerHTML = pasos.map((s, i) => `<div class="paso"><span class="num">${i + 1}</span><svg viewBox="0 0 210 96" aria-hidden="true">${s.svg}</svg><h4>${s.t}</h4><p>${s.p}</p></div>`).join("");
  }

  function dibujarRedes() {
    const t = Obs.tema(), G = GOBS();
    const esSeg = estado.red === "seguimiento";
    $("#c4-azar").hidden = esSeg;
    const entOk = (es) => !filtroEntActivo() || es.some(pasaEnt);

    if (esSeg) {
      const S = D.seguimiento;
      const pares = S.pares.filter((p) => estado.gob.has(p.g) && entOk(p.e));
      const porJefe = new Map();
      pares.forEach((p) => { if (!porJefe.has(p.j)) porJefe.set(p.j, []); porJefe.get(p.j).push(p); });
      const jefes = [...porJefe.entries()].sort((a, b) => b[1].length - a[1].length);
      Obs.kpi("k4-a", { etiqueta: "Jefes con seguidores", valor: n(jefes.length), pie: "Pasaron de una entidad a otra y su gente los siguió" });
      Obs.kpi("k4-b", { etiqueta: "Personas que siguieron a su jefe", valor: n(new Set(pares.map((p) => p.s)).size), pie: "Designadas por el mismo jefe en dos entidades o más" });
      Obs.kpi("k4-c", { etiqueta: "Jefe con más seguidores", texto: jefes.length ? S.jefes[jefes[0][0]] : "—", pie: jefes.length ? `${n(jefes[0][1].length)} personas lo siguieron` : "" });
      lectura("#r4-resumen", jefes.length
        ? `En ${textoSeleccion()}, ${fuerte(n(jefes.length))} jefes llevaron consigo a parte de su equipo al cambiar de entidad. Es la red de "quién llega detrás de quién".`
        : "No hay casos de seguimiento para esta selección.");
      $("#h4-red").textContent = "Jefes y las personas que los siguieron";
      $("#p4-red").textContent = "Los puntos grandes son jefes; los pequeños, las personas que designaron en más de una entidad. Se muestran los 30 jefes con más seguidores.";
      const top = jefes.slice(0, 30);
      const nodos = [], aristas = [], vistos = new Set();
      top.forEach(([j, ps], i) => {
        nodos.push({ id: `J${j}`, name: S.jefes[j], category: 0, symbolSize: 12 + Math.sqrt(ps.length) * 6, value: ps.length, etiqueta: i < 8 });
        ps.forEach((p) => { const id = `P${p.s}`; if (!vistos.has(id)) { vistos.add(id); nodos.push({ id, name: p.s, category: 1, symbolSize: 8 }); } aristas.push({ source: `J${j}`, target: id }); });
      });
      dibujarGrafo(nodos, aristas, [{ name: "Jefe", itemStyle: { color: t.navy } }, { name: "Persona que lo siguió", itemStyle: { color: t.categorias[0] } }], false);
      $("#ley4-red").innerHTML = `<span><i style="background:${t.navy}"></i>Jefe</span><span><i style="background:${t.categorias[0]}"></i>Persona que lo siguió</span>`;
      // detalle
      const sel = estado.detalleRed;
      if (sel && sel.startsWith("J") && porJefe.has(+sel.slice(1))) {
        const j = +sel.slice(1), ps = porJefe.get(j);
        $("#h4-detalle").textContent = S.jefes[j];
        $("#p4-detalle").textContent = `${ps.length} personas lo siguieron`;
        $("#d4-detalle").innerHTML = `<ul>${ps.map((p) => `<li><strong>${esc(p.s)}</strong><br><span class="etq">${p.e.map((e) => esc(nombreEnt(e))).join(" → ")}</span></li>`).join("")}</ul>`;
      } else if (sel && sel.startsWith("P")) {
        const nom = sel.slice(1), ps = pares.filter((p) => p.s === nom);
        $("#h4-detalle").textContent = nom;
        $("#p4-detalle").textContent = "Siguió a:";
        $("#d4-detalle").innerHTML = `<ul>${ps.map((p) => `<li><strong>${esc(S.jefes[p.j])}</strong><br><span class="etq">${p.e.map((e) => esc(nombreEnt(e))).join(" → ")}</span></li>`).join("")}</ul>`;
      } else { $("#h4-detalle").textContent = "Detalle"; $("#p4-detalle").textContent = "Elige un jefe o una persona en la red."; $("#d4-detalle").innerHTML = ""; }
      $("#h4-tabla").textContent = "Jefes con más seguidores";
      $("#p4-tabla").textContent = "Entidades por las que pasaron sus seguidores.";
      $("#t4-casos").innerHTML = `<table class="tabla"><thead><tr><th>Jefe</th><th class="num">Seguidores</th><th>Entidades</th></tr></thead><tbody>${
        jefes.slice(0, 40).map(([j, ps]) => `<tr class="clic" data-id="J${j}"><td>${esc(S.jefes[j])}</td><td class="num">${n(ps.length)}</td><td>${[...new Set(ps.flatMap((p) => p.e))].slice(0, 6).map((e) => esc(nombreEnt(e))).join(", ")}</td></tr>`).join("")}</tbody></table>`;
    } else {
      const C = D.cotraslado;
      const eps = C.episodios.filter((e) => estado.gob.has(e.g) && entOk([e.a, e.b]));
      const personas = eps.reduce((s, e) => s + e.n, 0);
      const conJefe = eps.filter((e) => e.vino).length;
      const azar = C.sims.reduce((a, b) => a + b, 0) / C.sims.length;
      Obs.kpi("k4-a", { etiqueta: "Episodios de traslado en grupo", valor: n(eps.length), pie: "3 o más personas que salen juntas de A y llegan juntas a B" });
      Obs.kpi("k4-b", { etiqueta: "Personas en esos grupos", valor: n(personas), pie: `En ${pct(eps.length ? (conJefe / eps.length) * 100 : null)} de los episodios el jefe también vino de A` });
      Obs.kpi("k4-c", { etiqueta: "Más que por azar", valor: `${n1(C.observados / azar)} veces`, pie: "Pares reales frente al promedio de 20 simulaciones (todo el Estado)" });
      lectura("#r4-resumen", `Los funcionarios se mudan en grupo: hay ${fuerte(`${n1(C.observados / azar)} veces`)} más pares que llegan juntos a una entidad de lo que esperaríamos por casualidad. En ${textoSeleccion()} encontramos ${fuerte(n(eps.length))} episodios con ${n(personas)} personas.`);
      $("#h4-red").textContent = "Rutas de los grupos que se mudan juntos";
      $("#p4-red").textContent = "Cada punto es una entidad; cada flecha, grupos de personas que salieron de una y llegaron juntas a otra. El grosor es el número de personas.";
      const peso = new Map(), tam = new Map();
      eps.forEach((e) => { const c = `${e.a}>${e.b}`; peso.set(c, (peso.get(c) || 0) + e.n); tam.set(e.a, (tam.get(e.a) || 0) + e.n); tam.set(e.b, (tam.get(e.b) || 0) + e.n); });
      const nodos = [...tam.entries()].map(([e, v]) => ({ id: `E${e}`, name: nombreEnt(e), category: ENT()[e].tipo === "ministerio" ? 0 : 1, symbolSize: 10 + Math.sqrt(v) * 4, value: v }))
        .sort((a, b) => b.value - a.value).map((x, i) => ({ ...x, etiqueta: i < 14 }));
      const maxP = Math.max(1, ...peso.values());
      const aristas = [...peso.entries()].map(([c, v]) => { const [a, b] = c.split(">"); return { source: `E${a}`, target: `E${b}`, value: v, lineStyle: { width: 1 + (v / maxP) * 7 } }; });
      dibujarGrafo(nodos, aristas, [{ name: "Ministerio", itemStyle: { color: t.navy } }, { name: "Otra entidad", itemStyle: { color: t.categorias[0] } }], true);
      $("#ley4-red").innerHTML = `<span><i style="background:${t.navy}"></i>Ministerio</span><span><i style="background:${t.categorias[0]}"></i>Otra entidad</span>`;
      const sel = estado.detalleRed;
      let det = [];
      if (sel && sel.includes(">")) { const [a, b] = sel.split(">").map((x) => +x.slice(1)); det = eps.filter((e) => e.a === a && e.b === b); $("#h4-detalle").textContent = `${nombreEnt(a)} → ${nombreEnt(b)}`; }
      else if (sel && sel.startsWith("E")) { const e0 = +sel.slice(1); det = eps.filter((e) => e.a === e0 || e.b === e0); $("#h4-detalle").textContent = ENT()[e0].nombre; }
      else $("#h4-detalle").textContent = "Detalle";
      $("#p4-detalle").textContent = det.length ? `${det.length} episodios` : "Elige una entidad o una flecha en la red.";
      $("#d4-detalle").innerHTML = det.map((e) => `<h4>${esc(nombreEnt(e.a))} → ${esc(nombreEnt(e.b))} · ${fmtFecha(e.t)}</h4>${e.jefe ? `<span class="etq">Firma: ${esc(e.jefe)}${e.vino ? " (también vino de " + esc(nombreEnt(e.a)) + ")" : ""}</span>` : ""}<ul>${e.per.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`).join("");
      // azar
      const ga = Obs.grafico("g4-azar");
      ga.setOption({
        textStyle: { fontFamily: t.fuente },
        tooltip: { ...Obs.tooltipBase(), formatter: (p) => (p.seriesIndex === 0 ? `Simulación al azar<br><strong>${n(p.value[0])}</strong> pares` : `Datos reales<br><strong>${n(p.value[0])}</strong> pares`) },
        grid: { left: 20, right: 40, top: 30, bottom: 50 },
        xAxis: { type: "value", min: 0, name: "Pares de personas que llegan juntas", nameLocation: "middle", nameGap: 32, nameTextStyle: { fontSize: 14, color: t.textoSuave },
          axisLabel: { fontSize: 14, color: t.textoSuave, formatter: (v) => n(v) }, splitLine: { lineStyle: { color: t.linea } } },
        yAxis: { type: "value", show: false, min: -1, max: 1 },
        series: [
          { type: "scatter", symbolSize: 12, itemStyle: { color: t.otros, opacity: 0.8 }, data: C.sims.map((s, i) => [s, ((i % 5) - 2) * 0.12]) },
          { type: "scatter", symbolSize: 20, itemStyle: { color: t.categorias[1] }, data: [[C.observados, 0]],
            label: { show: true, position: "top", fontSize: 14, fontWeight: 700, color: t.texto, formatter: "Datos reales" } },
        ],
      }, true);
      lectura("#lec4-azar", `Al azar saldrían unos ${fuerte(n(Math.round(azar)))} pares; en los datos hay ${fuerte(n(C.observados))}. Esta prueba se hace con todo el Estado y no cambia con los filtros.`);
      $("#h4-tabla").textContent = "Episodios más grandes";
      $("#p4-tabla").textContent = "Clic en una fila para verla en el detalle.";
      $("#t4-casos").innerHTML = `<table class="tabla"><thead><tr><th>Ruta</th><th class="num">Personas</th><th>Llegada</th><th>Quién firma en destino</th><th>¿El jefe también vino?</th></tr></thead><tbody>${
        eps.slice(0, 60).map((e) => `<tr class="clic" data-id="E${e.a}>E${e.b}"><td>${esc(nombreEnt(e.a))} → ${esc(nombreEnt(e.b))}</td><td class="num">${n(e.n)}</td><td>${fmtFecha(e.t)}</td><td>${esc(e.jefe)}</td><td>${e.vino ? "Sí" : "No"}</td></tr>`).join("")}</tbody></table>`;
    }
    $("#t4-casos tbody").onclick = (e) => { const tr = e.target.closest("tr[data-id]"); if (tr) { cambiar({ detalleRed: tr.dataset.id }); $("#h4-detalle").scrollIntoView({ behavior: "smooth", block: "center" }); } };
  }

  function dibujarGrafo(nodos, aristas, categorias, dirigido) {
    const t = Obs.tema();
    if (!nodos.length) return Obs.vacio("g4-red");
    const g = Obs.grafico("g4-red");
    g.setOption({
      textStyle: { fontFamily: t.fuente },
      tooltip: { ...Obs.tooltipBase(), formatter: (p) => p.dataType === "edge"
        ? (p.data.value ? `<strong>${esc(nodos.find((x) => x.id === p.data.source).name)} → ${esc(nodos.find((x) => x.id === p.data.target).name)}</strong><br>${n(p.data.value)} personas` : "")
        : `<strong>${esc(p.name)}</strong>${p.value ? `<br>${n(p.value)} ${dirigido ? "personas" : "seguidores"}` : ""}` },
      series: [{
        type: "graph", layout: "force", roam: true, draggable: true, categories: categorias,
        data: nodos.map((x) => ({ ...x, label: { show: x.etiqueta ?? x.symbolSize > 18, position: "right", fontSize: 14, color: t.texto, backgroundColor: "rgba(255,255,255,.85)", padding: [1, 3] } })),
        links: aristas, edgeSymbol: dirigido ? ["none", "arrow"] : ["none", "none"], edgeSymbolSize: 8,
        zoom: dirigido ? 0.9 : 0.85,
        force: { repulsion: dirigido ? 220 : 70, edgeLength: dirigido ? [50, 140] : [12, 34], gravity: dirigido ? 0.15 : 0.4 },
        lineStyle: { color: t.otros, opacity: 0.6, curveness: dirigido ? 0.15 : 0 },
        emphasis: { focus: "adjacency", lineStyle: { width: 3 } },
      }],
    }, true);
    g.off("click");
    g.on("click", (p) => cambiar({ detalleRed: p.dataType === "edge" ? `${p.data.source}>${p.data.target}` : p.data.id }));
  }

  /* ================================================ 5. Casos */
  function dibujarCasos() {
    const t = Obs.tema();
    const gobAct = estado.gob.size !== GOBS().length;
    const lista = D.trayectorias.filter((tr) => !(filtroEntActivo() || gobAct) || tr.per.some((x) => pasaEnt(x[0]) && estado.gob.has(gobDeDia(x[3]))));
    const reglas = [
      { k: "ne", etq: "Pasó por más entidades", dato: (tr) => `${tr.ne} entidades, ${tr.n} cargos` },
      { k: "r2", etq: "Más cargos en dos años", dato: (tr) => `${tr.r2} cargos en menos de 2 años` },
      { k: "n", etq: "Más cargos en total", dato: (tr) => `${tr.n} cargos en ${tr.ne} entidades` },
    ];
    const elegido = (k) => [...lista].sort((a, b) => b[k] - a[k] || b.n - a.n)[0];
    lectura("#r5-resumen", lista.length
      ? `En ${textoSeleccion()} hay ${fuerte(n(lista.length))} personas con 3 cargos o más desde 2020. Elige un caso para ver su recorrido.`
      : "No hay personas con 3 cargos o más para esta selección.");
    $("#c5-tarjetas").innerHTML = lista.length ? reglas.map((r) => { const tr = elegido(r.k);
      return `<button type="button" class="caso" data-p="${tr.p}" aria-pressed="${estado.persona === tr.p}"><span class="etq">${r.etq}</span><strong>${esc(D.personas[tr.p])}</strong><span class="dato">${r.dato(tr)}</span></button>`; }).join("") : "";
    $("#c5-tarjetas").onclick = (e) => { const b = e.target.closest("[data-p]"); if (b) cambiar({ persona: +b.dataset.p }); };
    const orden = [...lista].sort((a, b) => b[estado.orden] - a[estado.orden] || b.n - a.n);
    $("#l5-personas").innerHTML = orden.slice(0, 3000).map((tr) => `<option value="${esc(D.personas[tr.p])}">`).join("");
    if (estado.persona == null || !lista.some((x) => x.p === estado.persona)) estado.persona = orden[0]?.p ?? null;
    $("#l5-lista").innerHTML = orden.slice(0, 12).map((tr) => `<button type="button" data-p="${tr.p}" aria-pressed="${tr.p === estado.persona}">${esc(D.personas[tr.p])} · ${tr[estado.orden]}</button>`).join("");
    $("#l5-lista").onclick = (e) => { const b = e.target.closest("[data-p]"); if (b) cambiar({ persona: +b.dataset.p }); };

    const tr = ctl.trayPorPersona.get(estado.persona);
    if (!tr) { Obs.vacio("g5-gantt"); $("#h5-persona").textContent = ""; $("#t5-periodos").innerHTML = ""; $("#ley5-gantt").innerHTML = ""; return; }
    const per = [...tr.per].sort((a, b) => a[3] - b[3]);
    $("#h5-persona").innerHTML = `${esc(D.personas[tr.p])} <small>· ${tr.n} cargos en ${tr.ne} entidades</small>`;
    const entsOrden = [...new Set(per.map((x) => x[0]))];
    // trayectoria: más entidades que colores categóricos; después de los 5 se usan otros colores de la marca
    const css = getComputedStyle(document.documentElement);
    const paleta = [...t.categorias, ...["--rosa", "--verde", "--azul-claro", "--rojo", "--navy"].map((v) => css.getPropertyValue(v).trim())];
    const colorE = (e) => paleta[entsOrden.indexOf(e)] ?? t.otros;
    const hoy = (Date.parse(D.meta.corte) - T0) / DIA;
    const filas = per.map((x) => `${x[1]} · ${nombreEnt(x[0])}`);
    const el = document.getElementById("g5-gantt");
    el.style.height = `${Math.max(220, per.length * 36 + 70)}px`;
    const g = Obs.grafico("g5-gantt"); g.resize();
    g.setOption({
      textStyle: { fontFamily: t.fuente },
      tooltip: { ...Obs.tooltipBase(), formatter: (p) => { const x = per[p.value[0]]; return `<strong>${esc(x[1])}</strong><br>${esc(ENT()[x[0]].nombre)}${x[2] ? `<br>${esc(x[2])}` : ""}<br>${fmtFecha(x[3])} – ${x[4] == null ? "sigue" : fmtFecha(x[4])} (${n((x[4] ?? hoy) - x[3])} días)<br>${esc(D.meta.motivos[x[5]].nombre)}`; } },
      grid: { left: Math.min(300, el.clientWidth * 0.4), right: 20, top: 10, bottom: 40 },
      xAxis: { type: "time", min: T0, max: T0 + hoy * DIA, axisLabel: { fontSize: 14, color: t.textoSuave }, splitLine: { lineStyle: { color: t.linea } } },
      yAxis: { type: "category", data: filas, inverse: true, axisTick: { show: false }, axisLabel: { fontSize: 14, color: t.texto, width: Math.min(290, el.clientWidth * 0.4 - 10), overflow: "truncate" } },
      series: [{ type: "custom", encode: { x: [1, 2], y: 0 },
        data: per.map((x, i) => ({ value: [i, T0 + x[3] * DIA, T0 + (x[4] ?? hoy) * DIA], itemStyle: { color: colorE(x[0]) } })),
        renderItem: (params, api) => {
          const y = api.value(0), a = api.coord([api.value(1), y]), b = api.coord([api.value(2), y]);
          const h = api.size([0, 1])[1] * 0.6;
          return { type: "rect", shape: { x: a[0], y: a[1] - h / 2, width: Math.max(3, b[0] - a[0]), height: h, r: 2 }, style: api.style() };
        } }],
    }, true);
    $("#ley5-gantt").innerHTML = entsOrden.map((e) => `<span><i style="background:${colorE(e)}"></i>${esc(nombreEnt(e))}</span>`).join("");
    $("#t5-periodos").innerHTML = `<table class="tabla"><thead><tr><th>Desde</th><th>Hasta</th><th class="num">Días</th><th>Cargo</th><th>Oficina</th><th>Entidad</th><th>Cómo terminó</th></tr></thead><tbody>${
      per.map((x) => `<tr><td>${fmtFecha(x[3])}</td><td>${x[4] == null ? "Sigue" : fmtFecha(x[4])}</td><td class="num">${n((x[4] ?? hoy) - x[3])}</td><td>${esc(x[1])}</td><td>${esc(x[2])}</td><td>${esc(nombreEnt(x[0]))}</td><td>${esc(D.meta.motivos[x[5]].nombre)}</td></tr>`).join("")}</tbody></table>`;
  }

  /* ================================================ 6. OCI */
  function dibujarOci() {
    const O = D.oci, t = Obs.tema();
    const ix = O.s.map((_, k) => k).filter((k) => estado.gob.has(O.g[k]));
    const r = km(ix.map((k) => O.d[k]), ix.map((k) => O.x[k]));
    const jefes = new Set(ix.map((k) => O.p[k])).size;
    const porSede = new Map();
    ix.forEach((k) => { if (!porSede.has(O.s[k])) porSede.set(O.s[k], new Set()); porSede.get(O.s[k]).add(O.p[k]); });
    Obs.kpi("k6-jefes", { etiqueta: "Jefes de OCI designados", valor: n(jefes), pie: `${n(ix.length)} designaciones` });
    Obs.kpi("k6-mediana", { etiqueta: "La mitad dejó la sede antes de", valor: r.med == null ? "—" : `${n(r.med)} días`, pie: r.med ? `≈ ${n1(r.med / 365)} años` : "" });
    Obs.kpi("k6-sedes", { etiqueta: "Sedes con jefe designado", valor: n(porSede.size), pie: "Entidades, municipios, hospitales, empresas…" });
    lectura("#r6-resumen", `Los jefes de los Órganos de Control Institucional (OCI) los designa la Contraloría, no la entidad. Duran más que los directivos: la mitad deja su sede antes de ${fuerte(`${n(r.med)} días`)}.`);
    const porTipo = new Map();
    ix.forEach((k) => { const tp = O.tipo_sede[O.s[k]]; if (!porTipo.has(tp)) porTipo.set(tp, []); porTipo.get(tp).push(k); });
    const items = [];
    porTipo.forEach((ks, tp) => { if (ks.length < 20) return; const s = km(ks.map((k) => O.d[k]), ks.map((k) => O.x[k])); if (s.med) items.push({ clave: tp, etiqueta: O.tipos[tp], valor: s.med, n: ks.length }); });
    items.sort((a, b) => a.valor - b.valor);
    Obs.barras("g6-tipo", items, { ordenar: false, formato: (v) => `${n(v)} d`, nombre: "La mitad dura", detalle: (d) => `${n(d.n)} jefes` });
    lectura("#lec6-tipo", items.length ? `En ${fuerte(items[0].etiqueta.toLowerCase())} rotan más rápido: ${fuerte(`${n(items[0].valor)} días`)}.` : "");
    const dist = [0, 0, 0, 0, 0];
    porSede.forEach((s) => dist[Math.min(5, s.size) - 1]++);
    Obs.columnas("g6-jefes", ["1 jefe", "2 jefes", "3 jefes", "4 jefes", "5 o más"], dist, { nombre: "Sedes" });
    lectura("#lec6-jefes", `${fuerte(n(dist.slice(2).reduce((a, b) => a + b, 0)))} sedes tuvieron 3 jefes o más.`);
    const porMes = new Map();
    ix.forEach((k) => { const f = fecha(O.i[k]); const m = (f.getUTCFullYear() - 2020) * 12 + f.getUTCMonth(); porMes.set(m, (porMes.get(m) || 0) + 1); });
    const ult = Math.max(0, ...porMes.keys());
    const meses = Array.from({ length: ult + 1 }, (_, i) => i).filter((m) => m >= 0);
    const g = Obs.grafico("g6-mensual");
    g.setOption({
      textStyle: { fontFamily: t.fuente }, tooltip: { ...Obs.tooltipBase(), trigger: "axis" },
      grid: { left: 50, right: 16, top: 20, bottom: 40 },
      xAxis: { type: "category", data: meses.map((m) => `${["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"][m % 12]} ${2020 + Math.floor(m / 12)}`), axisLabel: { fontSize: 14, color: t.textoSuave }, axisTick: { show: false } },
      yAxis: { type: "value", splitLine: { lineStyle: { color: t.linea } }, axisLabel: { fontSize: 14, color: t.textoSuave } },
      series: [{ type: "bar", name: "Designaciones de jefes de OCI", data: meses.map((m) => porMes.get(m) || 0), itemStyle: { color: t.unica } }],
    }, true);
  }

  /* ================================================ 7. Método */
  function pintarMetodo() {
    const A = ["meta", "periodos", "movimientos", "trayectorias", "seguimiento", "cotraslado", "oci"];
    $("#metodo-texto").innerHTML = `
      <h2>¿Qué medimos?</h2>
      <p>Cada vez que el Estado nombra a un directivo de confianza (un director, un jefe de oficina, un asesor) o le pone fin a su cargo, publica una resolución en el diario oficial <em>El Peruano</em>. Leímos todas las resoluciones de designación, conclusión y renuncia publicadas desde el 1 de enero de 2020 hasta el ${esc(fmtCorte(D.meta.corte))} y armamos, para cada persona, la lista de cargos que ocupó, cuándo empezó y cuándo terminó.</p>
      <h2>Conceptos</h2>
      <dl>
        <dt>Periodo en el cargo</dt><dd>El tiempo entre la designación de una persona en un puesto y su salida (renuncia, conclusión, llegada de un reemplazo o paso a otro cargo).</dd>
        <dt>"La mitad dura X días"</dt><dd>Es la mediana de permanencia. Como muchas personas siguen en su cargo, no sabemos aún cuánto durarán; el método de Kaplan-Meier las cuenta mientras siguen, sin inventarles una fecha de salida.</dd>
        <dt>Personas por puesto</dt><dd>Cuántas personas distintas ocuparon el mismo puesto (misma entidad, oficina y cargo) en la selección.</dd>
        <dt>Niveles</dt><dd><strong>Alta dirección</strong>: viceministros, secretarios generales y jefes de entidad. <strong>Directores generales</strong>: jefes de órganos. <strong>Asesores</strong>. <strong>Jefes de unidad</strong>: directores y jefes de oficina.</dd>
        <dt>Cambio de entidad</dt><dd>Una persona deja un cargo en una entidad y en menos de un año asume otro en una entidad distinta.</dd>
        <dt>Seguimiento</dt><dd>Un jefe que firmó al menos 3 resoluciones en dos entidades designó a la misma persona en ambas.</dd>
        <dt>Co-traslado</dt><dd>Personas que coincidieron en una entidad y llegaron a otra con menos de 180 días de diferencia. Con 3 o más, es un episodio. Se compara con 20 simulaciones en las que se barajan las fechas de llegada.</dd>
      </dl>
      <h2>Qué no incluye</h2>
      <p>Los ministros (se analizan aparte), el Poder Judicial, el Ministerio Público, los representantes ante comisiones y consejos, los responsables de transparencia, los fedatarios, los prefectos y subprefectos. Tampoco hay contratos CAS ni locadores: solo lo que se publica en El Peruano. Los encargos temporales no cuentan para las duraciones.</p>
      <h2>Límites</h2>
      <ul>
        <li>Los nombres se unifican con reglas (tildes, segundo nombre, DNI cuando aparece). Puede haber dos personas unidas por error o una persona separada en dos.</li>
        <li>Cuando no se publica el cese, la salida se infiere por la llegada de un reemplazo o por un nuevo cargo de la misma persona.</li>
        <li>Los jefes de los OCI los designa la Contraloría y se analizan por separado.</li>
      </ul>
      <h2 id="descargas">Descargar datos</h2>
      <p class="descargas">${A.map((a) => `<a href="datos/${a}.json" download>${a}.json</a>`).join("")}</p>`;
  }
})();
