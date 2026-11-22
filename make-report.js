// result.json -> informe HTML autónomo (report/index.html). Uso: node make-report.js result.json report [titulo]
// Si la herramienta ya generó su propio informe (report/index.html: JMeter, Newman), no hace nada.
// Es público (GitHub Pages): todo pasa por sanitize.js (sin claves, tokens, contraseñas, emails ni ids de usuario).
const fs = require("fs");
const path = require("path");
const { redact, cleanEvidence, maskIds } = require("./sanitize");

const [, , input, outDir = "report", title] = process.argv;
if (!input || !fs.existsSync(input)) { console.error(`No existe ${input}`); process.exit(0); }
if (fs.existsSync(path.join(outDir, "index.html"))) { console.log("Informe nativo ya generado: no se crea otro."); process.exit(0); }

const result = JSON.parse(fs.readFileSync(input, "utf8"));
const baseDir = path.dirname(path.resolve(input));
fs.mkdirSync(path.join(outDir, "img"), { recursive: true });

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clean = (s) => maskIds(redact(String(s ?? "")));
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
const { total, passed, failed, skipped } = result.summary;
const pct = total ? Math.round((passed / total) * 100) : 0;
const label = { passed: "Pasa", failed: "Falla", skipped: "Omitido" };

const rows = result.tests.map((t) => {
  let evidence = "";
  if (t.evidence_data) {
    evidence += `<details><summary>Petición y respuesta</summary><pre>${esc(JSON.stringify(cleanEvidence(t.evidence_data), null, 2))}</pre></details>`;
  }
  const shot = t.evidence_path && path.resolve(baseDir, t.evidence_path);
  if (shot && fs.existsSync(shot) && !(Array.isArray(t.steps) && t.steps.length)) {
    const name = `img/${slug(t.name)}.jpg`;
    fs.copyFileSync(shot, path.join(outDir, name));
    evidence += `<details><summary>Captura</summary><img src="${name}" alt="Captura de ${esc(t.name)}" loading="lazy"></details>`;
  }
  if (Array.isArray(t.steps) && t.steps.length) {
    const figs = t.steps.map((st, i) => {
      const src = st.path && path.resolve(baseDir, st.path);
      if (!src || !fs.existsSync(src)) return "";
      const name = `img/${slug(t.name)}-${i + 1}${path.extname(src) || ".png"}`;
      fs.copyFileSync(src, path.join(outDir, name));
      return `<figure><a href="${name}" target="_blank" rel="noreferrer"><img src="${name}" alt="${esc(st.title)}" loading="lazy"></a><figcaption>${i + 1}. ${esc(st.title)}</figcaption></figure>`;
    }).join("");
    if (figs) evidence += `<div class="steps">${figs}</div>`;
  }
  if (t.error) evidence += `<pre class="err">${esc(clean(t.error)).slice(0, 2000)}</pre>`;
  return `<tr class="${t.status}"><td><span class="tag ${t.status}">${label[t.status] ?? t.status}</span></td>
<td><strong>${esc(t.name)}</strong>${t.role ? `<br><small>${esc(t.role)}</small>` : ""}${evidence}</td>
<td class="num">${t.duration_ms ? (t.duration_ms / 1000).toFixed(1) + " s" : "-"}</td></tr>`;
}).join("\n");

const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title || `Informe ${result.tool} · ${result.suite}`)}</title>
<style>
:root{color-scheme:light dark;--bg:#f6f5f1;--card:#fff;--line:#e3e1da;--txt:#171717;--mut:#6b6b66}
@media(prefers-color-scheme:dark){:root{--bg:#121212;--card:#1c1c1c;--line:#2e2e2e;--txt:#ececec;--mut:#9a9a94}}
body{margin:0;background:var(--bg);color:var(--txt);font:15px/1.5 system-ui,sans-serif}main{max-width:1000px;margin:0 auto;padding:32px 20px}
h1{margin:0 0 4px;font-size:28px}p.sub{margin:0 0 24px;color:var(--mut)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px}.kpi b{display:block;font-size:28px}.kpi span{color:var(--mut);font-size:12px}
.kpi.hero{background:#111;color:#fff}.kpi.hero span{color:#bbb}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:18px;overflow:hidden}
td{padding:12px 14px;border-top:1px solid var(--line);vertical-align:top}tr:first-child td{border-top:0}td.num{text-align:right;white-space:nowrap;color:var(--mut)}
.tag{display:inline-block;padding:2px 10px;border-radius:99px;font-size:12px;font-weight:600}
.tag.passed{background:#10b98122;color:#059669}.tag.failed{background:#ef444422;color:#dc2626}.tag.skipped{background:#f59e0b22;color:#d97706}
small{color:var(--mut)}details{margin-top:6px}summary{cursor:pointer;color:var(--mut);font-size:13px}
pre{background:#0d0d0d;color:#d6d6d6;padding:12px;border-radius:12px;overflow:auto;font-size:12px;white-space:pre-wrap;word-break:break-word}pre.err{color:#fca5a5}
img{max-width:100%;border:1px solid var(--line);border-radius:12px;margin-top:6px}.steps{display:flex;flex-wrap:wrap;gap:12px;margin-top:10px}figure{margin:0;width:150px}figure img{width:100%;margin-top:0}figcaption{font-size:12px;color:var(--mut);margin-top:4px}
.env{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px 18px;margin-bottom:24px}.env h2{margin:0 0 10px;font-size:15px}
.env dl{margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px 20px}.env dt{font-size:12px;color:var(--mut)}.env dd{margin:0;font-weight:600}
footer{margin-top:24px;color:var(--mut);font-size:12px}
</style></head><body><main>
<h1>${esc(title || `Informe de ${result.tool}`)}</h1>
<p class="sub">Suite <strong>${esc(result.suite)}</strong> · ${esc(result.target)} · ${new Date(result.finished_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })} · ${(result.duration_ms / 1000).toFixed(1)} s</p>
<section class="kpis">
<div class="kpi hero"><b>${pct}%</b><span>Tasa de éxito (${passed} de ${total})</span></div>
<div class="kpi"><b>${passed}</b><span>Pasan</span></div>
<div class="kpi"><b>${failed}</b><span>Fallan</span></div>
<div class="kpi"><b>${skipped}</b><span>Omitidos</span></div>
</section>
${Array.isArray(result.meta) && result.meta.length ? `<section class="env"><h2>Entorno</h2><dl>${result.meta.map((m) => `<div><dt>${esc(m.label)}</dt><dd>${esc(m.value)}</dd></div>`).join("")}</dl></section>` : ""}
<table><tbody>
${rows}
</tbody></table>
<footer>Generado por Ivan QA Lab. Sin claves, tokens, contraseñas, emails ni ids de usuario.</footer>
</main></body></html>`;

fs.writeFileSync(path.join(outDir, "index.html"), html);
console.log(`Informe HTML: ${path.join(outDir, "index.html")} (${result.tests.length} tests)`);
