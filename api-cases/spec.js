// Casos de API por suite (mismos dominios A-I que Playwright). Una sola fuente para Newman, Bruno, Karate y JMeter.
// auth: null (solo apikey) | 'none' (sin apikey) | clave de usuario QA (necesita QA_PASSWORD)
// checks: status [..] · empty · nonEmpty · blocked (401/403, o 200/204 sin filas afectadas) · eachEq {path,value}
//         hasValue {path,value} · errorCode · token · hasSquads [..] (valores presentes en `squad`)
// {uid} en path/body = id del usuario autenticado.
const ZERO = '00000000-0000-0000-0000-000000000000';
const NOROW = { Prefer: 'return=representation' };
const S = (suite, list) => list.map((c) => ({ suite, ...c }));

module.exports = [
  ...S('a-auth', [
    { id: 'TC-API10', name: 'TC-API10 Sin apikey se rechaza', role: 'Anónimo', method: 'GET', path: '/rest/v1/events?select=id', auth: 'none', status: [401] },
    { id: 'TC-API11', name: 'TC-API11 Login con contraseña incorrecta falla', role: 'Anónimo', method: 'POST', path: '/auth/v1/token?grant_type=password', body: { email: 'qa.player.mad@example.com', password: 'contraseña-incorrecta' }, status: [400], errorCode: 'invalid_credentials' },
    { id: 'TC-API12', name: 'TC-API12 Login correcto devuelve token', role: 'Jugador MAD', method: 'POST', path: '/auth/v1/token?grant_type=password', login: 'player_mad', status: [200], token: true },
    { id: 'TC-API05', name: 'TC-API05 Anónimo no lee perfiles', role: 'Anónimo', method: 'GET', path: '/rest/v1/profiles?select=id', status: [401, 403] },
    { id: 'TC-API18', name: 'TC-API18 Jugador MAD lee su propio perfil', role: 'Jugador MAD', method: 'GET', path: '/rest/v1/profiles?select=nickname,app_role&id=eq.{uid}', auth: 'player_mad', status: [200], hasValue: { path: '0.app_role', value: 'player' } },
    { id: 'TC-API19', name: 'TC-API19 Bloqueado lee su perfil y figura bloqueado', role: 'Bloqueado', method: 'GET', path: '/rest/v1/profiles?select=nickname,is_blocked&id=eq.{uid}', auth: 'blocked', status: [200], hasValue: { path: '0.is_blocked', value: true } },
    { id: 'TC-API20', name: 'TC-API20 Usuario sin equipo no ve partidas', role: 'Sin equipo', method: 'GET', path: '/rest/v1/events?select=id', auth: 'sinequipo', status: [200], empty: true },
    { id: 'TC-API21', name: 'TC-API21 Un jugador no se asciende a super admin', role: 'Jugador MAD', method: 'PATCH', path: '/rest/v1/profiles?id=eq.{uid}&select=app_role,is_super_admin', auth: 'player_mad', body: { app_role: 'super_admin', is_super_admin: true }, headers: NOROW, notEscalated: true },
  ]),
  ...S('b-eventos', [
    { id: 'TC-API01', name: 'TC-API01 Anónimo no ve partidas (RLS)', role: 'Anónimo', method: 'GET', path: '/rest/v1/events?select=id', status: [200], empty: true },
    { id: 'TC-API06', name: 'TC-API06 Anónimo no crea partidas', role: 'Anónimo', method: 'POST', path: '/rest/v1/events', body: { title: 'x', date: '2030-01-01', hour: '10:00', field: 'x' }, status: [401, 403] },
    { id: 'TC-API08', name: 'TC-API08 Anónimo no borra partidas', role: 'Anónimo', method: 'DELETE', path: '/rest/v1/events?id=not.is.null', status: [401, 403] },
    { id: 'TC-API13', name: 'TC-API13 Jugador MAD solo ve partidas de su equipo', role: 'Jugador MAD', method: 'GET', path: '/rest/v1/events?select=id,squad', auth: 'player_mad', status: [200], nonEmpty: true, eachEq: { path: 'squad', value: 'MAD Irregulars' } },
    { id: 'TC-API14', name: 'TC-API14 Jugador FOE no ve partidas de MAD', role: 'Jugador FOE', method: 'GET', path: '/rest/v1/events?select=id,squad', auth: 'player_foe', status: [200], nonEmpty: true, eachEq: { path: 'squad', value: 'FOE' } },
    { id: 'TC-API15', name: 'TC-API15 Bloqueado no ve ninguna partida', role: 'Bloqueado', method: 'GET', path: '/rest/v1/events?select=id', auth: 'blocked', status: [200], empty: true },
    { id: 'TC-API16', name: 'TC-API16 Jugador MAD no crea partidas en FOE', role: 'Jugador MAD', method: 'POST', path: '/rest/v1/events', auth: 'player_mad', body: { title: 'QA intrusa', squad: 'FOE', date: '2030-01-01', hour: '10:00', field: 'x', event_type: 'normal' }, status: [401, 403] },
    { id: 'TC-API17', name: 'TC-API17 Super admin ve partidas de ambos equipos', role: 'Super Admin', method: 'GET', path: '/rest/v1/events?select=id,squad', auth: 'superadmin', status: [200], hasSquads: ['MAD Irregulars', 'FOE'] },
    { id: 'TC-API22', name: 'TC-API22 Jugador FOE no edita partidas', role: 'Jugador FOE', method: 'PATCH', path: '/rest/v1/events?squad=eq.FOE&select=id', auth: 'player_foe', body: { title: 'hackeada' }, headers: NOROW, blocked: true },
    { id: 'TC-API23', name: 'TC-API23 Admin MAD no borra partidas de FOE', role: 'Admin MAD', method: 'DELETE', path: '/rest/v1/events?squad=eq.FOE&select=id', auth: 'admin_mad', headers: NOROW, blocked: true },
  ]),
  ...S('c-inscripciones', [
    { id: 'TC-API02', name: 'TC-API02 Anónimo no ve inscripciones (RLS)', role: 'Anónimo', method: 'GET', path: '/rest/v1/event_registrations?select=id', status: [200], empty: true },
    { id: 'TC-API24', name: 'TC-API24 Anónimo no se inscribe', role: 'Anónimo', method: 'POST', path: '/rest/v1/event_registrations', body: { event_id: ZERO, profile_id: ZERO, team: 'x', role: 'y' }, status: [401, 403] },
    { id: 'TC-API25', name: 'TC-API25 Usuario sin equipo no ve inscripciones', role: 'Sin equipo', method: 'GET', path: '/rest/v1/event_registrations?select=id', auth: 'sinequipo', status: [200], empty: true },
    { id: 'TC-API26', name: 'TC-API26 Bloqueado no ve inscripciones', role: 'Bloqueado', method: 'GET', path: '/rest/v1/event_registrations?select=id', auth: 'blocked', status: [200], empty: true },
    { id: 'TC-API27', name: 'TC-API27 Jugador MAD solo ve inscripciones de partidas de MAD', role: 'Jugador MAD', method: 'GET', path: '/rest/v1/event_registrations?select=id,events(squad)', auth: 'player_mad', status: [200], eachEq: { path: 'events.squad', value: 'MAD Irregulars' } },
    { id: 'TC-API28', name: 'TC-API28 Jugador FOE no cancela inscripciones ajenas', role: 'Jugador FOE', method: 'DELETE', path: '/rest/v1/event_registrations?profile_id=neq.{uid}&select=id', auth: 'player_foe', headers: NOROW, blocked: true },
  ]),
  ...S('d-asistencia', [
    { id: 'TC-API29', name: 'TC-API29 Anónimo no marca asistencia', role: 'Anónimo', method: 'PATCH', path: '/rest/v1/event_registrations?attended=eq.false', body: { attended: true }, status: [401, 403] },
    { id: 'TC-API30', name: 'TC-API30 Jugador FOE no marca asistencia ajena', role: 'Jugador FOE', method: 'PATCH', path: '/rest/v1/event_registrations?profile_id=neq.{uid}&select=id', auth: 'player_foe', body: { attended: true }, headers: NOROW, blocked: true },
    { id: 'TC-API31', name: 'TC-API31 Jugador MAD no marca asistencia ajena', role: 'Jugador MAD', method: 'PATCH', path: '/rest/v1/event_registrations?profile_id=neq.{uid}&select=id', auth: 'player_mad', body: { attended: true }, headers: NOROW, blocked: true },
    { id: 'TC-API32', name: 'TC-API32 Super admin consulta la asistencia', role: 'Super Admin', method: 'GET', path: '/rest/v1/event_registrations?select=id,attended', auth: 'superadmin', status: [200], isArray: true },
  ]),
  ...S('e-gobernanza', [
    { id: 'TC-API03', name: 'TC-API03 Anónimo no ve votaciones FOE (RLS)', role: 'Anónimo', method: 'GET', path: '/rest/v1/foe_polls?select=id', status: [200], empty: true },
    { id: 'TC-API04', name: 'TC-API04 Anónimo no ve faltas FOE (RLS)', role: 'Anónimo', method: 'GET', path: '/rest/v1/foe_infractions?select=id', status: [200], empty: true },
    { id: 'TC-API33', name: 'TC-API33 Jugador MAD no ve votaciones FOE', role: 'Jugador MAD', method: 'GET', path: '/rest/v1/foe_polls?select=id', auth: 'player_mad', status: [200], empty: true },
    { id: 'TC-API34', name: 'TC-API34 Jugador FOE sin cargo no ve votaciones de la Junta', role: 'Jugador FOE', method: 'GET', path: '/rest/v1/foe_polls?select=id', auth: 'player_foe', status: [200], empty: true },
    { id: 'TC-API35', name: 'TC-API35 Admin FOE de la Junta ve las votaciones', role: 'Admin FOE', method: 'GET', path: '/rest/v1/foe_polls?select=id,board', auth: 'admin_foe', status: [200], nonEmpty: true },
    { id: 'TC-API36', name: 'TC-API36 Jugador MAD no ve faltas FOE', role: 'Jugador MAD', method: 'GET', path: '/rest/v1/foe_infractions?select=id', auth: 'player_mad', status: [200], empty: true },
    { id: 'TC-API37', name: 'TC-API37 Jugador FOE no crea votaciones', role: 'Jugador FOE', method: 'POST', path: '/rest/v1/foe_polls', auth: 'player_foe', body: { board: 'junta_directiva', title: 'QA intrusa', topic_type: 'general', options: [] }, status: [401, 403] },
    { id: 'TC-API38', name: 'TC-API38 Jugador FOE no borra votaciones', role: 'Jugador FOE', method: 'DELETE', path: '/rest/v1/foe_polls?id=not.is.null&select=id', auth: 'player_foe', headers: NOROW, blocked: true },
  ]),
  ...S('f-excedencias', [
    { id: 'TC-API07', name: 'TC-API07 Anónimo no crea excedencias', role: 'Anónimo', method: 'POST', path: '/rest/v1/player_leaves', body: { profile_id: ZERO, start_date: '2030-01-01', end_date: '2030-01-10' }, status: [401, 403] },
    { id: 'TC-API39', name: 'TC-API39 Anónimo no lee excedencias', role: 'Anónimo', method: 'GET', path: '/rest/v1/player_leaves?select=id', status: [200], empty: true },
    { id: 'TC-API40', name: 'TC-API40 Bloqueado no lee excedencias', role: 'Bloqueado', method: 'GET', path: '/rest/v1/player_leaves?select=id', auth: 'blocked', status: [200], empty: true },
    { id: 'TC-API41', name: 'TC-API41 Jugador FOE consulta excedencias', role: 'Jugador FOE', method: 'GET', path: '/rest/v1/player_leaves?select=id,status', auth: 'player_foe', status: [200], isArray: true },
    { id: 'TC-API42', name: 'TC-API42 Jugador FOE no aprueba excedencias ajenas', role: 'Jugador FOE', method: 'PATCH', path: '/rest/v1/player_leaves?profile_id=neq.{uid}&select=id', auth: 'player_foe', body: { status: 'approved' }, headers: NOROW, blocked: true },
  ]),
  ...S('g-jugadores', [
    { id: 'TC-API43', name: 'TC-API43 Super admin ve perfiles de ambos equipos', role: 'Super Admin', method: 'GET', path: '/rest/v1/profiles?select=squad', auth: 'superadmin', status: [200], hasSquads: ['MAD Irregulars', 'FOE'] },
    { id: 'TC-API44', name: 'TC-API44 Jugador MAD solo ve perfiles de su unidad', role: 'Jugador MAD', method: 'GET', path: '/rest/v1/profiles?select=nickname,squad', auth: 'player_mad', status: [200], nonEmpty: true, eachEq: { path: 'squad', value: 'MAD Irregulars' } },
    { id: 'TC-API45', name: 'TC-API45 Jugador FOE no ve perfiles de MAD', role: 'Jugador FOE', method: 'GET', path: '/rest/v1/profiles?select=nickname&nickname=eq.QA%20Jugador%20MAD', auth: 'player_foe', status: [200], empty: true },
    { id: 'TC-API46', name: 'TC-API46 Jugador MAD no cambia el rol de otros', role: 'Jugador MAD', method: 'PATCH', path: '/rest/v1/profiles?id=neq.{uid}&select=id', auth: 'player_mad', body: { app_role: 'admin' }, headers: NOROW, blocked: true },
    { id: 'TC-API47', name: 'TC-API47 Jugador MAD no bloquea a otros', role: 'Jugador MAD', method: 'PATCH', path: '/rest/v1/profiles?id=neq.{uid}&select=id', auth: 'player_mad', body: { is_blocked: true }, headers: NOROW, blocked: true },
  ]),
  ...S('h-calendario', [
    { id: 'TC-API48', name: 'TC-API48 Anónimo no ve fechas sin partida', role: 'Anónimo', method: 'GET', path: '/rest/v1/team_blackouts?select=id', status: [200], empty: true },
    { id: 'TC-API49', name: 'TC-API49 Anónimo no crea fechas sin partida', role: 'Anónimo', method: 'POST', path: '/rest/v1/team_blackouts', body: { squad: 'MAD Irregulars', start_date: '2030-01-01', end_date: '2030-01-02' }, status: [401, 403] },
    { id: 'TC-API50', name: 'TC-API50 Jugador MAD consulta fechas sin partida', role: 'Jugador MAD', method: 'GET', path: '/rest/v1/team_blackouts?select=id,squad', auth: 'player_mad', status: [200], isArray: true },
    { id: 'TC-API51', name: 'TC-API51 Jugador MAD no crea fechas sin partida', role: 'Jugador MAD', method: 'POST', path: '/rest/v1/team_blackouts', auth: 'player_mad', body: { squad: 'MAD Irregulars', start_date: '2030-01-01', end_date: '2030-01-02' }, status: [401, 403] },
    { id: 'TC-API52', name: 'TC-API52 Jugador MAD no borra fechas sin partida', role: 'Jugador MAD', method: 'DELETE', path: '/rest/v1/team_blackouts?id=not.is.null&select=id', auth: 'player_mad', headers: NOROW, blocked: true },
  ]),
  ...S('i-normas', [
    { id: 'TC-API53', name: 'TC-API53 Anónimo no lee documentos del equipo', role: 'Anónimo', method: 'GET', path: '/rest/v1/team_documents?select=id', status: [200], empty: true },
    { id: 'TC-API54', name: 'TC-API54 Jugador MAD consulta los documentos de su equipo', role: 'Jugador MAD', method: 'GET', path: '/rest/v1/team_documents?select=id,squad', auth: 'player_mad', status: [200], isArray: true },
    { id: 'TC-API55', name: 'TC-API55 Jugador MAD no sube documentos', role: 'Jugador MAD', method: 'POST', path: '/rest/v1/team_documents', auth: 'player_mad', body: { squad: 'MAD Irregulars', category: 'bof', title: 'QA', file_url: 'x', file_path: 'x' }, status: [401, 403] },
    { id: 'TC-API56', name: 'TC-API56 Jugador MAD no borra documentos', role: 'Jugador MAD', method: 'DELETE', path: '/rest/v1/team_documents?id=not.is.null&select=id', auth: 'player_mad', headers: NOROW, blocked: true },
    { id: 'TC-API57', name: 'TC-API57 El bucket de normas es privado', role: 'Anónimo', method: 'GET', path: '/storage/v1/object/public/team-documents/qa-no-existe.pdf', status: [400, 404] },
    { id: 'TC-API58', name: 'TC-API58 El ping keep_alive responde', role: 'Anónimo', method: 'GET', path: '/rest/v1/keep_alive?select=id&id=eq.1', status: [200], nonEmpty: true },
  ]),
];
