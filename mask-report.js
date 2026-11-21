// Tapa la contraseña QA y los tokens en un informe HTML ANTES de publicarlo (GitHub Pages es público).
//   node mask-report.js <carpeta del informe>
// - Texto (html, js, json, css, txt, xml...): QA_PASSWORD -> "***" y JWT -> "***".
// - Informe de Playwright: los datos van en un zip en base64 dentro de index.html; se abre, se tapa y se vuelve a empaquetar.
// - Los .zip sueltos (trazas de Playwright) se borran: llevan la contraseña y no se pueden revisar.
// - Si tras tapar queda alguna coincidencia, borra el informe entero y sale con error: es mejor no publicar que publicar con la contraseña.
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const dir = process.argv[2];
const pwd = process.env.QA_PASSWORD || "";
if (!dir || !fs.existsSync(dir)) { console.log("Sin informe que tapar."); process.exit(0); }

const JWT = /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{8,}/g;
const TEXT = /\.(html?|js|mjs|json|css|txt|xml|csv|md|map|log)$/i;
let changed = 0;

const mask = (s) => {
  let out = pwd ? s.split(pwd).join("***") : s;
  out = out.replace(JWT, "***");
  if (out !== s) changed++;
  return out;
};
const leaks = (s) => { JWT.lastIndex = 0; return (pwd && s.includes(pwd)) || JWT.test(s); };

const B64 = /(<script id="playwrightReportBase64"[^>]*>)data:application\/zip;base64,([A-Za-z0-9+/=]+)(<\/script>)/;

async function maskZipBase64(html) {
  const m = html.match(B64);
  if (!m) return html;
  const zip = await JSZip.loadAsync(m[2], { base64: true });
  for (const name of Object.keys(zip.files)) {
    const f = zip.files[name];
    if (f.dir || !TEXT.test(name)) continue;
    const text = await f.async("string");
    const masked = mask(text);
    if (masked !== text) zip.file(name, masked);
  }
  const b64 = await zip.generateAsync({ type: "base64", compression: "DEFLATE" });
  return html.replace(B64, (_, a, __, c) => `${a}data:application/zip;base64,${b64}${c}`);
}

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

(async () => {
  for (const file of walk(dir)) {
    if (/\.zip$/i.test(file)) { fs.rmSync(file); console.log(`Borrado (traza): ${file}`); continue; }
    if (!TEXT.test(file)) continue;
    let text = fs.readFileSync(file, "utf8");
    text = await maskZipBase64(text);
    fs.writeFileSync(file, mask(text));
  }

  // Comprobación final (cierra en falso): ni en los ficheros ni dentro del zip de Playwright.
  let bad = null;
  for (const file of walk(dir)) {
    if (!TEXT.test(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    if (leaks(text)) { bad = file; break; }
    const m = text.match(B64);
    if (m) {
      const zip = await JSZip.loadAsync(m[2], { base64: true });
      for (const name of Object.keys(zip.files)) {
        if (zip.files[name].dir || !TEXT.test(name)) continue;
        if (leaks(await zip.files[name].async("string"))) { bad = `${file}:${name}`; break; }
      }
    }
    if (bad) break;
  }
  if (bad) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.error(`Quedan datos sensibles en ${bad}: informe borrado, no se publica.`);
    process.exit(1);
  }
  console.log(`Informe revisado: ${changed} cambios, sin contraseña ni tokens.`);
})().catch((e) => { console.error(e); process.exit(1); });
