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

async function failRun(reason) {
  if (reason) await sendEvent("log", `ERROR: ${reason}`).catch(() => {});
  await rest("PATCH", activeRun, { status: "failed", finished_at: now() });
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
}

module.exports = { startRun, sendEvent, finishRun, failRun };

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
