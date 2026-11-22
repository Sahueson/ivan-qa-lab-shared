// Envoltorio para herramientas que no son Node (Selenium Java/Python, Cucumber, Karate...):
// reserva el staging, lo resetea, ejecuta el comando de tests y libera la reserva al terminar.
//
//   node shared/reset-staging/with-staging.js -- mvn -B test -Dgroups=a-auth
//   node shared/reset-staging/with-staging.js -- pytest tests/a-auth
//
// El comando hijo hereda QA_LOCK_HELD=1 y el holder de la reserva: así puede llamar a
// `node shared/reset-staging/reset.js` (p. ej. al empezar cada suite) sin esperar a una reserva
// que ya es suya. Sale con el mismo código que el comando.
const { spawn } = require("child_process");
const { acquireStagingLock, defaultHolder } = require("./lock");
const { reset } = require("./reset");

const log = (msg) => console.log(`[staging] ${msg}`);

(async () => {
  const sep = process.argv.indexOf("--");
  const cmd = sep >= 0 ? process.argv.slice(sep + 1) : [];
  if (!cmd.length) throw new Error("Uso: node with-staging.js -- <comando de tests>");

  const holder = defaultHolder();
  const release = await acquireStagingLock({ holder, log });
  let code = 1;
  try {
    await reset({ log });
    code = await new Promise((resolve) => {
      const child = spawn(cmd[0], cmd.slice(1), {
        stdio: "inherit",
        shell: process.platform === "win32", // en Windows npx es un .cmd
        env: { ...process.env, QA_LOCK_HELD: "1", QA_LOCK_HOLDER: holder },
      });
      // Si cancelan el job (GitHub manda SIGINT/SIGTERM), se para el hijo y se libera igual.
      for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
      child.on("error", (e) => { console.error(e.message); resolve(1); });
      child.on("exit", (c) => resolve(c ?? 1));
    });
  } finally {
    await release();
    log("Staging liberado");
  }
  process.exit(code);
})().catch((e) => { console.error(e.message ?? e); process.exit(1); });
