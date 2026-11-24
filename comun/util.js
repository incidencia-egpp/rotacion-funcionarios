/* =========================================================
   comun/util.js — formato de números y escape de texto
   (graficos.js y filtros.js usan Obs.fmtN y Obs.escapar; si el
   Observatorio ya tiene su propio util, reemplaza este archivo)
   ========================================================= */
window.Obs = window.Obs || {};
(() => {
  const Obs = window.Obs;
  const nf = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  Obs.fmtN = (v) => (v == null || Number.isNaN(v) ? "—" : nf.format(v));
  Obs.fmt1 = (v) => (v == null || Number.isNaN(v) ? "—" : nf1.format(v));
  Obs.fmtPct = (v) => (v == null || Number.isNaN(v) ? "—" : `${nf1.format(v)}%`);
  Obs.escapar = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // true si el color es oscuro (texto blanco encima)
  Obs.colorOscuro = (hex) => {
    if (!hex || !hex.startsWith("#")) return true;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.55;
  };
})();
