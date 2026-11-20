// Reserva única del staging (tabla staging_lock en la BD del lab).
// Toda ejecución que resetee o pruebe contra el staging debe reservar antes y liberar al final:
// así una ejecución local, la de otro agente y la de GitHub Actions nunca se pisan los datos.
//
// Credenciales del lab: SUPABASE_URL/SUPABASE_SERVICE_KEY (CI) o LAB_URL/LAB_SERVICE_KEY (~/.qa-lab.env).
const os = require("os");

const LAB_REF = "exukogfrnsivvibcqejl";
// La reserva caduca sola a los TTL_SECONDS si el proceso muere; mientras vive se renueva cada
// RENEW_MS, así una ejecución larga (la suite completa pasa de 10 min) no la pierde a mitad.
const TTL_SECONDS = 180;
const RENEW_MS = 60_000;
const DEFAULT_WAIT_MS = 5 * 60_000;
const POLL_MS = 5_000;

function labConfig() {
  const url = process.env.SUPABASE_URL || process.env.LAB_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.LAB_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("Sin credenciales del lab (SUPABASE_URL/SUPABASE_SERVICE_KEY o LAB_URL/LAB_SERVICE_KEY): no se puede reservar el staging");
  }
  if (!url.includes(LAB_REF)) throw new Error("STOP: la URL del lab no es la de ivan-qa-lab");
  return { url, key };
}

async function rpc(fn, args) {
  const { url, key } = labConfig();
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${fn} -> ${res.status} ${await res.text()}`);
  return res.json();
}

// Identificador legible de quien reserva: en CI el run de GitHub, en local máquina y proceso.
function defaultHolder() {
  if (process.env.QA_LOCK_HOLDER) return process.env.QA_LOCK_HOLDER;
  const { GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  if (GITHUB_RUN_ID) return `ci:${GITHUB_REPOSITORY ?? "github"}#${GITHUB_RUN_ID}`;
  return `local:${os.hostname()}:${process.pid}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Reserva el staging; si está ocupado espera hasta waitMs y luego falla con un mensaje claro.
// Devuelve una función que la libera.
async function acquireStagingLock({ holder = defaultHolder(), waitMs = DEFAULT_WAIT_MS, log = console.log } = {}) {
  const deadline = Date.now() + waitMs;
  let warned = false;
  for (;;) {
    const [row] = await rpc("acquire_staging_lock", { p_holder: holder, p_ttl_seconds: TTL_SECONDS });
    if (row?.acquired) {
      log(`Staging reservado por ${holder}`);
      const timer = setInterval(() => renew(holder, log), RENEW_MS);
      timer.unref(); // no mantiene vivo el proceso
      return async () => {
        clearInterval(timer);
        await releaseStagingLock(holder);
      };
    }
    if (Date.now() >= deadline) {
      throw new Error(`Staging ocupado por ${row?.holder} hasta ${row?.expires_at}; inténtalo más tarde`);
    }
    if (!warned) {
      log(`Staging ocupado por ${row?.holder} (hasta ${row?.expires_at}); esperando...`);
      warned = true;
    }
    await sleep(POLL_MS);
  }
}

// Volver a pedir la reserva con el mismo holder la renueva (acquire_staging_lock lo permite).
async function renew(holder, log) {
  try {
    const [row] = await rpc("acquire_staging_lock", { p_holder: holder, p_ttl_seconds: TTL_SECONDS });
    if (!row?.acquired) log(`AVISO: se perdió la reserva del staging; ahora la tiene ${row?.holder}`);
  } catch (e) {
    log(`AVISO: no se pudo renovar la reserva del staging: ${e.message}`);
  }
}

async function releaseStagingLock(holder = defaultHolder()) {
  return rpc("release_staging_lock", { p_holder: holder });
}

module.exports = { acquireStagingLock, releaseStagingLock, defaultHolder };
