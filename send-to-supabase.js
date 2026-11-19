// Uso desde el workflow:
//   node send-to-supabase.js start
//   node send-to-supabase.js event log "Arrancando tests"
//   node send-to-supabase.js finish result.json
// Variables de entorno: SUPABASE_URL, SUPABASE_SERVICE_KEY, RUN_ID

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, RUN_ID } = process.env;

async function rest(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
}

const startRun = () =>
  rest("PATCH", `runs?id=eq.${RUN_ID}`, { status: "running", started_at: new Date().toISOString() });

const sendEvent = (type, message) =>
  rest("POST", "run_events", { run_id: RUN_ID, type, message, created_at: new Date().toISOString() });

async function finishRun(result) {
  const { summary, tests, duration_ms } = result;
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
    pass_rate: summary.total ? Math.round((summary.passed / summary.total) * 1000) / 10 : 0,
  });
  await rest("PATCH", `runs?id=eq.${RUN_ID}`, {
    status: "finished",
    finished_at: new Date().toISOString(),
  });
}

module.exports = { startRun, sendEvent, finishRun };

if (require.main === module) {
  const [cmd, a, b] = process.argv.slice(2);
  (async () => {
    if (cmd === "start") await startRun();
    else if (cmd === "event") await sendEvent(a, b);
    else if (cmd === "finish") await finishRun(JSON.parse(require("fs").readFileSync(a, "utf8")));
    else throw new Error("Comando no válido: start | event | finish");
  })().catch((e) => { console.error(e); process.exit(1); });
}