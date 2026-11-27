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
  const ARCHIVOS = ["meta", "periodos", "mensual", "movimientos", "personas", "trayectorias", "seguimiento", "cotraslado", "relaciones", "mecanismos", "oci"];
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
      parTipo: null, parPersona: null,
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
    const sel = textoSeleccion();
    $("#t1-ranking").textContent = {
      mediana: "Entidades donde los directivos duran menos",
      pct6: "Entidades donde más directivos salen antes de 6 meses",
      titulares: "Entidades por donde pasan más personas por puesto",
    }[estado.metrica];
    $("#def1-ranking").innerHTML = {
      mediana: `<p><b>Qué mide:</b> cuántos días pasan hasta que la mitad de los directivos de la entidad deja el cargo (la mediana de permanencia).</p>
        <p><b>Cómo se calcula:</b> con todos los periodos en el cargo desde 2020. Los que siguen abiertos al corte también cuentan: aportan los días que llevan hasta hoy, sin suponer cuándo terminarán (método Kaplan-Meier).</p>
        <p><b>Cómo leerlo:</b> menos días, más rotación. En ${sel} la mitad se va antes de ${fuerte(`${n(tot.med)} días`)} (unos ${n1(tot.med / 30.4)} meses).</p>`,
      pct6: `<p><b>Qué mide:</b> qué parte de los periodos en el cargo terminó antes de cumplir 6 meses (183 días).</p>
        <p><b>Cómo se calcula:</b> periodos cerrados con menos de 183 días ÷ todos los periodos de la entidad, incluidos los que siguen abiertos.</p>
        <p><b>Cómo leerlo:</b> un porcentaje alto indica salidas tempranas, antes de que el directivo pueda consolidar su gestión. En ${sel}: ${fuerte(pct(tot.pct6))}. Los periodos que empezaron hace poco todavía no pueden cumplir 6 meses, así que en los gobiernos más recientes esta cifra puede verse más baja de lo que será.</p>`,
      titulares: `<p><b>Qué mide:</b> cuántas personas distintas ocuparon, en promedio, un mismo puesto (por ejemplo, la Dirección General de Administración de un ministerio).</p>
        <p><b>Cómo se calcula:</b> para cada puesto se cuentan las personas distintas designadas desde 2020 y se promedia entre los puestos de la entidad.</p>
        <p><b>Cómo leerlo:</b> 1 significa que nadie cambió; 3 significa que por cada puesto pasaron tres personas. En ${sel}: ${fuerte(n1(tot.titulares))} personas por puesto.</p>`,
    }[estado.metrica] + `<p class="nota">Solo entidades con 30 periodos o más. La marca vertical es el total del Estado con los mismos filtros.</p>`;
    $("#ley1-ranking").innerHTML =`<span><i style="background:${t.unica}"></i>Entidad</span><span><i class="marca" style="background:${t.navy}"></i>Total del Estado</span>`;
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
        celdas.push({ value: [col, fila, v], nuevos, puestos, label: { color: v < 0.3 ? t.navy : "#fff" } });
      });
    });
    if (!celdas.length) Obs.vacio("g1-calor");
    else {
      const g = Obs.grafico("g1-calor");
      const el = document.getElementById("g1-calor");
      el.style.height = `${Math.max(300, candidatas.length * 30 + 90)}px`; g.resize();
      g.setOption({
        textStyle: { fontFamily: t.fuente },
        tooltip: { ...Obs.tooltipBase(), formatter: (p) => `<strong>${esc(nombreEnt(candidatas[p.value[1]]))}</strong> · ${anios[p.value[0]]}<br>${n(p.data.nuevos)} designaciones ÷ ${n(p.data.puestos)} puestos = <strong>${n1(p.value[2])}</strong> por puesto` },
        grid: { left: 150, right: 20, top: 34, bottom: 70 },
        xAxis: { type: "category", position: "top", data: anios.map((a) => (a === 2026 ? "2026*" : a)), axisLabel: { fontSize: 14, color: t.textoSuave }, axisTick: { show: false }, axisLine: { show: false }, splitArea: { show: false } },
        yAxis: { type: "category", data: candidatas.map(nombreEnt), inverse: true, axisLabel: { fontSize: 14, color: t.texto, width: 140, overflow: "truncate" }, axisTick: { show: false } },
        visualMap: { min: 0, max: 1.2, calculable: false, orient: "horizontal", left: "center", bottom: 0, itemWidth: 12, itemHeight: 200,
          inRange: { color: t.escala }, text: ["1,2 o más", "0"], textStyle: { fontSize: 14, color: t.textoSuave } },
        series: [{ type: "heatmap", data: celdas, label: { show: el.clientWidth > 600, fontSize: 14, formatter: (p) => n1(p.value[2]) },
          itemStyle: { borderColor: "#fff", borderWidth: 2 } }],
      }, true);
      const mc = celdas.filter((c) => c.value[0] < 6).reduce((a, c) => (c.value[2] > a.value[2] ? c : a));
      const max = mc.value, ent = nombreEnt(candidatas[max[1]]);
      const leer = max[2] >= 1
        ? `Hubo más designaciones que puestos (${fuerte(n1(max[2]))} por puesto): varios puestos cambiaron de titular más de una vez ese año.`
        : `Es como si ${fuerte(pct(max[2] * 100))} de sus puestos hubiera cambiado de titular ese año.`;
      lectura("#lec1-calor", `El año más movido fue ${fuerte(anios[max[0]])} en ${fuerte(ent)}: ${fuerte(n(mc.nuevos))} designaciones para ${n(mc.puestos)} puestos. ${leer}`);
      $("#def1-calor").innerHTML = `<p><b>Qué mide:</b> cuántas designaciones hubo en un año por cada puesto de la entidad. Es una medida de intensidad del cambio.</p>
        <p><b>Cómo se calcula:</b> designaciones de titulares que empezaron ese año ÷ número de puestos distintos que tuvo la entidad entre 2020 y hoy. Por ejemplo, en ${esc(ent)} en ${anios[max[0]]}: ${n(mc.nuevos)} ÷ ${n(mc.puestos)} = ${n1(max[2])}.</p>
        <p><b>Cómo leerlo:</b> 0,5 equivale a que se renovó la mitad de los puestos. <b>Puede pasar de 1</b> porque se cuentan designaciones, no puestos: si una dirección tuvo tres titulares en el año, suma 3. Un valor mayor a 1 indica que varios puestos cambiaron más de una vez en el mismo año.</p>
        <p class="nota">Se muestran las 20 entidades con más periodos. Respeta los filtros de nivel y gobierno. *2026 llega hasta el corte, así que todavía está incompleto.</p>`;
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
    const bal = new Map(), llegan = new Map(), salen = new Map();
    ix.forEach((k) => {
      bal.set(M.b[k], (bal.get(M.b[k]) || 0) + 1); bal.set(M.a[k], (bal.get(M.a[k]) || 0) - 1);
      llegan.set(M.b[k], (llegan.get(M.b[k]) || 0) + 1); salen.set(M.a[k], (salen.get(M.a[k]) || 0) + 1);
    });
    const ll = (e) => llegan.get(e) || 0, sa = (e) => salen.get(e) || 0;
    let bl = [...bal.entries()].filter(([e]) => todasEnt() || estado.ent.has(e)).sort((a, b) => b[1] - a[1]);
    bl = [...bl.slice(0, 10), ...bl.slice(-10)].filter((x, i, arr) => arr.findIndex((y) => y[0] === x[0]) === i && x[1] !== 0);
    $("#ley2-balance").innerHTML = `<span><i style="background:${t.categorias[2]}"></i>Gana gente (llegan más de los que se van)</span><span><i style="background:${t.categorias[1]}"></i>Pierde gente (se van más de los que llegan)</span>`;
    if (!bl.length) { Obs.vacio("g2-balance"); $("#def2-balance").innerHTML = ""; }
    else {
      const [eA, vA] = bl[0];
      $("#def2-balance").innerHTML = `<p><b>Qué mide:</b> si una entidad atrae o pierde funcionarios frente al resto del Estado.</p>
        <p><b>Cómo se calcula:</b> personas que llegaron desde otra entidad − personas que se fueron a otra entidad. Solo cuentan los cambios de entidad (el siguiente cargo empieza hasta un año después); los ascensos dentro de la misma entidad no entran. Por ejemplo, a ${esc(nombreEnt(eA))} llegaron ${n(ll(eA))} y se fueron ${n(sa(eA))}: saldo ${vA > 0 ? "+" : ""}${n(vA)}.</p>
        <p><b>Cómo leerlo:</b> el saldo no quiere decir que la entidad crezca o tenga más puestos. Los puestos se llenan también con gente que entra al Estado por primera vez, y quienes se van pueden salir del Estado; esos casos no están en este gráfico. El saldo solo compara el intercambio con otras entidades. Positivo: la entidad recluta más funcionarios de otras entidades de los que les cede. Negativo: es "cantera" de otras, porque cede más de los que recibe. Un saldo cercano a 0 puede esconder mucho movimiento en ambos sentidos: pasa el mouse para ver cuántos llegan y cuántos se van.</p>
        <p class="nota">Se muestran las 10 entidades con mayor saldo positivo y las 10 con mayor saldo negativo.</p>`;
      const g = Obs.grafico("g2-balance");
      document.getElementById("g2-balance").style.height = `${Math.max(300, bl.length * 28 + 40)}px`; g.resize();
      g.setOption({
        textStyle: { fontFamily: t.fuente },
        tooltip: { ...Obs.tooltipBase(), trigger: "axis", axisPointer: { type: "shadow" }, formatter: (ps) => { const e = bl[ps[0].dataIndex][0], v = ps[0].value;
          return `<strong>${esc(ps[0].name)}</strong><br>Llegaron desde otras entidades: ${n(ll(e))}<br>Se fueron a otras entidades: ${n(sa(e))}<br>Saldo: <strong>${v > 0 ? "+" : ""}${n(v)}</strong> (${v > 0 ? "gana" : "pierde"} ${n(Math.abs(v))} personas)`; } },
        grid: { left: 150, right: 50, top: 10, bottom: 10 },
        xAxis: { type: "value", splitLine: { lineStyle: { color: t.linea } }, axisLabel: { fontSize: 14, color: t.textoSuave } },
        yAxis: { type: "category", data: bl.map(([e]) => nombreEnt(e)), inverse: true, axisTick: { show: false }, axisLabel: { fontSize: 14, color: t.texto, width: 140, overflow: "truncate" }, axisLine: { show: false } },
        series: [{ type: "bar", barMaxWidth: 16, data: bl.map(([, v]) => ({ value: v, itemStyle: { color: v > 0 ? t.categorias[2] : t.categorias[1] } })),
          label: { show: true, position: "right", fontSize: 14, fontWeight: 700, color: t.texto, formatter: (p) => (p.value > 0 ? "+" : "") + n(p.value) } }],
      }, true);
      const [eZ, vZ] = bl[bl.length - 1];
      lectura("#lec2-balance", vZ < 0 && vA > 0
        ? `${fuerte(nombreEnt(eA))} es la que más gana: llegaron ${n(ll(eA))} y se fueron ${n(sa(eA))} (${fuerte(`+${n(vA)}`)}). ${fuerte(nombreEnt(eZ))} es la que más pierde: se fueron ${n(sa(eZ))} y llegaron ${n(ll(eZ))} (${fuerte(n(vZ))}).`
        : `${fuerte(nombreEnt(eA))}: llegaron ${n(ll(eA))} y se fueron ${n(sa(eA))} (saldo ${fuerte(`${vA > 0 ? "+" : ""}${n(vA)}`)}).`);
    }

    // matriz
    const tamano = new Map();
    lista.forEach((r) => { tamano.set(r.a, (tamano.get(r.a) || 0) + r.personas); tamano.set(r.b, (tamano.get(r.b) || 0) + r.personas); });
    const ejes = [...tamano.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([e]) => e);
    const celdas = [];
    lista.forEach((r) => { const i = ejes.indexOf(r.a), j = ejes.indexOf(r.b); if (i >= 0 && j >= 0) celdas.push([j, i, r.personas]); });
    if (!celdas.length) { Obs.vacio("g2-matriz"); $("#def2-matriz").innerHTML = ""; lectura("#lec2-matriz", ""); }
    else {
      const top = celdas.reduce((a, c) => (c[2] > a[2] ? c : a));
      const inv = celdas.find((c) => c[0] === top[1] && c[1] === top[0]);
      const nA = nombreEnt(ejes[top[1]]), nB = nombreEnt(ejes[top[0]]);
      $("#def2-matriz").innerHTML = `<p><b>Qué muestra:</b> todas las rutas entre las 15 entidades con más intercambio, no solo las principales del diagrama de flujos.</p>
        <p><b>Cómo se lee:</b> busca la entidad de donde sale la gente en las <b>filas</b> (izquierda) y la entidad a donde llega en las <b>columnas</b> (abajo). La celda donde se cruzan cuenta a las personas que hicieron ese paso. Entre más oscura, más personas. Por ejemplo, la fila ${esc(nA)} con la columna ${esc(nB)}: ${n(top[2])} personas pasaron de ${esc(nA)} a ${esc(nB)}.</p>
        <p><b>Qué buscar:</b> compara una celda con su espejo (fila y columna invertidas) para ver si el intercambio va en los dos sentidos o en uno solo. Una fila oscura indica una entidad que "exporta" a muchas; una columna oscura, una que recibe de muchas.</p>
        <p class="nota">La diagonal queda en blanco porque no cuenta a quienes cambian de cargo dentro de la misma entidad. Las celdas en blanco son rutas sin ningún movimiento.</p>`;
      lectura("#lec2-matriz", `La ruta más transitada es de ${fuerte(nA)} a ${fuerte(nB)}, con ${fuerte(`${n(top[2])} personas`)}. En sentido contrario pasaron ${fuerte(n(inv ? inv[2] : 0))}.`);
      const g = Obs.grafico("g2-matriz");
      g.setOption({
        textStyle: { fontFamily: t.fuente },
        tooltip: { ...Obs.tooltipBase(), formatter: (p) => `Salen de <strong>${esc(nombreEnt(ejes[p.value[1]]))}</strong><br>llegan a <strong>${esc(nombreEnt(ejes[p.value[0]]))}</strong><br>${n(p.value[2])} personas` },
        grid: { left: 120, right: 10, top: 10, bottom: 150 },
        xAxis: { type: "category", data: ejes.map(nombreEnt), axisLabel: { fontSize: 14, rotate: 50, color: t.texto, width: 100, overflow: "truncate", interval: 0 }, axisTick: { show: false }, name: "Llega a (columnas)", nameLocation: "middle", nameGap: 95, nameTextStyle: { fontSize: 14, color: t.textoSuave } },
        yAxis: { type: "category", data: ejes.map(nombreEnt), inverse: true, axisLabel: { fontSize: 14, color: t.texto, width: 110, overflow: "truncate", interval: 0 }, axisTick: { show: false },
          name: "Sale de (filas)", nameLocation: "start", nameGap: 8, nameTextStyle: { fontSize: 14, color: t.textoSuave, align: "right" } },
        visualMap: { min: 0, max: Math.max(...celdas.map((c) => c[2])), calculable: false, orient: "horizontal", left: "center", bottom: 0, itemWidth: 12, itemHeight: 160,
          inRange: { color: t.escala }, text: [`${n(Math.max(...celdas.map((c) => c[2])))} personas`, "1"], textStyle: { fontSize: 14, color: t.textoSuave } },
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
      { t: "Relaciones que se repiten", p: "Parejas que coincidieron en dos o más entidades. En cada una vemos si uno era jefe del otro (firmó su designación, o estaba en la alta dirección o al frente de su área cuando lo designaron), si eran colegas (misma área, nivel parecido) o si solo coincidieron.",
        svg: `${defs}${caja(4, "A")}${caja(134, "B")}${nodo(40, 26, "var(--navy)", 9)}${nodo(40, 48, "var(--azul)", 6)}<path d="M40 35v6" stroke="var(--texto-suave)" stroke-width="2"/>${nodo(158, 36, "var(--navy)", 9)}${nodo(182, 36, "var(--azul)", 9)}${flecha(64, 38, 140, 38)}` },
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
      // detalle: con fechas (mes y año) de cada paso
      const rutaFechas = (p) => p.e.map((e, i) => `${esc(nombreEnt(e))} (${p.f && p.f[i] != null ? fmtFecha(p.f[i]) : "s/f"})`).join(" → ");
      const rutaJefe = (j) => {
        const jp = (S.jp && S.jp[j]) || [];
        return jp.length ? `<p class="etq"><b>Dónde firmó el jefe:</b> ${jp.map(([e, a, b]) => `${esc(nombreEnt(e))}, ${fmtFecha(a)}${b !== a ? ` a ${fmtFecha(b)}` : ""}`).join(" · ")}</p>` : "";
      };
      const sel = estado.detalleRed;
      if (sel && sel.startsWith("J") && porJefe.has(+sel.slice(1))) {
        const j = +sel.slice(1), ps = porJefe.get(j);
        $("#h4-detalle").textContent = S.jefes[j];
        $("#p4-detalle").textContent = `${ps.length} personas lo siguieron`;
        $("#d4-detalle").innerHTML = rutaJefe(j) + `<h4>Quiénes lo siguieron</h4><p class="nota">Entre paréntesis, el mes en que el jefe designó a esa persona en cada entidad.</p><ul>${[...ps].sort((a, b) => (a.f?.[0] ?? 0) - (b.f?.[0] ?? 0)).map((p) => `<li><strong>${esc(p.s)}</strong><br><span class="etq">${rutaFechas(p)}</span></li>`).join("")}</ul>`;
      } else if (sel && sel.startsWith("P")) {
        const nom = sel.slice(1), ps = pares.filter((p) => p.s === nom);
        $("#h4-detalle").textContent = nom;
        $("#p4-detalle").textContent = "Siguió a:";
        $("#d4-detalle").innerHTML = ps.map((p) => `<h4>${esc(S.jefes[p.j])}</h4><p class="etq">Designado/a por este jefe: ${rutaFechas(p)}</p>${rutaJefe(p.j)}`).join("");
      } else { $("#h4-detalle").textContent = "Detalle"; $("#p4-detalle").textContent = "Elige un jefe o una persona en la red."; $("#d4-detalle").innerHTML = ""; }
      $("#h4-tabla").textContent = "Jefes con más seguidores";
      $("#p4-tabla").textContent = "Entidades por las que pasaron sus seguidores.";
      $("#t4-casos").innerHTML = `<table class="tabla"><thead><tr><th>Jefe</th><th class="num">Seguidores</th><th>Entidades</th></tr></thead><tbody>${
        jefes.slice(0, 40).map(([j, ps]) => `<tr class="clic" data-id="J${j}"><td>${esc(S.jefes[j])}</td><td class="num">${n(ps.length)}</td><td>${[...new Set(ps.flatMap((p) => p.e))].slice(0, 6).map((e) => esc(nombreEnt(e))).join(", ")}</td></tr>`).join("")}</tbody></table>`;
    } else if (estado.red === "relaciones") {
      dibujarRelaciones(t, G, entOk);
      return;
    } else {
      $("#h4-azar").textContent = "¿Es casualidad?";
      $("#p4-azar").textContent = "Pares de personas que llegan juntas a una entidad: lo que vemos en los datos frente a 20 simulaciones en las que barajamos las fechas de llegada al azar.";
      $("#ley4-azar").innerHTML = "";
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

  /* relaciones que se repiten: jefe / colega en 2+ entidades */
  const REL_ANTES = { jefe: "Uno era jefe del otro", colega: "Eran colegas", coinciden: "Solo coincidieron" };
  const REL_DESPUES = (a, b) => (b === "colega" ? "Colegas" : b === "coinciden" ? "Solo coinciden"
    : a === "jefe" ? (b === "jefe" ? "El mismo sigue de jefe" : "Se invierten los papeles") : "Uno pasa a mandar al otro");
  const REL_TIPO = (k) => { const [a, b] = k.split(">"); return `${REL_ANTES[a]} → ${REL_DESPUES(a, b).toLowerCase()}`; };
  function dibujarRelaciones(t, G, entOk) {
    const Rl = D.relaciones, TP = Rl.tipos, NOMS = Rl.nombres;
    const veces = (tp) => tp.real / Math.max(tp.azar, 1);
    const pares = Rl.pares.map((p, i) => ({ ...p, i })).filter((p) => estado.gob.has(p.g) && entOk(p.s.map((s) => s[0])));
    const cuenta = TP.map(() => 0); pares.forEach((p) => cuenta[p.k]++);
    const kJJ = TP.findIndex((x) => x.k === "jefe>jefe"), kCJ = TP.findIndex((x) => x.k === "colega>jefe");
    const cerca = pares.filter((p) => p.s.every((s) => s[2] !== "coinciden")).length;
    const filtrado = filtroEntActivo() || estado.gob.size !== G.length;
    const R0 = Rl.resumen;
    Obs.kpi("k4-a", { etiqueta: "El jefe vuelve a mandar al mismo", valor: n(cuenta[kJJ]), pie: `Parejas · ${n1(veces(TP[kJJ]))} veces lo esperado por azar` });
    Obs.kpi("k4-b", { etiqueta: "Colegas que luego son jefe y subordinado", valor: n(cuenta[kCJ]), pie: `Parejas · ${n1(veces(TP[kCJ]))} veces lo esperado por azar` });
    Obs.kpi("k4-c", { etiqueta: "Relación cercana en todas sus entidades", valor: n(cerca), pie: `Jefe o colega en cada una · ${n1(R0.cerca / R0.cerca_azar)} veces el azar` });
    lectura("#r4-resumen", `En ${textoSeleccion()}, ${fuerte(n(cuenta[kJJ]))} parejas repiten la relación de jefe y subordinado en otra entidad, ${fuerte(`${n1(veces(TP[kJJ]))} veces`)} más de lo que daría el azar. Las redes también funcionan como escalera: ${fuerte(n(cuenta[kCJ]))} parejas que fueron colegas pasan a ser jefe y subordinado, casi el doble de lo esperado.`);
    // sankey: relación en la 1.ª entidad → en la 2.ª (sin "solo coincidieron → solo coinciden")
    $("#h4-red").textContent = "¿Cómo cambia la relación de una entidad a la siguiente?";
    $("#p4-red").textContent = "Parejas que coincidieron en dos o más entidades. Izquierda: su relación en la primera; derecha: en la siguiente. En azul, los cambios que pasan claramente más que por azar (1,8 veces o más).";
    const nodosN = new Set(), links = [];
    TP.forEach((tp, i) => {
      if (tp.k === "coinciden>coinciden" || !cuenta[i]) return;
      const [a, b] = tp.k.split(">"), s = `A:${a}`, d = `D:${REL_DESPUES(a, b)}`;
      nodosN.add(s); nodosN.add(d);
      const fuerteT = veces(tp) >= 1.8;
      links.push({ source: s, target: d, value: cuenta[i], k: i, lineStyle: { color: fuerteT ? t.categorias[0] : t.otros, opacity: fuerteT ? 0.55 : 0.3 } });
    });
    const etq = (nm) => (nm.startsWith("A:") ? REL_ANTES[nm.slice(2)] : nm.slice(2));
    if (!links.length) Obs.vacio("g4-red");
    else {
      const g = Obs.grafico("g4-red");
      g.setOption({
        textStyle: { fontFamily: t.fuente },
        tooltip: { ...Obs.tooltipBase(), formatter: (p) => {
          if (p.dataType !== "edge") return `<strong>${esc(etq(p.name))}</strong><br>${n(p.value)} parejas`;
          const tp = TP[p.data.k];
          return `<strong>${esc(etq(p.data.source))} → ${esc(etq(p.data.target).toLowerCase())}</strong><br>${n(p.value)} parejas${filtrado ? " en esta selección" : ""}<br>Todo el Estado: ${n(tp.real)} frente a ${n(Math.round(tp.azar))} al azar (${n1(veces(tp))} veces)`;
        } },
        series: [{ type: "sankey", left: 10, right: 190, top: 10, bottom: 10, nodeWidth: 14, nodeGap: 14, draggable: false, layoutIterations: 0,
          data: [...nodosN].sort((x, y) => (x < y ? -1 : 1)).map((nm) => ({ name: nm, itemStyle: { color: t.navy } })),
          links, emphasis: { focus: "adjacency" },
          label: { fontSize: 14, color: t.texto, formatter: (p) => etq(p.name) } }],
      }, true);
      g.off("click");
      g.on("click", (p) => { if (p.dataType === "edge") cambiar({ detalleRed: `K${p.data.k}` }); });
    }
    $("#ley4-red").innerHTML = `<span><i style="background:${t.categorias[0]}"></i>Pasa claramente más que por azar</span><span><i style="background:${t.otros}"></i>Poco por encima del azar</span>`;
    // detalle
    const paso = (p, s) => {
      const X = esc(NOMS[p.x]), Y = esc(NOMS[p.y]);
      const rel = s[2] === "jefe" ? `${X} era jefe/a de ${Y}` : s[2] === "subord" ? `${Y} era jefe/a de ${X}` : s[2] === "colega" ? "colegas" : "coincidieron";
      return `<li><strong>${esc(nombreEnt(s[0]))}</strong>, ${fmtFecha(s[1])}: ${rel}<br><span class="etq">${esc(s[3] || "—")} / ${esc(s[4] || "—")}</span></li>`;
    };
    const fichaPar = (p) => `<h4>${esc(NOMS[p.x])} y ${esc(NOMS[p.y])}</h4><ul>${p.s.map((s) => paso(p, s)).join("")}</ul>`;
    const sel = estado.detalleRed;
    if (sel && sel.startsWith("K")) {
      const k = +sel.slice(1), lista = pares.filter((p) => p.k === k);
      $("#h4-detalle").textContent = REL_TIPO(TP[k].k);
      $("#p4-detalle").textContent = `${n(lista.length)} parejas. Se muestran hasta 25, primero las que coinciden en más entidades.`;
      $("#d4-detalle").innerHTML = lista.slice(0, 25).map(fichaPar).join("");
    } else if (sel && sel.startsWith("R")) {
      const p = pares.find((x) => x.i === +sel.slice(1));
      $("#h4-detalle").textContent = p ? `${NOMS[p.x]} y ${NOMS[p.y]}` : "Detalle";
      $("#p4-detalle").textContent = p ? REL_TIPO(TP[p.k].k) : "";
      $("#d4-detalle").innerHTML = p ? `<ul>${p.s.map((s) => paso(p, s)).join("")}</ul>` : "";
    } else { $("#h4-detalle").textContent = "Detalle"; $("#p4-detalle").textContent = "Elige un flujo del diagrama o una pareja de la tabla."; $("#d4-detalle").innerHTML = ""; }
    // azar: real frente a azar por tipo de trayectoria (todo el Estado)
    $("#h4-azar").textContent = "¿Es casualidad?";
    $("#p4-azar").textContent = "Parejas de cada tipo en los datos frente al promedio de 20 simulaciones en las que barajamos al azar las fechas de llegada a cada entidad. Todo el Estado; no cambia con los filtros.";
    $("#ley4-azar").innerHTML = `<span><i style="background:${t.categorias[0]}"></i>Datos reales</span><span><i style="background:${t.otros}"></i>Promedio al azar</span>`;
    const ord = TP.map((tp, i) => ({ ...tp, i })).filter((tp) => tp.k !== "coinciden>coinciden").sort((a, b) => veces(b) - veces(a));
    const ga = Obs.grafico("g4-azar");
    document.getElementById("g4-azar").style.height = `${ord.length * 44 + 30}px`; ga.resize();
    ga.setOption({
      textStyle: { fontFamily: t.fuente },
      tooltip: { ...Obs.tooltipBase(), trigger: "axis", axisPointer: { type: "shadow" }, formatter: (ps) => { const tp = ord[ps[0].dataIndex]; return `<strong>${esc(REL_TIPO(tp.k))}</strong><br>Datos: ${n(tp.real)} · Azar: ${n(Math.round(tp.azar))}<br>${n1(veces(tp))} veces lo esperado`; } },
      grid: { left: 330, right: 90, top: 4, bottom: 24 },
      xAxis: { type: "value", axisLabel: { fontSize: 13, color: t.textoSuave, formatter: (v) => n(v) }, splitLine: { lineStyle: { color: t.linea } } },
      yAxis: { type: "category", inverse: true, data: ord.map((tp) => REL_TIPO(tp.k)), axisTick: { show: false }, axisLabel: { fontSize: 13, color: t.texto, width: 320, overflow: "truncate" } },
      series: [
        { name: "Datos reales", type: "bar", barMaxWidth: 14, itemStyle: { color: t.categorias[0] }, data: ord.map((tp) => tp.real),
          label: { show: true, position: "right", fontSize: 13, fontWeight: 700, color: t.texto, formatter: (p) => `${n1(veces(ord[p.dataIndex]))} veces` } },
        { name: "Promedio al azar", type: "bar", barMaxWidth: 14, itemStyle: { color: t.otros }, data: ord.map((tp) => Math.round(tp.azar)) },
      ],
    }, true);
    lectura("#lec4-azar", `Todas las trayectorias superan al azar, pero no por igual: que el jefe vuelva a mandar al mismo pasa ${fuerte(`${n1(veces(TP[kJJ]))} veces`)} más de lo esperado, mientras que "antes jefe, luego colegas" apenas lo supera (${n1(veces(TP[TP.findIndex((x) => x.k === "jefe>colega")]))} veces).`);
    // tabla de parejas
    $("#h4-tabla").textContent = "Parejas que se repiten";
    $("#p4-tabla").textContent = "Primero las que coinciden en más entidades. Clic en una fila para ver su recorrido.";
    const corto = (p, s) => (s[2] === "jefe" ? "jefe" : s[2] === "subord" ? "se invierte" : s[2] === "colega" ? "colegas" : "coinciden");
    $("#t4-casos").innerHTML = `<table class="tabla"><thead><tr><th>Pareja</th><th>Qué pasó</th><th>Recorrido</th></tr></thead><tbody>${
      pares.slice(0, 60).map((p) => `<tr class="clic" data-id="R${p.i}"><td>${esc(NOMS[p.x])}<br>${esc(NOMS[p.y])}</td><td>${esc(REL_TIPO(TP[p.k].k))}</td><td>${p.s.map((s) => `${esc(nombreEnt(s[0]))} (${corto(p, s)})`).join(" → ")}</td></tr>`).join("")}</tbody></table>`;
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
    gantt("g5-gantt", "ley5-gantt", per);
    const hoy = (Date.parse(D.meta.corte) - T0) / DIA;
    $("#t5-periodos").innerHTML = `<table class="tabla"><thead><tr><th>Desde</th><th>Hasta</th><th class="num">Días</th><th>Cargo</th><th>Oficina</th><th>Entidad</th><th>Cómo terminó</th></tr></thead><tbody>${
      per.map((x) => `<tr><td>${fmtFecha(x[3])}</td><td>${x[4] == null ? "Sigue" : fmtFecha(x[4])}</td><td class="num">${n((x[4] ?? hoy) - x[3])}</td><td>${esc(x[1])}</td><td>${esc(x[2])}</td><td>${esc(nombreEnt(x[0]))}</td><td>${esc(D.meta.motivos[x[5]].nombre)}</td></tr>`).join("")}</tbody></table>`;
  }

  // Gantt de los cargos de una persona: per = [[entidad, cargo, oficina, inicio, fin, motivo, ...]] ordenado por inicio
  function gantt(id, idLey, per, etiquetaExtra = () => "", sinFin = () => false) {
    const t = Obs.tema();
    const entsOrden = [...new Set(per.map((x) => x[0]))];
    // trayectoria: más entidades que colores categóricos; después de los 5 se usan otros colores de la marca
    const css = getComputedStyle(document.documentElement);
    const paleta = [...t.categorias, ...["--rosa", "--verde", "--azul-claro", "--rojo", "--navy"].map((v) => css.getPropertyValue(v).trim())];
    const colorE = (e) => paleta[entsOrden.indexOf(e)] ?? t.otros;
    const hoy = (Date.parse(D.meta.corte) - T0) / DIA;
    const filas = per.map((x) => `${x[1]}${etiquetaExtra(x)} · ${nombreEnt(x[0])}`);
    const el = document.getElementById(id);
    el.style.height = `${Math.max(220, per.length * 36 + 70)}px`;
    const g = Obs.grafico(id); g.resize();
    g.setOption({
      textStyle: { fontFamily: t.fuente },
      tooltip: { ...Obs.tooltipBase(), formatter: (p) => { const x = per[p.value[0]]; return `<strong>${esc(x[1])}</strong><br>${esc(ENT()[x[0]].nombre)}${x[2] ? `<br>${esc(x[2])}` : ""}<br>` +
        (sinFin(x) ? `Encargo desde ${fmtFecha(x[3])}; no se publicó cuándo terminó` : `${fmtFecha(x[3])} – ${x[4] == null ? "sigue" : fmtFecha(x[4])} (${n((x[4] ?? hoy) - x[3])} días)<br>${esc(D.meta.motivos[x[5]].nombre)}`); } },
      grid: { left: Math.min(300, el.clientWidth * 0.4), right: 20, top: 10, bottom: 40 },
      xAxis: { type: "time", min: T0, max: T0 + hoy * DIA, axisLabel: { fontSize: 14, color: t.textoSuave }, splitLine: { lineStyle: { color: t.linea } } },
      yAxis: { type: "category", data: filas, inverse: true, axisTick: { show: false }, axisLabel: { fontSize: 14, color: t.texto, width: Math.min(290, el.clientWidth * 0.4 - 10), overflow: "truncate" } },
      series: [{ type: "custom", encode: { x: [1, 2], y: 0 },
        data: per.map((x, i) => ({ value: [i, T0 + x[3] * DIA, T0 + (sinFin(x) ? Math.min(x[3] + 30, hoy) : x[4] ?? hoy) * DIA],
          itemStyle: { color: colorE(x[0]), opacity: sinFin(x) ? 0.55 : 1 } })),
        renderItem: (params, api) => {
          const y = api.value(0), a = api.coord([api.value(1), y]), b = api.coord([api.value(2), y]);
          const h = api.size([0, 1])[1] * 0.6;
          return { type: "rect", shape: { x: a[0], y: a[1] - h / 2, width: Math.max(3, b[0] - a[0]), height: h, r: 2 }, style: api.style() };
        } }],
    }, true);
    $(`#${idLey}`).innerHTML = entsOrden.map((e) => `<span><i style="background:${colorE(e)}"></i>${esc(nombreEnt(e))}</span>`).join("");
  }

  /* ================================================ 5b. Cargos paralelos (sin pestaña por ahora: falta corregir; datos en paralelos.json) */
  const PAR = {
    adicion: { nombre: "«En adición a sus funciones»", seguro: true,
      def: "La resolución dice que la persona asume el nuevo cargo «en adición a sus funciones»: conserva el que tenía." },
    encargo: { nombre: "Encargo junto a otro cargo", seguro: true,
      def: "Uno de los dos es una encargatura: un encargo temporal que se suele asumir sin dejar el cargo propio." },
    colegiado: { nombre: "Directorio o consejo junto a otro cargo", seguro: true,
      def: "Uno de los dos es un puesto en un directorio, consejo o tribunal, que por su naturaleza se ocupa junto con otro cargo." },
    asesor: { nombre: "Asesoría junto a otro cargo", seguro: false,
      def: "Uno de los dos es una asesoría. Se puede ser asesor y tener otro cargo a la vez, pero también puede que no se haya publicado el fin de la asesoría." },
    otro: { nombre: "Dos cargos sin cese publicado", seguro: false,
      def: "Ninguna de las marcas anteriores. Lo más probable es que no se haya publicado el fin del primer cargo, así que es un cruce posible, no confirmado." },
  };
  function dibujarParalelos() {
    const t = Obs.tema(), Pa = D.paralelos, TT = Pa.tipos;
    const colSeg = t.unica, colPos = t.otros;
    const colorTipo = (k) => (PAR[TT[k]].seguro ? colSeg : colPos);
    const pares = Pa.pares.filter((p) => estado.gob.has(p[9]) && (!filtroEntActivo() || pasaEnt(p[2]) || pasaEnt(p[4])));
    // por persona: tipos, cruces, si alguno está respaldado
    const porP = new Map();
    pares.forEach((p) => { if (!porP.has(p[0])) porP.set(p[0], []); porP.get(p[0]).push(p); });
    const esSeg = (ps) => ps.some((p) => PAR[TT[p[1]]].seguro);
    const nSeg = [...porP.values()].filter(esSeg).length, nPos = porP.size - nSeg;
    const ds = pares.filter((p) => PAR[TT[p[1]]].seguro && p[8] != null).map((p) => p[8]).sort((a, b) => a - b);
    const medD = ds.length ? ds[Math.floor(ds.length / 2)] : null;
    Obs.kpi("k7-seguros", { etiqueta: "Personas con cargos paralelos respaldados", valor: n(nSeg), pie: "«En adición», encargos, directorios y consejos" });
    Obs.kpi("k7-posibles", { etiqueta: "Personas con cruces posibles", valor: n(nPos), pie: "Asesorías y cargos sin cese publicado" });
    Obs.kpi("k7-dias", { etiqueta: "Duración típica del cruce respaldado", valor: medD == null ? "—" : `${n(medD)} días`, pie: "Mediana; los que siguen, hasta el corte; sin los encargos sin fin publicado" });
    lectura("#r7-resumen", porP.size
      ? `En ${textoSeleccion()}, ${fuerte(n(porP.size))} personas tuvieron dos cargos que se cruzan al menos 30 días. En ${fuerte(n(nSeg))} el cruce lo respalda la norma («en adición a sus funciones») o el tipo de cargo (un encargo, un directorio o un consejo). En las otras ${n(nPos)} es posible, pero puede deberse a que no se publicó el fin del primer cargo.`
      : "No hay cargos paralelos para esta selección.");

    // tipos
    const items = TT.map((k, i) => ({ clave: i, etiqueta: PAR[k].nombre, valor: new Set(pares.filter((p) => p[1] === i).map((p) => p[0])).size, color: colorTipo(i),
      n: pares.filter((p) => p[1] === i).length }));
    Obs.barras("g7-tipo", items, { ordenar: false, nombre: "Personas", detalle: (d) => `${n(d.n)} cruces`,
      seleccion: estado.parTipo == null ? null : new Set([estado.parTipo]), alClic: (k) => cambiar({ parTipo: estado.parTipo === k ? null : k, parPersona: null }) });
    $("#ley7-tipo").innerHTML = `<span><i style="background:${colSeg}"></i>Respaldado por la norma o el tipo de cargo</span><span><i style="background:${colPos}"></i>Posible (puede faltar el cese)</span>`;
    $("#def7-tipo").innerHTML = estado.parTipo == null
      ? `<strong>Cargo paralelo:</strong> la misma persona en dos puestos distintos cuyos periodos se cruzan al menos 30 días. Cada cruce se clasifica por lo que lo respalda, en el orden de las barras. Clic en una barra para ver su definición.`
      : `<strong>${esc(PAR[TT[estado.parTipo]].nombre)}:</strong> ${esc(PAR[TT[estado.parTipo]].def)}`;
    const top = items.filter((d) => d.valor).sort((a, b) => b.valor - a.valor)[0];
    lectura("#lec7-tipo", top ? `El tipo más frecuente es ${fuerte(top.etiqueta.toLowerCase())}: ${fuerte(n(top.valor))} personas. Una persona puede tener cruces de más de un tipo.` : "");

    // por año: personas que empezaron un cargo paralelo (respaldado tiene prioridad)
    const anios = [...new Set(Pa.pares.map((p) => anioDe(p[6])))].sort();
    const seg = anios.map(() => new Set()), pos = anios.map(() => new Set());
    pares.forEach((p) => { const i = anios.indexOf(anioDe(p[6])); (PAR[TT[p[1]]].seguro ? seg : pos)[i].add(p[0]); });
    pos.forEach((s, i) => seg[i].forEach((x) => s.delete(x)));
    const g = Obs.grafico("g7-anio");
    g.setOption({
      textStyle: { fontFamily: t.fuente }, tooltip: { ...Obs.tooltipBase(), trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: "rgba(4,35,85,.05)" } } },
      grid: { left: 52, right: 12, top: 28, bottom: 30 },
      xAxis: { type: "category", data: anios.map(String), axisTick: { show: false }, axisLine: { lineStyle: { color: t.linea } }, axisLabel: { fontSize: 14, color: t.textoSuave } },
      yAxis: { type: "value", splitLine: { lineStyle: { color: t.linea } }, axisLabel: { fontSize: 14, color: t.textoSuave } },
      series: [
        { name: "Respaldado", type: "bar", stack: "a", barCategoryGap: "22%", data: seg.map((s) => s.size), itemStyle: { color: colSeg } },
        { name: "Posible", type: "bar", stack: "a", data: pos.map((s) => s.size), itemStyle: { color: colPos, borderRadius: [2, 2, 0, 0] },
          label: { show: true, position: "top", fontSize: 14, fontWeight: 700, color: t.texto, formatter: (p) => n(seg[p.dataIndex].size + p.value) } },
      ],
    }, true);
    $("#ley7-anio").innerHTML = $("#ley7-tipo").innerHTML;
    const ult = anios.length - 1;
    lectura("#lec7-anio", anios.length ? `${anios[ult]} va con ${fuerte(n(seg[ult].size + pos[ult].size))} personas al ${esc(fmtCorte(D.meta.corte))}. Los cruces recientes pesan más porque los cargos que siguen abiertos todavía no tienen salida publicada.` : "");

    // entidades
    const porE = new Map();
    pares.forEach((p) => [p[2], p[4]].forEach((e) => { if (!pasaEnt(e)) return; if (!porE.has(e)) porE.set(e, { s: new Set(), seg: new Set() }); porE.get(e).s.add(p[0]); if (PAR[TT[p[1]]].seguro) porE.get(e).seg.add(p[0]); }));
    const ents = [...porE].map(([e, v]) => ({ clave: e, etiqueta: nombreEnt(e), valor: v.s.size, seg: v.seg.size }));
    Obs.barras("g7-ent", ents, { limite: 15, nombre: "Personas", detalle: (d) => `${n(d.seg)} con cruce respaldado`,
      seleccion: todasEnt() ? null : estado.ent, alClic: (e) => cambiar({ ent: new Set([e]) }) });
    const e0 = [...ents].sort((a, b) => b.valor - a.valor)[0];
    lectura("#lec7-ent", e0 ? `${fuerte(esc(e0.etiqueta))} encabeza la lista con ${fuerte(n(e0.valor))} personas; en ${n(e0.seg)} el cruce está respaldado.` : "");

    // tabla de personas
    let filas = [...porP].filter(([, ps]) => estado.parTipo == null || ps.some((x) => x[1] === estado.parTipo))
      .map(([p, ps]) => ({ p, ps, sim: Pa.sim[p] ?? 2, seg: esSeg(ps), ents: new Set(ps.flatMap((x) => [x[2], x[4]])).size }))
      .sort((a, b) => b.seg - a.seg || b.sim - a.sim || b.ps.length - a.ps.length);
    $("#p7-tabla").textContent = `${n(filas.length)} personas${estado.parTipo == null ? "" : ` con «${PAR[TT[estado.parTipo]].nombre.toLowerCase()}»`}. Primero las de cruce respaldado. Clic en una persona para ver sus cargos en el tiempo.`;
    $("#l7-personas").innerHTML = filas.slice(0, 3000).map((f) => `<option value="${esc(D.personas[f.p])}">`).join("");
    if (estado.parPersona == null || !Pa.per[estado.parPersona]) estado.parPersona = filas[0]?.p ?? null;
    $("#t7-personas").innerHTML = filas.length ? `<table class="tabla"><thead><tr><th>Persona</th><th class="num">Cargos a la vez</th><th class="num">Cruces</th><th>Tipo</th><th>Entidades</th></tr></thead><tbody>${
      filas.slice(0, 50).map((f) => `<tr data-p="${f.p}" class="${f.p === estado.parPersona ? "elegida" : ""}" style="cursor:pointer"><td>${esc(D.personas[f.p])}</td><td class="num">${f.sim}</td><td class="num">${f.ps.length}</td><td>${esc([...new Set(f.ps.map((x) => PAR[TT[x[1]]].nombre))].join("; "))}</td><td>${esc([...new Set(f.ps.flatMap((x) => [x[2], x[4]]))].map(nombreEnt).join(", "))}</td></tr>`).join("")}</tbody></table>` +
      (filas.length > 50 ? `<p class="pista">Se muestran 50 de ${n(filas.length)}. Usa el buscador para ver a otra persona.</p>` : "") : "";
    $("#t7-personas").onclick = (e) => { const tr = e.target.closest("tr[data-p]"); if (tr) cambiar({ parPersona: +tr.dataset.p }); };

    // gantt y cruces de la persona elegida
    const p = estado.parPersona;
    if (p == null) { Obs.vacio("g7-gantt"); $("#h7-persona").textContent = ""; $("#t7-cruces").innerHTML = ""; $("#ley7-gantt").innerHTML = ""; return; }
    const per = Pa.per[p];
    const marca = (x) => (x[7] ? " (en adición)" : x[8] ? " (encargo)" : x[9] ? " (directorio/consejo)" : "");
    $("#h7-persona").innerHTML = `${esc(D.personas[p])} <small>· ${per.length} cargos desde 2020</small>`;
    gantt("g7-gantt", "ley7-gantt", per, marca, (x) => x[11] === 1);
    const cr = Pa.pares.filter((x) => x[0] === p);
    $("#t7-cruces").innerHTML = `<table class="tabla"><thead><tr><th>Primer cargo</th><th>Segundo cargo</th><th>Desde</th><th>Hasta</th><th class="num">Días</th><th>Tipo</th></tr></thead><tbody>${
      cr.map((x) => `<tr><td>${esc(x[3])} · ${esc(nombreEnt(x[2]))}</td><td>${esc(x[5])} · ${esc(nombreEnt(x[4]))}</td><td>${fmtFecha(x[6])}</td><td>${x[8] == null ? "Sin fin publicado" : x[7] == null ? "Sigue" : fmtFecha(x[7])}</td><td class="num">${x[8] == null ? "—" : n(x[8])}</td><td>${esc(PAR[TT[x[1]]].nombre)}${x[12] > 1 ? ` (${x[12]} veces)` : ""}</td></tr>`).join("")}</tbody></table>` +
      (cr.some((x) => x[8] == null) ? `<p class="pista">«Sin fin publicado»: el encargo dice que dura «en tanto dure la ausencia del titular» u otra fórmula parecida y no se publicó cuándo terminó. En el gráfico se dibuja como una marca corta.</p>` : "");
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
    const A = ["meta", "periodos", "movimientos", "trayectorias", "seguimiento", "cotraslado", "relaciones", "oci"];
    const corte = esc(fmtCorte(D.meta.corte));
    $("#metodo-texto").innerHTML = `
      <nav class="indice" aria-label="Contenido de la metodología">
        <a href="#m-que">Qué medimos</a><a href="#m-fuente">Fuente</a><a href="#m-eventos">Eventos</a><a href="#m-dedup">Duplicados</a>
        <a href="#m-estandar">Estandarización</a><a href="#m-periodos">Periodos</a><a href="#m-medidas">Medidas</a>
        <a href="#m-mecanismos">Mecanismos</a><a href="#m-redes">Redes</a><a href="#m-oci">OCI</a><a href="#m-limites">Límites</a>
        <a href="#m-glosario">Glosario</a><a href="#descargas">Descargas</a>
      </nav>

      <h2 id="m-que">¿Qué medimos?</h2>
      <p>Cada vez que el Estado nombra a un directivo de confianza (un director, un jefe de oficina, un asesor) o le pone fin a su cargo, publica una resolución en el diario oficial <em>El Peruano</em>. Leímos esas resoluciones desde el 1 de enero de 2020 hasta el ${corte} y armamos, para cada persona, la lista de cargos que ocupó, cuándo empezó y cuándo terminó. Con eso medimos cuánto duran las personas en sus cargos, entre qué entidades se mueven y si se mueven solas o en grupo.</p>

      <h2 id="m-fuente">Fuente</h2>
      <p>Resoluciones publicadas en <em>El Peruano</em> desde el 01/01/2020: el buscador de normas, la página de designaciones y los PDF del diario. Los artículos que el extractor no pudo leer los procesaron agentes de IA con un validador automático que exige que el nombre y el cargo aparezcan literalmente en la norma. Lo que el validador rechaza en dos pasadas pasa a revisión humana.</p>

      <h2 id="m-eventos">De la resolución al evento</h2>
      <p>Una resolución puede traer varias decisiones: por ejemplo, el artículo 1 da por concluida la designación de una persona y el artículo 2 designa a otra en el mismo cargo. Cada decisión sobre una persona es un <strong>evento</strong>, y cada evento tiene un tipo de acción:</p>
      <table class="tabla"><thead><tr><th>Tipo de acción</th><th>Qué dice la norma</th><th>Qué hace con el periodo</th></tr></thead><tbody>
        <tr><td>Designación</td><td>"Designar a…", "nombrar a…" en un cargo de confianza</td><td>Abre un periodo</td></tr>
        <tr><td>Encargatura</td><td>"Encargar las funciones de…" mientras no hay titular</td><td>Abre un periodo temporal (no cuenta para las duraciones)</td></tr>
        <tr><td>Ratificación</td><td>Confirma en el cargo a quien ya estaba</td><td>Abre o continúa un periodo</td></tr>
        <tr><td>Cese de designación</td><td>"Dar por concluida la designación de…"</td><td>Cierra el periodo</td></tr>
        <tr><td>Renuncia</td><td>"Aceptar la renuncia de…"</td><td>Cierra el periodo</td></tr>
        <tr><td>Cese de encargatura</td><td>"Dar por concluido el encargo de…"</td><td>Cierra el periodo temporal</td></tr>
      </tbody></table>

      <h2 id="m-dedup">Cómo evitamos contar dos veces</h2>
      <p>La misma norma puede llegar por varias fuentes (buscador, página de designaciones, PDF). Al juntar los datos, dos filas son el mismo evento si coinciden en <strong>resolución + persona + tipo de acción + puesto + entidad</strong>. Se usan los cinco elementos para no perder a quien, en una misma norma, deja un cargo y es designado en otro, o a quien es designado en dos puestos a la vez (por ejemplo, un coordinador en tres unidades territoriales).</p>

      <h2 id="m-estandar">Estandarización</h2>
      <p>Se unificaron entidades, cargos (nivel J1 a J7), oficinas (familia funcional) y personas (las variantes de un mismo nombre cuentan como una persona; nunca se unen dos DNI distintos).</p>
      <dl>
        <dt>Entidad</dt><dd>Las distintas formas de escribir una institución se agrupan en una sola entidad, con su sigla y su tipo (ministerio, organismo adscrito, organismo autónomo, programa, gobierno regional, municipalidad). Los organismos adscritos cuentan aparte de su ministerio.</dd>
        <dt>Cargo</dt><dd>Se separa el puesto de la oficina ("Director de la Oficina de Administración" pasa a cargo "Director" y oficina "Oficina de Administración") y se unifican género y categorías. Cada cargo recibe un nivel: J1 ministro, J2 viceministro, J3 secretario general o jefe de entidad, J4 director general, J5 asesor, J6 jefe de unidad o director, J7 subunidad.</dd>
        <dt>Oficina</dt><dd>Se agrupan las escrituras de una misma oficina dentro de cada entidad y se le asigna una familia funcional (administración, asesoría jurídica, planeamiento, recursos humanos, comunicaciones, órganos de línea…), para poder comparar oficinas entre entidades.</dd>
        <dt>Persona</dt><dd>Cada persona tiene un código estable. Se unen variantes por tildes, orden, segundo nombre o tipeo; si dos registros tienen DNI distinto, nunca se unen.</dd>
        <dt>Puesto</dt><dd>Entidad + oficina + cargo (+ lugar, cuando es una sede desconcentrada).</dd>
      </dl>

      <h2 id="m-periodos">Periodos en el cargo</h2>
      <p>Un periodo empieza con una designación o un encargo y termina con un cese, una renuncia, la designación de un sucesor en el mismo puesto o la designación de la persona en otro cargo. Los que siguen abiertos al corte se tratan como censurados. En detalle:</p>
      <ol>
        <li><strong>Cese o renuncia publicados</strong>: se busca la salida de esa persona en ese mismo puesto; si la oficina está escrita distinto, se acepta la más parecida dentro de la misma entidad.</li>
        <li><strong>Llegó un reemplazo</strong>: si no se publicó la salida, el periodo se cierra cuando otra persona es designada en el mismo puesto. Solo vale para puestos de un único ocupante.</li>
        <li><strong>Pasó a otro cargo</strong>: si la persona es designada en otro puesto, el periodo anterior se cierra ahí (solo si eso ocurre al menos 30 días antes que la otra salida posible). No cierran el cargo anterior las designaciones «en adición a sus funciones», los encargos, los puestos en directorios, consejos o tribunales ni las asesorías, porque se pueden tener junto con otro cargo. Una asesoría solo se cierra así cuando la persona pasa a un cargo directivo titular.</li>
        <li><strong>Sigue en el cargo</strong>: si nada de lo anterior ocurre, el periodo queda abierto al ${corte}.</li>
      </ol>
      <p>Dos periodos seguidos de la misma persona en el mismo puesto, separados por 15 días o menos, se unen en uno. Las encargaturas no cuentan para las duraciones.</p>
      <p><strong>Fechas.</strong> Se usa la fecha de efectividad ("a partir del…") cuando la norma la indica; si no, la de publicación.</p>

      <h2 id="m-medidas">Cómo medimos la rotación</h2>
      <dl>
        <dt>"La mitad dura X días"</dt><dd>Es la mediana de permanencia en el cargo. Como muchos siguen en su puesto, no sabemos aún cuánto durarán; el método de Kaplan-Meier los cuenta mientras siguen, sin inventarles una salida. Solo entran puestos de un único ocupante, con la designación observada desde 2020.</dd>
        <dt>% que sale antes de 6 meses</dt><dd>Periodos que terminaron antes de 183 días, sobre el total de periodos de la selección.</dd>
        <dt>Personas por puesto</dt><dd>Cuántas personas distintas ocuparon el mismo puesto en la selección.</dd>
        <dt>Designaciones por puesto (mapa de calor)</dt><dd>Designaciones de un año divididas entre todos los puestos de la entidad desde 2020.</dd>
        <dt>Cambio de entidad</dt><dd>Una persona deja un cargo en una entidad y, en menos de un año, asume otro en una entidad distinta.</dd>
        <dt>Cómo termina un periodo</dt><dd>Renunció, le dieron por concluida la designación, llegó un reemplazo, pasó a otro cargo o sigue en el cargo.</dd>
      </dl>

      <h2 id="m-mecanismos">Cómo funcionan las rotaciones</h2>
      <dl>
        <dt>Llega un nuevo ministro</dt><dd>El buscador de El Peruano no devuelve todos los nombramientos de ministros de 2023 y 2025, así que la llegada de cada ministro se reconstruye con la primera resolución que firma como ministro (con al menos 3 firmadas). Luego se cuentan las designaciones en cada tipo de oficina en los 60 días siguientes y se comparan con el ritmo normal de esa oficina: "2 veces" quiere decir el doble de lo habitual. Los ministros no se muestran en el tablero: esa información se analiza aparte.</dd>
        <dt>Cambio de secretario general</dt><dd>Porcentaje de llegadas de ministros tras las que se designa un nuevo secretario general en 30 y en 90 días.</dd>
        <dt>Ritmo de los primeros días</dt><dd>Designaciones por día en los primeros N días de cada gobierno, donde N es lo que lleva el gobierno actual.</dd>
        <dt>¿Ya estaban en el Estado?</dt><dd>Personas designadas en un gobierno que ya habían tenido un cargo antes en la base.</dd>
      </dl>

      <h2 id="m-redes">Análisis de redes</h2>
      <p>El firmante se extrae del cierre de cada norma ("Regístrese, comuníquese y publíquese"). Con él y con los periodos se arman tres redes:</p>
      <dl>
        <dt>Seguimiento al jefe</dt><dd>Un jefe que firmó al menos 3 resoluciones en dos entidades distintas y designó a la misma persona en ambas: esa persona "lo siguió". El mínimo de 3 firmas evita confundir una firma suelta (por ejemplo, un encargo de un día) con un cambio real de entidad.</dd>
        <dt>Grupos que se mudan juntos (co-traslado)</dt><dd>Dos personas que coincidieron en la entidad A (sus periodos se cruzan en el tiempo) y llegan a la misma entidad B con menos de 180 días de diferencia forman un par. Las llegadas a una ruta A → B se cortan en "olas" cuando pasan más de 90 días sin llegadas. Si 3 o más personas quedan unidas dentro de una misma ola, es un <strong>episodio</strong>. Para saber si el jefe también vino, se revisa si quien firma las designaciones en B tuvo un cargo en A.</dd>
        <dt>Relaciones que se repiten</dt><dd>Parejas de personas cuyos periodos se cruzaron al menos 30 días en dos o más entidades. En cada entidad se anota la relación más cercana que tuvieron:
          <strong>jefe y subordinado</strong>, si uno firmó la designación del otro o, cuando la firma no se pudo leer, si uno era titular de la alta dirección (ministro, viceministro, secretario general o titular de la entidad) o titular de un nivel superior en la misma área cuando designaron al otro (los asesores no cuentan como jefes);
          <strong>colegas</strong>, si estaban en la misma área (el mismo programa, la misma familia de oficinas como administración o planeamiento, o el mismo órgano de línea) con a lo más un nivel de diferencia; o
          <strong>solo coincidieron</strong>. Luego se compara la relación en la primera entidad con la de la siguiente (por ejemplo, colegas que pasan a ser jefe y subordinado). "Jefe" es una inferencia: estar en la alta dirección cuando designan a alguien no prueba que esa persona lo haya elegido.</dd>
        <dt>¿Es casualidad?</dt><dd>El azar del co-traslado y de las relaciones se calcula barajando 20 veces las fechas de llegada a cada entidad y contando cuántos pares saldrían. Si los datos reales tienen muchos más pares que las simulaciones, los grupos se mueven a propósito.</dd>
      </dl>

      <h2 id="m-oci">Órganos de Control Institucional (OCI)</h2>
      <p>Los jefes de OCI los designa la Contraloría, no la entidad, y se analizan en su propia pestaña. La sede de cada OCI se saca del texto de la norma: sin ella, cientos de OCI distintos quedarían como un solo puesto y parecería que se reemplazan entre sí.</p>

      <h2>Qué no incluye</h2>
      <p>Los ministros (se analizan aparte), el Poder Judicial, el Ministerio Público, los representantes ante comisiones, consejos y grupos de trabajo, los responsables de transparencia, los fedatarios, los prefectos y subprefectos, y el servicio exterior (embajadores, cónsules, incluidos los honorarios, agregados y representantes permanentes). Los diplomáticos de carrera que ocupan cargos en la Cancillería, como viceministro, secretario general o director, sí se incluyen. Los directorios y consejos directivos sí se incluyen. Tampoco hay contratos CAS ni locadores: solo lo que se publica en El Peruano.</p>

      <h2 id="m-limites">Limitaciones</h2>
      <ul>
        <li>Los ceses de personas designadas antes de 2020 no tienen fecha de inicio y quedan fuera de las duraciones.</li>
        <li>Los cargos de asesor y miembro de directorio no tienen un único ocupante y no entran en la regla de sucesión.</li>
        <li>Los nombres se unifican con reglas: puede haber dos personas unidas por error o una persona separada en dos.</li>
        <li>Cuando no se publica el cese, la salida se infiere por la llegada de un reemplazo o por un nuevo cargo de la misma persona.</li>
        <li>Es una primera pasada: los números pueden moverse a medida que se depure la base.</li>
      </ul>

      <h2 id="m-glosario">Glosario</h2>
      <dl>
        <dt>Designación</dt><dd>Nombramiento en un cargo de confianza, que se puede terminar en cualquier momento.</dd>
        <dt>Encargatura</dt><dd>Asignación temporal de funciones mientras el puesto no tiene titular.</dd>
        <dt>Cese o conclusión</dt><dd>La entidad le pone fin a la designación.</dd>
        <dt>Renuncia</dt><dd>La persona deja el cargo y la entidad acepta su renuncia.</dd>
        <dt>Titular</dt><dd>Quien ocupa un puesto de un solo ocupante (un director, un jefe de oficina).</dd>
        <dt>Periodo censurado</dt><dd>Un periodo que sigue abierto al corte: sabemos que duró al menos hasta hoy, pero no cuánto más.</dd>
        <dt>Firmante</dt><dd>Quien firma la resolución (ministro, jefe o gerente de la entidad).</dd>
        <dt>Episodio</dt><dd>Grupo de 3 o más personas que salen de la misma entidad y llegan juntas a otra.</dd>
        <dt>OCI</dt><dd>Órgano de Control Institucional: la oficina de la Contraloría dentro de cada entidad.</dd>
      </dl>

      <h2 id="descargas">Descargar datos</h2>
      <p class="descargas">${A.map((a) => `<a href="datos/${a}.json" download>${a}.json</a>`).join("")}</p>`;
    // el índice desplaza la página sin cambiar el #hash (el hash guarda la pestaña)
    $("#metodo-texto .indice").onclick = (e) => {
      const a = e.target.closest("a[href^='#']");
      if (!a) return;
      e.preventDefault();
      document.getElementById(a.getAttribute("href").slice(1))?.scrollIntoView({ behavior: "smooth" });
    };
  }
})();
