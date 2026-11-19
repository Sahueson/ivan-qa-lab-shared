// Deja el staging en un estado conocido antes de una ejecución de tests:
//   1. asegura los 8 usuarios QA (contraseña y perfil),
//   2. vacía las tablas de datos,
//   3. carga el seed (eventos, inscripciones, una excedencia y una votación de la Junta Directiva).
// Idempotente. Las fechas son relativas a hoy para que las reglas temporales (48 h,
// partidas finalizadas) se cumplan siempre.
//
// Uso: set -a; source ~/.qa-lab.env; set +a; node reset-staging/reset.js
// Variables: STG_URL, STG_SECRET_KEY, QA_PASSWORD
const { stagingClient, ensureUsers } = require("./create-users");
const users = require("./users.json");

// Orden de borrado: primero las tablas hijas.
const DATA_TABLES = [
  "foe_poll_votes",
  "foe_infractions",
  "foe_polls",
  "event_registrations",
  "events",
  "player_leaves",
  "team_blackouts",
  "team_documents",
];

// La app guarda date "YYYY-MM-DD" y hour "HH:MM" en hora local (como el <input type="date">).
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return ymd(d);
};
// Fecha y hora dentro de h horas (margen amplio frente al umbral de 48 h y a husos distintos).
const inHours = (h) => {
  const d = new Date(Date.now() + h * 3_600_000);
  return { date: ymd(d), hour: `${pad(d.getHours())}:00` };
};

// Salvaguarda: el staging solo debe tener perfiles QA. Si aparece otro, no se toca nada.
async function assertOnlyQaProfiles(sb) {
  const qaEmails = new Set(users.map((u) => u.email));
  const { data, error } = await sb.from("profiles").select("email");
  if (error) throw error;
  const others = data.filter((p) => !qaEmails.has(p.email));
  if (others.length) {
    throw new Error(`STOP: hay ${others.length} perfil(es) que no son QA; esto no parece el staging de tests`);
  }
}

async function wipe(sb) {
  for (const table of DATA_TABLES) {
    const { error } = await sb.from(table).delete().not("id", "is", null);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

function seedEvents(ids) {
  const base = { field: "Campo QA", price: "", payment_method: "Efectivo", event_type: "normal",
    attendance_weight: 1, attendance_locked: false, unlock_approvals: [], is_cancelled: false,
    count_attendance: true };
  const lt48 = inHours(24);
  return [
    { key: "mad_proxima", ...base, title: "QA MAD · Partida próxima", squad: "MAD Irregulars",
      date: day(10), hour: "09:00", created_by: ids.admin_mad },
    { key: "foe_proxima", ...base, title: "QA FOE · Partida próxima", squad: "FOE",
      date: day(10), hour: "09:00", created_by: ids.admin_foe },
    { key: "foe_milsim", ...base, title: "QA FOE · MilSim próxima", squad: "FOE",
      event_type: "milsim", attendance_weight: 1.5, date: day(20), hour: "08:00", created_by: ids.admin_foe },
    { key: "foe_menos_48h", ...base, title: "QA FOE · Partida en menos de 48 h", squad: "FOE",
      date: lt48.date, hour: lt48.hour, created_by: ids.admin_foe },
    { key: "foe_finalizada", ...base, title: "QA FOE · Partida finalizada", squad: "FOE",
      date: day(-7), hour: "09:00", created_by: ids.admin_foe },
    // Suite C (inscripciones): partidas propias para no chocar con las que la suite B modifica.
    { key: "foe_inscripcion", ...base, title: "QA FOE · Inscripción abierta", squad: "FOE",
      uniform: "Tiger Stripe", date: day(12), hour: "09:00", created_by: ids.admin_foe },
    { key: "foe_cancelada", ...base, title: "QA FOE · Partida cancelada", squad: "FOE",
      is_cancelled: true, count_attendance: false, cancel_reason: "Seed QA",
      date: day(8), hour: "09:00", created_by: ids.admin_foe },
    { key: "foe_pasada", ...base, title: "QA FOE · Partida pasada abierta", squad: "FOE",
      date: day(-3), hour: "09:00", created_by: ids.admin_foe },
    { key: "mad_excedencia", ...base, title: "QA MAD · Partida en excedencia", squad: "MAD Irregulars",
      date: day(14), hour: "09:00", created_by: ids.admin_mad },
  ];
}

async function seed(sb, ids) {
  const events = seedEvents(ids);
  const { data: inserted, error } = await sb
    .from("events")
    .insert(events.map(({ key, ...row }) => row))
    .select("id, title");
  if (error) throw new Error(`events: ${error.message}`);
  const ev = Object.fromEntries(events.map((e, i) => [e.key, inserted.find((r) => r.title === e.title).id]));

  // player_foe apuntado a la de <48 h (TC-C02: no puede darse de baja) y a la finalizada.
  const reg = (event_id, key, attended = false) => {
    const p = users.find((u) => u.key === key).profile;
    return { event_id, profile_id: ids[key], team: p.team_label || "Camuflaje", role: p.role || "asalto",
      status: "confirmed", attended };
  };
  const { error: regError } = await sb.from("event_registrations").insert([
    reg(ev.foe_menos_48h, "player_foe"),
    reg(ev.foe_finalizada, "player_foe", true),
    reg(ev.foe_finalizada, "admin_foe", true),
  ]);
  if (regError) throw new Error(`event_registrations: ${regError.message}`);

  // Excedencia aprobada de player_mad que cubre "QA MAD · Partida en excedencia" (TC-C03).
  const { error: leaveError } = await sb.from("player_leaves").insert({
    profile_id: ids.player_mad, squad: "ALL", start_date: day(13), end_date: day(40),
    reason: "Excedencia QA", status: "approved",
  });
  if (leaveError) throw new Error(`player_leaves: ${leaveError.message}`);

  // Votación general de la Junta Directiva (un MAD no debe verla).
  const { error: pollError } = await sb.from("foe_polls").insert({
    board: "junta_directiva",
    topic_type: "general",
    title: "QA · Votación de la Junta Directiva",
    description: "Votación de prueba del seed.",
    options: ["A favor", "En contra"],
    is_anonymous: false,
    status: "open",
    closes_at: day(30),
    created_by: ids.admin_foe,
  });
  if (pollError) throw new Error(`foe_polls: ${pollError.message}`);

  return { events: events.length, registrations: 3, polls: 1, leaves: 1 };
}

async function reset({ log = console.log } = {}) {
  const sb = stagingClient();
  await assertOnlyQaProfiles(sb);
  const ids = await ensureUsers(sb, { log: () => {} });
  log(`Usuarios QA: ${Object.keys(ids).length}`);
  await wipe(sb);
  log(`Vaciadas: ${DATA_TABLES.join(", ")}`);
  const counts = await seed(sb, ids);
  log(`Seed: ${counts.events} eventos, ${counts.registrations} inscripciones, ${counts.leaves} excedencia, ${counts.polls} votación`);
}

module.exports = { reset };

// Ejecutado suelto (npm run reset-staging) también reserva el staging mientras resetea.
// Las suites de tests reservan por su cuenta (global-setup) y llaman a reset() dentro.
if (require.main === module) {
  const { acquireStagingLock } = require("./lock");
  (async () => {
    const release = await acquireStagingLock();
    try {
      await reset();
    } finally {
      await release();
    }
  })().catch((e) => { console.error(e.message ?? e); process.exit(1); });
}
