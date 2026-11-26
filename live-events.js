// Eventos para la pantalla "Ejecución en vivo" de la web (tabla run_events).
//
// Tipos que entiende la web: plan (nº de tests, SUMA si hay varios), test_started, test_passed,
// test_failed, test_skipped (message = nombre del test) y log (texto libre).
//
// Garantías: nunca rompe ni retrasa una ejecución. Sin RUN_ID/credenciales no hace nada, los
// eventos salen en cola (en el orden en que ocurren), cada uno con tope de 5 s y los errores
// de red se ignoran. La contraseña QA se tapa y el texto se recorta.
//
// Node:   const live = require("./shared/live-events"); live.emit("test_started", "TC-A01 ..."); await live.flush();
// Shell:  node shared/live-events.js log "Preparando entorno"

const enabled = () => !!(process.env.RUN_ID && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);

const clean = (text) => {
  let s = String(text ?? "").replace(/\u001b\[[0-9;]*m/g, "").replace(/\s+/g, " ").trim();
  const pwd = process.env.QA_PASSWORD;
  if (pwd) s = s.split(pwd).join("***");
  return s.length > 300 ? `${s.slice(0, 297)}...` : s;
};

let chain = Promise.resolve();

function emit(type, message) {
  // LIVE_DEBUG=1: imprime los eventos en vez de enviarlos (para probar un reporter en local sin gastar runs).
  if (process.env.LIVE_DEBUG) { console.log(`[live] ${type}: ${clean(message)}`); return chain; }
  if (!enabled()) return chain;
  const { sendEvent } = require("./send-to-supabase");
  const one = () => Promise.race([
    sendEvent(type, clean(message)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  chain = chain.then(one).catch(() => {});
  return chain;
}

const flush = () => chain;

module.exports = { emit, flush, clean, enabled };

if (require.main === module) {
  const [type, ...rest] = process.argv.slice(2);
  emit(type || "log", rest.join(" ")).then(() => process.exit(0));
}
