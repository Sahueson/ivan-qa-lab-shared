// Limpieza de lo que se publica (evidencias en Supabase e informes HTML en GitHub Pages, ambos públicos):
// fuera cabeceras con claves o sesión, fuera contraseñas, tokens, emails y ids de usuario, y cuerpos recortados.
const redact = (s) => {
  const pwd = process.env.QA_PASSWORD;
  return s && pwd ? s.split(pwd).join("***") : s;
};

const HIDE_HEADERS = /^(apikey|authorization|cookie|set-cookie|x-api-key|proxy-authorization)$/i;
const HIDE_FIELDS = /^(password|access_token|refresh_token|token|provider_token|provider_refresh_token)$/i;

const cleanBody = (b) => {
  if (b == null) return null;
  let text = typeof b === "string" ? b : JSON.stringify(b);
  try {
    const walk = (v) => Array.isArray(v) ? v.map(walk) : v && typeof v === "object"
      ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, HIDE_FIELDS.test(k) ? "***" : walk(x)])) : v;
    text = JSON.stringify(walk(JSON.parse(text)));
  } catch { /* no es JSON: se deja como texto */ }
  text = redact(text);
  return text.length > 3000 ? text.slice(0, 3000) + "… (recortado)" : text;
};

const cleanHeaders = (h) => Object.fromEntries(Object.entries(h || {}).filter(([k]) => !HIDE_HEADERS.test(k)));

// Emails e ids de usuario (UUID) fuera, en cualquier parte del texto (cuerpos, URL...).
const maskIds = (txt) => txt
  .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "***@***")
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>");

const cleanEvidence0 = (e) => ({
  ...e,
  ...(e.request ? { request: { ...e.request, headers: cleanHeaders(e.request.headers), body: cleanBody(e.request.body) } } : {}),
  ...(e.response ? { response: { ...e.response, headers: undefined, body: cleanBody(e.response.body) } } : {}),
});

const cleanEvidence = (e) => JSON.parse(maskIds(JSON.stringify(cleanEvidence0(e))));

module.exports = { redact, cleanEvidence, maskIds };
