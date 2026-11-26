// Lanza un comando y convierte su salida de consola en eventos para la pantalla en vivo de la web,
// sin tocar los tests ni los informes de la herramienta. Para las herramientas de API y carga, que no
// tienen un hook por test:
//
//   node shared/live-tail.js newman -- npx newman run ...
//   node shared/live-tail.js bruno  -- npx bru run ...
//   node shared/live-tail.js karate -- karate run ...
//   node shared/live-tail.js jmeter -- jmeter -n ...
//
// La salida se reenvía tal cual (el log de CI no cambia) y el código de salida es el del comando.
// Sin RUN_ID no emite nada. Un parser que no reconozca una línea simplemente la ignora.

const { spawn } = require("child_process");
const live = require("./live-events");

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

// ---- Casos elegidos (SUITE / GREP) a partir de la fuente única de los casos de API ----
const unescapeName = (n) => n.replace(/^\^/, "").replace(/\$$/, "").replace(/\\(.)/g, "$1");
function selectedCases() {
  let spec = [];
  try { spec = require("./api-cases/spec.js"); } catch { return []; }
  const suites = (process.env.SUITE || "").split(",").filter(Boolean);
  const names = process.env.GREP ? process.env.GREP.split("|").map(unescapeName) : null;
  return spec.filter((c) => (names ? names.includes(c.name) : !suites.length || suites.includes(c.suite)));
}

// ---- Parsers: cada uno devuelve una lista de [tipo, mensaje] por línea ----
const parsers = {
  // Salida "cli" de Newman: "└ TC-A01 …" al empezar cada petición, "√ …" si pasa, "- [skipped] …", "1. …" si falla.
  newman: {
    plan: () => selectedCases().length,
    line(l) {
      let m;
      if ((m = l.match(/^└ (TC-.+?)\s*$/))) return [["test_started", m[1]]];
      if ((m = l.match(/^\s+[√✓]\s+(TC-.+?)\s*$/))) return [["test_passed", m[1]]];
      if ((m = l.match(/^\s+-\s+\[skipped\]\s+(TC-.+?)\s*$/))) return [["test_skipped", m[1]]];
      if ((m = l.match(/^\s+\d+\.\s+(TC-.+?)\s*$/))) return [["test_failed", m[1]]];
      return [];
    },
  },
  // Bruno: una línea por petición ("api/a-auth/TC-A01 (401 …) - 51 ms") y "✓ nombre" / "✗ nombre" por test.
  bruno: {
    plan: () => selectedCases().length,
    line(l) {
      let m;
      if (/request skipped/.test(l) && (m = l.match(/(TC-[A-Z]\d+)/))) {
        const c = require("./api-cases/spec.js").find((x) => x.id === m[1]);
        return [["test_skipped", c ? c.name : m[1]]];
      }
      if ((m = l.match(/^\s*✓\s+(TC-.+?)\s*$/))) return [["test_started", m[1]], ["test_passed", m[1]]];
      if ((m = l.match(/^\s*[✗✕×]\s+(TC-.+?)\s*$/))) return [["test_started", m[1]], ["test_failed", m[1]]];
      return [];
    },
  },
  // Karate no imprime el nombre de cada escenario: se avisa al acabar cada feature (una suite).
  karate: {
    feature: null,
    line(l) {
      let m;
      if ((m = l.match(/^feature:\s+(?:.*[\\/])?([\w-]+)\.feature/))) { this.feature = m[1]; return []; }
      if (this.feature && (m = l.match(/^scenarios:\s+(\d+)\s+\|\s+passed:\s+(\d+)(.*)$/))) {
        const skipped = (m[3].match(/skipped:\s+(\d+)/) || [])[1];
        const failed = (m[3].match(/failed:\s+(\d+)/) || [])[1];
        const suite = this.feature;
        this.feature = null;
        return [["log", `Suite ${suite} terminada: ${m[1]} escenarios, ${m[2]} superados` +
          `${failed && failed !== "0" ? `, ${failed} fallidos` : ""}${skipped && skipped !== "0" ? `, ${skipped} omitidos` : ""}`]];
      }
      return [];
    },
  },
  // JMeter imprime un resumen acumulado cada pocos segundos (-Jsummariser.interval).
  jmeter: {
    line(l) {
      const m = l.match(/summary\s+=\s+(\d+)\s+in\s+(\S+)\s+=\s+([\d.,]+)\/s\s+Avg:\s+(\d+).*?Err:\s+(\d+)/);
      if (!m) return [];
      return [["log", `Carga: ${m[1]} peticiones en ${m[2]} · ${m[3]}/s · media ${m[4]} ms · ${m[5]} errores`]];
    },
  },
};

// ---- Ejecución ----
const sep = process.argv.indexOf("--");
const name = process.argv[2];
const cmd = sep >= 0 ? process.argv.slice(sep + 1) : [];
const parser = parsers[name];
if (!parser || !cmd.length) {
  console.error(`Uso: node live-tail.js <${Object.keys(parsers).join("|")}> -- <comando>`);
  process.exit(2);
}

if (parser.plan) {
  const n = parser.plan();
  if (n > 0) live.emit("plan", String(n));
}

const child = spawn(cmd[0], cmd.slice(1), {
  stdio: ["inherit", "pipe", "pipe"],
  shell: process.platform === "win32", // en Windows npx es un .cmd
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));

function tail(stream, out) {
  let buf = "";
  stream.on("data", (chunk) => {
    out.write(chunk);
    buf += chunk.toString("utf8");
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() ?? "";
    for (const l of lines) {
      try {
        for (const [type, message] of parser.line(l.replace(ANSI, ""))) live.emit(type, message);
      } catch { /* un parser nunca debe romper la ejecución */ }
    }
  });
}
tail(child.stdout, process.stdout);
tail(child.stderr, process.stderr);

child.on("error", (e) => { console.error(e.message); live.flush().then(() => process.exit(1)); });
child.on("exit", (code) => live.flush().then(() => process.exit(code ?? 1)));
