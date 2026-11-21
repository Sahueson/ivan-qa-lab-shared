// Uso desde el workflow:
//   node send-to-supabase.js start
//   node send-to-supabase.js event log "Arrancando tests"
//   node send-to-supabase.js finish result.json
//   node send-to-supabase.js fail "motivo"
// Variables de entorno: SUPABASE_URL, SUPABASE_SERVICE_KEY, RUN_ID
// (opcionales, las pone GitHub Actions: GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID)

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, RUN_ID } = process.env;

async function rest(method, path, body, prefer = "return=minimal") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
}

const now = () => new Date().toISOString();
// Solo se tocan runs activos: un run ya cerrado (p. ej. por timeout) no se reabre.
const activeRun = `runs?id=eq.${RUN_ID}&status=in.(queued,running)`;

function githubRunUrl() {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  return GITHUB_REPOSITORY && GITHUB_RUN_ID
    ? `${GITHUB_SERVER_URL ?? "https://github.com"}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
    : null;
}

const startRun = () =>
  rest("PATCH", activeRun, { status: "running", started_at: now(), github_run_url: githubRunUrl() });

const sendEvent = (type, message) =>
  rest("POST", "run_events", { run_id: RUN_ID, type, message, created_at: now() });

// Avisa a la web de que el entorno puede haberse liberado: lanza el siguiente run en cola, si lo hay. La URL es pública
// (el endpoint es idempotente y no acepta datos). Si el staging aún está reservado responde "busy": se reintenta unos segundos.
async function notifyQueue() {
  const base = process.env.QA_LAB_WEB_URL || "https://ivan-qa-lab-web.vercel.app";
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(`${base}/api/runs/advance`, { method: "POST", signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      if (j.started || j.reason !== "busy") return;
    } catch { return; }
    await new Promise((res) => setTimeout(res, 5000));
  }
}

async function failRun(reason) {
  if (reason) await sendEvent("log", `ERROR: ${reason}`).catch(() => {});
  await rest("PATCH", activeRun, { status: "failed", finished_at: now() });
  await notifyQueue();
}

// Repetible: si GitHub relanza el job, se sustituyen los resultados en vez de fallar por duplicado.
async function finishRun(result) {
  const { summary, tests, duration_ms } = result;
  if (!summary.total) return failRun("La suite no ejecutó ningún test");

  await rest("DELETE", `test_results?run_id=eq.${RUN_ID}`);
  await rest("POST", "test_results", tests.map((t) => ({
    run_id: RUN_ID,
    name: t.name,
    status: t.status,
    duration_ms: t.duration_ms,
    role: t.role ?? null,
    error: t.error ?? null,
    evidence_url: t.evidence_url ?? null,
  })));
  await rest("POST", "run_summary", {
    run_id: RUN_ID,
    ...summary,
    duration_ms,
    pass_rate: Math.round((summary.passed / summary.total) * 1000) / 10,
  }, "resolution=merge-duplicates,return=minimal");
  await rest("PATCH", activeRun, { status: "finished", finished_at: now() });
  await notifyQueue();
}

// ---------- Evidencias (bucket público `evidence` del lab) ----------
// Solo capturas de pantalla: nunca trazas, vídeos ni logs (llevan contraseña y tokens).
const EVIDENCE_BUCKET = "evidence";
const EVIDENCE_RETENTION_DAYS = 14;

async function storage(method, path, body, contentType = "application/json") {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: contentType === "application/json" && body && !Buffer.isBuffer(body) && typeof body !== "string" ? JSON.stringify(body) : body,
  });
  if (!res.ok) throw new Error(`storage ${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.json().catch(() => null);
}

// Sube una captura y devuelve su URL pública. name: nombre de fichero sin carpeta.
async function uploadEvidence(name, buffer, contentType = "image/jpeg") {
  const objectPath = `runs/${RUN_ID}/${name}`;
  await storage("POST", `object/${EVIDENCE_BUCKET}/${objectPath}`, buffer, contentType);
  return `${SUPABASE_URL}/storage/v1/object/public/${EVIDENCE_BUCKET}/${objectPath}`;
}

// Borra las evidencias de runs con más de EVIDENCE_RETENTION_DAYS días (plan gratis: 1 GB).
async function pruneEvidence() {
  const cutoff = new Date(Date.now() - EVIDENCE_RETENTION_DAYS * 86_400_000).toISOString();
  const oldRuns = await fetch(`${SUPABASE_URL}/rest/v1/runs?select=id&created_at=lt.${cutoff}`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  }).then((r) => r.json());
  for (const { id } of oldRuns) {
    const objects = await storage("POST", `object/list/${EVIDENCE_BUCKET}`, { prefix: `runs/${id}`, limit: 1000 });
    const paths = (objects ?? []).map((o) => `runs/${id}/${o.name}`);
    if (paths.length) await storage("DELETE", `object/${EVIDENCE_BUCKET}`, { prefixes: paths });
    await rest("PATCH", `test_results?run_id=eq.${id}&evidence_url=not.is.null`, { evidence_url: null });
  }
}

module.exports = { startRun, sendEvent, finishRun, failRun, uploadEvidence, pruneEvidence };

if (require.main === module) {
  const [cmd, a, b] = process.argv.slice(2);
  (async () => {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !RUN_ID) {
      throw new Error("Faltan SUPABASE_URL, SUPABASE_SERVICE_KEY o RUN_ID");
    }
    if (cmd === "start") await startRun();
    else if (cmd === "event") await sendEvent(a, b);
    else if (cmd === "finish") await finishRun(JSON.parse(require("fs").readFileSync(a, "utf8")));
    else if (cmd === "fail") await failRun(a);
    else throw new Error("Comando no válido: start | event | finish | fail");
  })().catch((e) => { console.error(e); process.exit(1); });
}
