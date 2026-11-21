// Publica en el lab el result.json de una herramienta que no es Playwright (Selenium Java/Python...):
//   node shared/publish-results.js java/result.json
// Formato: el mismo que escribe qa-playwright, pero cada test puede traer `evidence_path`
// (captura JPEG en disco, relativa al result.json) en vez de `evidence_url`. Este script:
//   1. sube cada captura al bucket `evidence` y rellena evidence_url,
//   2. tapa QA_PASSWORD en los mensajes de error (defensa extra),
//   3. cierra el run (finishRun) y borra las evidencias de más de 14 días.
// Sin RUN_ID (ejecución local) solo muestra el resumen.
const fs = require("fs");
const path = require("path");

const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
const { redact, cleanEvidence } = require("./sanitize");

(async () => {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) throw new Error(`No existe el result.json: ${file}`);
  const result = JSON.parse(fs.readFileSync(file, "utf8"));
  const baseDir = path.dirname(path.resolve(file));
  const online = !!(process.env.RUN_ID && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
  const lab = online ? require("./send-to-supabase") : null;

  for (const t of result.tests) {
    t.error = redact(t.error ?? null);
    const shot = t.evidence_path && path.resolve(baseDir, t.evidence_path);
    delete t.evidence_path;
    const data = t.evidence_data;
    delete t.evidence_data;
    t.evidence_url = t.evidence_url ?? null;
    if (lab && shot && fs.existsSync(shot)) {
      t.evidence_url = await lab.uploadEvidence(`${slug(t.name)}.jpg`, fs.readFileSync(shot))
        .catch((e) => { console.warn(`No se pudo subir la evidencia de "${t.name}": ${e.message}`); return null; });
    }
    if (lab && data) {
      t.evidence_url = await lab.uploadEvidence(`${slug(t.name)}.json`, Buffer.from(JSON.stringify(cleanEvidence(data), null, 2)), "application/json")
        .catch((e) => { console.warn(`No se pudo subir la evidencia de "${t.name}": ${e.message}`); return null; });
    }
  }

  const { total, passed, failed, skipped } = result.summary;
  console.log(`${result.tool} · ${result.suite}: ${passed}/${total} pasan, ${failed} fallan, ${skipped} omitidos`);
  if (!lab) return console.log("Sin RUN_ID: no se publica (ejecución local).");
  await lab.finishRun(result);
  await lab.pruneEvidence().catch((e) => console.warn(`Limpieza de evidencias: ${e.message}`));
  console.log("Publicado en el lab.");
})().catch((e) => { console.error(e.message ?? e); process.exit(1); });
