// Deja el staging en un estado conocido antes de una ejecución de tests:
//   1. asegura los 8 usuarios QA (contraseña y perfil),
//   2. vacía las tablas de datos,
//   3. carga el seed (eventos, inscripciones, una excedencia y una votación de la Junta Directiva).
// También: partidas cerradas/por editar (suite B) y días sin partida (suite H). Idempotente. Las fechas son relativas a hoy para que las reglas temporales (48 h,
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

// Los PDF de Normas viven en el bucket privado team-documents: se borran los ficheros de las
// filas que se van a vaciar, para no dejar huérfanos en Storage (plan gratis).
async function wipeDocumentFiles(sb) {
  const { data, error } = await sb.from("team_documents").select("file_path");
  if (error) throw new Error(`team_documents: ${error.message}`);
  const paths = data.map((d) => d.file_path).filter(Boolean);
  if (!paths.length) return 0;
  const { error: rmError } = await sb.storage.from("team-documents").remove(paths);
  if (rmError) throw new Error(`team-documents (storage): ${rmError.message}`);
  return paths.length;
}

async function wipe(sb) {
  await wipeDocumentFiles(sb);
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
    // Suite D (asistencia): MilSim ya jugada (pesa 1,5).
    { key: "foe_milsim_pasada", ...base, title: "QA FOE · MilSim pasada", squad: "FOE",
      event_type: "milsim", attendance_weight: 1.5, date: day(-10), hour: "08:00", created_by: ids.admin_foe },
    // Suite B (edición, borrado y desbloqueo): partidas MAD, que no cuentan en el % FOE de la D.
    { key: "mad_editar", ...base, title: "QA MAD · Partida a editar", squad: "MAD Irregulars",
      date: day(16), hour: "09:00", created_by: ids.admin_mad },
    { key: "mad_eliminar", ...base, title: "QA MAD · Partida a eliminar", squad: "MAD Irregulars",
      date: day(30), hour: "09:00", created_by: ids.admin_mad },
    { key: "mad_cerrada", ...base, title: "QA MAD · Partida cerrada", squad: "MAD Irregulars",
      date: day(-5), hour: "09:00", created_by: ids.admin_mad,
      attendance_locked: true, locked_by: ids.admin_mad, locked_at: new Date().toISOString() },
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
  // Asistencia esperada en FOE (partidas computables: finalizada 1, pasada abierta 1, MilSim
  // pasada 1,5 = 3,5): player_foe 1/3,5 = 29 %; junta2 1,5/2,5 = 60 % (su excedencia descuenta
  // la pasada abierta).
  const { error: regError } = await sb.from("event_registrations").insert([
    reg(ev.foe_menos_48h, "player_foe"),
    reg(ev.foe_finalizada, "player_foe", true),
    reg(ev.foe_finalizada, "admin_foe", true),
    reg(ev.foe_pasada, "player_foe"),
    reg(ev.foe_milsim_pasada, "junta2", true),
    reg(ev.mad_cerrada, "player_mad", true),
  ]);
  if (regError) throw new Error(`event_registrations: ${regError.message}`);

  const leave = (key, start, end, reason, status) =>
    ({ profile_id: ids[key], squad: "ALL", start_date: day(start), end_date: day(end), reason, status });
  const leaves = [
    // Aprobada de player_mad que cubre "QA MAD · Partida en excedencia" (TC-C03).
    leave("player_mad", 13, 40, "Excedencia QA", "approved"),
    // Aprobada de junta2 que cubre "QA FOE · Partida pasada abierta": no computa (TC-D03).
    leave("junta2", -4, -2, "Excedencia QA pasada", "approved"),
    // Suite F: solicitud pendiente de un jugador y otra propia de un miembro de la Junta.
    leave("player_foe", 100, 140, "Solicitud QA pendiente", "pending"),
    leave("admin_foe", 100, 140, "Solicitud QA propia", "pending"),
  ];
  const { error: leaveError } = await sb.from("player_leaves").insert(leaves);
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

  // Suite H (calendario): un día sin partida por equipo, lejos de las fechas de las partidas.
  const blackouts = [
    { squad: "FOE", start_date: day(25), end_date: day(26), reason: "QA · Sin partida FOE", created_by: ids.admin_foe },
    { squad: "MAD Irregulars", start_date: day(27), end_date: day(27), reason: "QA · Sin partida MAD", created_by: ids.admin_mad },
  ];
  const { error: boError } = await sb.from("team_blackouts").insert(blackouts);
  if (boError) throw new Error(`team_blackouts: ${boError.message}`);

  const sanctions = await seedSanctions(sb, ids);
  return { events: events.length, registrations: 6, polls: 1 + sanctions, leaves: leaves.length };
}

// Suite E (gobernanza): expedientes de sanción de la Junta Directiva ya preparados para que el
// test solo tenga que emitir el último voto. Directiva = superadmin, admin_foe y junta2; el
// propuesto para sanción queda recusado (Art. 53.4) y no cuenta para el cuórum.
async function seedSanctions(sb, ids) {
  const sanction = (target, severity) => ({
    profileId: ids[target], severity, penalty: "apercibimiento", suspensionMonths: null,
    infractionDate: day(-1), ruleArticle: "Art. 51.i — Seed QA", reason: "Expediente de prueba del seed.",
  });
  const expedientes = [
    // junta2 es el propuesto: ve el aviso de recusación y no puede votar.
    { key: "recusacion", title: "QA · Sanción a QA Junta 2 (recusación)", target: "junta2", severity: "leve", votes: [] },
    // Recusado admin_foe; habilitados superadmin (ya votó) y junta2 -> su voto cierra.
    { key: "cuorum", title: "QA · Sanción con cuórum pendiente", target: "admin_foe", severity: "leve",
      votes: [["superadmin", 0]] },
    // player_foe ya tiene 2 leves en el año -> la 3ª se escala a Grave (Art. 51.k).
    { key: "escalado_leve", title: "QA · Tercera falta leve", target: "player_foe", severity: "leve",
      votes: [["superadmin", 0], ["admin_foe", 0]] },
    // superadmin ya tiene 2 graves -> la 3ª se escala a Muy Grave (Art. 50.m).
    { key: "escalado_grave", title: "QA · Tercera falta grave", target: "superadmin", severity: "grave",
      votes: [["admin_foe", 0]] },
    // Mayoría en contra -> se cierra sin sanción.
    { key: "desestimada", title: "QA · Sanción a desestimar", target: "player_foe", severity: "leve",
      votes: [["superadmin", 1], ["admin_foe", 1]] },
  ];

  const { data: polls, error } = await sb.from("foe_polls").insert(expedientes.map((e) => ({
    board: "junta_directiva", topic_type: "sancion", title: e.title,
    description: "Expediente de prueba del seed.",
    options: ["A favor de sancionar", "En contra de sancionar"],
    sanction_data: sanction(e.target, e.severity), is_anonymous: false, status: "open",
    created_by: ids.admin_foe,
  }))).select("id, title");
  if (error) throw new Error(`foe_polls (sanciones): ${error.message}`);
  const pollId = (title) => polls.find((p) => p.title === title).id;

  const votes = expedientes.flatMap((e) =>
    e.votes.map(([voter, option]) => ({ poll_id: pollId(e.title), profile_id: ids[voter], option_index: option })));
  const { error: voteError } = await sb.from("foe_poll_votes").insert(votes);
  if (voteError) throw new Error(`foe_poll_votes: ${voteError.message}`);

  // Faltas previas dentro de los últimos 365 días para los escalados.
  const falta = (target, severity, offset) => ({
    profile_id: ids[target], severity, reason: "Falta previa del seed", infraction_date: day(offset),
    status: "active", rule_article: "Art. 51 — Seed QA", issued_by: ids.admin_foe,
  });
  const { error: infError } = await sb.from("foe_infractions").insert([
    falta("player_foe", "leve", -30), falta("player_foe", "leve", -60),
    falta("superadmin", "grave", -40), falta("superadmin", "grave", -90),
  ]);
  if (infError) throw new Error(`foe_infractions: ${infError.message}`);

  return expedientes.length;
}

async function reset({ log = console.log } = {}) {
  const sb = stagingClient();
  await assertOnlyQaProfiles(sb);
  const ids = await ensureUsers(sb, { log: () => {} });
  log(`Usuarios QA: ${Object.keys(ids).length}`);
  await wipe(sb);
  log(`Vaciadas: ${DATA_TABLES.join(", ")}`);
  const counts = await seed(sb, ids);
  log(`Seed: ${counts.events} eventos, ${counts.registrations} inscripciones, ${counts.leaves} excedencias, ${counts.polls} votaciones`);
}

module.exports = { reset };

// Ejecutado suelto (npm run reset-staging) también reserva el staging mientras resetea.
// Las suites de tests reservan por su cuenta (global-setup o with-staging.js) y llaman a reset()
// dentro; con QA_LOCK_HELD=1 (lo pone with-staging.js) la reserva ya es del proceso padre.
if (require.main === module) {
  const { acquireStagingLock } = require("./lock");
  (async () => {
    if (process.env.QA_LOCK_HELD === "1") return reset();
    const release = await acquireStagingLock();
    try {
      await reset();
    } finally {
      await release();
    }
  })().catch((e) => { console.error(e.message ?? e); process.exit(1); });
}
