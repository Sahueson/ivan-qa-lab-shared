// Crea (o resetea) los 8 usuarios QA del staging y sus perfiles. Idempotente.
// Uso: set -a; source ~/.qa-lab.env; set +a; node reset-staging/create-users.js
const { createClient } = require("@supabase/supabase-js");

const STAGING_REF = "rpxdxitntsmgcbbnuyox";
const users = require("./users.json");

// Cliente con service key, solo si la URL es la del staging.
function stagingClient() {
  const { STG_URL, STG_SECRET_KEY, QA_PASSWORD } = process.env;
  if (!STG_URL || !STG_SECRET_KEY || !QA_PASSWORD) {
    throw new Error("Faltan STG_URL, STG_SECRET_KEY o QA_PASSWORD");
  }
  if (!STG_URL.includes(STAGING_REF)) {
    throw new Error("STOP: esta URL no es la del staging");
  }
  return createClient(STG_URL, STG_SECRET_KEY, { auth: { persistSession: false } });
}

// Devuelve { key -> id } de los usuarios QA.
// Campos que users.json solo pone cuando no son el valor por defecto. Se fijan siempre para que
// un test que bloquea o asciende a alguien (suite G) no deje el cambio para la siguiente ejecución.
const PROFILE_DEFAULTS = { is_blocked: false, is_super_admin: false };

async function ensureUsers(sb, { log = console.log } = {}) {
  const { data: list, error: listError } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;

  const ids = {};
  for (const u of users) {
    let id = list.users.find((x) => x.email === u.email)?.id;
    if (!id) {
      const { data, error } = await sb.auth.admin.createUser({
        email: u.email,
        password: process.env.QA_PASSWORD,
        email_confirm: true,
        user_metadata: { nickname: u.nickname },
      });
      if (error) throw error;
      id = data.user.id;
    } else {
      const { error } = await sb.auth.admin.updateUserById(id, { password: process.env.QA_PASSWORD });
      if (error) throw error;
    }
    const { error } = await sb
      .from("profiles")
      .upsert({ id, email: u.email, nickname: u.nickname, ...PROFILE_DEFAULTS, ...u.profile });
    if (error) throw error;
    ids[u.key] = id;
    log("OK", u.key, u.email);
  }
  return ids;
}

module.exports = { stagingClient, ensureUsers, STAGING_REF };

if (require.main === module) {
  ensureUsers(stagingClient()).catch((e) => { console.error(e.message ?? e); process.exit(1); });
}
