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
    { id: 'TC-A01', name: 'TC-A01 Sin apikey se rechaza', role: 'Anónimo', method: 'GET', path: '/rest/v1/events?select=id', auth: 'none', status: [401] },
    { id: 'TC-A02', name: 'TC-A02 Login con contraseña incorrecta falla', role: 'Anónimo', method: 'POST', path: '/auth/v1/token?grant_type=password', body: { email: 'qa.player.mad@example.com', password: 'contraseña-incorrecta' }, status: [400], errorCode: 'invalid_credentials' },
    { id: 'TC-A03', name: 'TC-A03 Login correcto devuelve token', role: 'Jugador MAD', method: 'POST', path: '/auth/v1/token?grant_type=password', login: 'player_mad', status: [200], token: true },
    { id: 'TC-A04', name: 'TC-A04 Anónimo no lee perfiles', role: 'Anónimo', method: 'GET', path: '/rest/v1/profiles?select=id', status: [401, 403] },
    { id: 'TC-A05', name: 'TC-A05 Jugador MAD lee su propio perfil', role: 'Jugador MAD', method: 'GET', path: '/rest/v1/profiles?select=nickname,app_role&id=eq.{uid}', auth: 'player_mad', status: [200], hasValue: { path: '0.app_role', value: 'player' } },
    { id: 'TC-A06', name: 'TC-A06 Bloqueado lee su perfil y figura bloqueado', role: 'Bloqueado', method: 'GET', path: '/rest/v1/profiles?select=nickname,is_blocked&id=eq.{uid}', auth: 'blocked', status: [200], hasValue: { path: '0.is_blocked', value: true } },
    { id: 'TC-A07', name: 'TC-A07 Usuario sin equipo no ve partidas', role: 'Sin equipo', method: 'GET', path: '/rest/v1/events?select=id', auth: 'sinequipo', status: [200], empty: true },
    { id: 'TC-A08', name: 'TC-A08 Un jugador no se asciende a super admin', role: 'Jugador MAD', method: 'PATCH', path: '/rest/v1/profiles?id=eq.{uid}&select=app_role,is_super_admin', auth: 'player_mad', body: { app_role: 'super_admin', is_super_admin: true }, headers: NOROW, notEscalated: true },
  ]),
  ...S('b-eventos', [
    { id: 'TC-B01', name: 'TC-B01 Anónimo no ve partidas (RLS)', role: 'Anónimo', method: 'GET', path: '/rest/v1/events?select=id', status: [200], empty: true },
    { id: 'TC-B02', name: 'TC-B02 Anónimo no crea partidas', role: 'Anónimo', method: 'POST', path: '/rest/v1/events', body: { title: 'x', date: '2030-01-01', hour: '10:00', field: 'x' }, status: [401, 403] },
    { id: 'TC-B03', name: 'TC-B03 Anónimo no borra partidas', role: 'Anónimo', method: 'DELETE', path: '/rest/v1/events?id=not.is.null', status: [401, 403] },
    { id: 'TC-B04', name: 'TC-B04 Jugador MAD solo ve partidas de su equipo', role: 'Jugador MAD', method: 'GET', path: '/rest/v1/events?select=id,squad', auth: 'player_mad', status: [200], nonEmpty: true, eachEq: { path: 'squad', value: 'MAD Irregulars' } },
    { id: 'TC-B05', name: 'TC-B05 Jugador FOE no ve partidas de MAD', role: 'Jugador FOE', method: 'GET', path: '/rest/v1/events?select=id,squad', auth: 'player_foe', status: [200], nonEmpty: true, eachEq: { path: 'squad', value: 'FOE' } },
    { id: 'TC-B06', name: 'TC-B06 Bloqueado no ve ninguna partida', role: 'Bloqueado', method: 'GET', path: '/rest/v1/events?select=id', auth: 'blocked', status: [200], empty: true },
    { id: 'TC-B07', name: 'TC-B07 Jugador MAD no crea partidas en FOE', role: 'Jugador MAD', method: 'POST', path: '/rest/v1/events', auth: 'player_mad', body: { title: 'QA intrusa', squad: 'FOE', date: '2030-01-01', hour: '10:00', field: 'x', event_type: 'normal' }, status: [401, 403] },
    { id: 'TC-B08', name: 'TC-B08 Super admin ve partidas de ambos equipos', role: 'Super Admin', method: 'GET', path: '/rest/v1/events?select=id,squad', auth: 'superadmin', status: [200], hasSquads: ['MAD Irregulars', 'FOE'] },
    { id: 'TC-B09', name: 'TC-B09 Jugador FOE no edita partidas', role: 'Jugador FOE', method: 'PATCH', path: '/rest/v1/events?squad=eq.FOE&select=id', auth: 'player_foe', body: { title: 'hackeada' }, headers: NOROW, blocked: true },
    { id: 'TC-B10', name: 'TC-B10 Admin MAD no borra partidas de FOE', role: 'Admin MAD', method: 'DELETE', path: '/rest/v1/events?squad=eq.FOE&select=id', auth: 'admin_mad', headers: NOROW, blocked: true },
  ]),
  ...S('c-inscripciones', [
    { id: 'TC-C01', name: 'TC-C01 Anónimo no ve inscripciones (RLS)', role: 'Anónimo', method: 'GET', path: '/rest/v1/event_registrations?select=id', status: [200], empty: true },
    { id: 'TC-C02', name: 'TC-C02 Anónimo no se inscribe', role: 'Anónimo', method: 'POST', path: '/rest/v1/event_registrations', body: { event_id: ZERO, profile_id: ZERO, team: 'x', role: 'y' }, status: [401, 403] },
    { id: 'TC-C03', name: 'TC-C03 Usuario sin equipo no ve inscripciones', role: 'Sin equipo', method: 'GET', path: '/rest/v1/event_registrations?select=id', auth: 'sinequipo', status: [200], empty: true },
    { id: 'TC-C04', name: 'TC-C04 Bloqueado no ve inscripciones', role: 'Bloqueado', method: 'GET', path: '/rest/v1/event_registrations?select=id', auth: 'blocked', status: [200], empty: true },
    { id: 'TC-C05', name: 'TC-C05 Jugador MAD solo ve inscripciones de partidas de MAD', role: 'Jugador MAD', method: 'GET', path: '/rest/v1/event_registrations?select=id,events(squad)', auth: 'player_mad', status: [200], eachEq: { path: 'events.squad', value: 'MAD Irregulars' } },
    { id: 'TC-C06', name: 'TC-C06 Jugador FOE no cancela inscripciones ajenas', role: 'Jugador FOE', method: 'DELETE', path: '/rest/v1/event_registrations?profile_id=neq.{uid}&select=id', auth: 'player_foe', headers: NOROW, blocked: true },
  ]),
  ...S('d-asistencia', [
    { id: 'TC-D01', name: 'TC-D01 Anónimo no marca asistencia', role: 'Anónimo', method: 'PATCH', path: '/rest/v1/event_registrations?attended=eq.false', body: { attended: true }, status: [401, 403] },
    { id: 'TC-D02', name: 'TC-D02 Jugador FOE no marca asistencia ajena', role: 'Jugador FOE', method: 'PATCH', path: '/rest/v1/event_registrations?profile_id=neq.{uid}&select=id', auth: 'player_foe', body: { attended: true }, headers: NOROW, blocked: true },
    { id: 'TC-D03', name: 'TC-D03 Jugador MAD no marca asistencia ajena', role: 'Jugador MAD', method: 'PATCH', path: '/rest/v1/event_registrations?profile_id=neq.{uid}&select=id', auth: 'player_mad', body: { attended: true }, headers: NOROW, blocked: true },
    { id: 'TC-D04', name: 'TC-D04 Super admin consulta la asistencia', role: 'Super Admin', method: 'GET', path: '/rest/v1/event_registrations?select=id,attended', auth: 'superadmin', status: [200], isArray: true },
  ]),
  ...S('e-gobernanza', [
    { id: 'TC-E01', name: 'TC-E01 Anónimo no ve votaciones FOE (RLS)', role: 'Anónimo', method: 'GET', path: '/rest/v1/foe_polls?select=id', status: [200], empty: true },
    { id: 'TC-E02', name: 'TC-E02 Anónimo no ve faltas FOE (RLS)', role: 'Anónimo', method: 'GET', path: '/rest/v1/foe_infractions?select=id', status: [200], empty: true },
    { id: 'TC-E03', name: 'TC-E03 Jugador MAD no ve votaciones FOE', role: 'Jugador MAD', method: 'GET', path: '/rest/v1/foe_polls?select=id', auth: 'player_mad', status: [200], empty: true },
    { id: 'TC-E04', name: 'TC-E04 Jugador FOE sin cargo no ve votaciones de la Junta', role: 'Jugador FOE', method: 'GET', path: '/rest/v1/foe_polls?select=id', auth: 'player_foe', status: [200], empty: true },
    { id: 'TC-E05', name: 'TC-E05 Admin FOE de la Junta ve las votaciones', role: 'Admin FOE', method: 'GET', path: '/rest/v1/foe_polls?select=id,board', auth: 'admin_foe', status: [200], nonEmpty: true },
    { id: 'TC-E06', name: 'TC-E06 Jugador MAD no ve faltas FOE', role: 'Jugador MAD', method: 'GET', path: '/rest/v1/foe_infractions?select=id', auth: 'player_mad', status: [200], empty: true },
    { id: 'TC-E07', name: 'TC-E07 Jugador FOE no crea votaciones', role: 'Jugador FOE', method: 'POST', path: '/rest/v1/foe_polls', auth: 'player_foe', body: { board: 'junta_directiva', title: 'QA intrusa', topic_type: 'general', options: [] }, status: [401, 403] },
    { id: 'TC-E08', name: 'TC-E08 Jugador FOE no borra votaciones', role: 'Jugador FOE', method: 'DELETE', path: '/rest/v1/foe_polls?id=not.is.null&select=id', auth: 'player_foe', headers: NOROW, blocked: true },
  ]),
  ...S('f-excedencias', [
    { id: 'TC-F01', name: 'TC-F01 Anónimo no crea excedencias', role: 'Anónimo', method: 'POST', path: '/rest/v1/player_leaves', body: { profile_id: ZERO, start_date: '2030-01-01', end_date: '2030-01-10' }, status: [401, 403] },
    { id: 'TC-F02', name: 'TC-F02 Anónimo no lee excedencias', role: 'Anónimo', method: 'GET', path: '/rest/v1/player_leaves?select=id', status: [200], empty: true },
    { id: 'TC-F03', name: 'TC-F03 Bloqueado no lee excedencias', role: 'Bloqueado', method: 'GET', path: '/rest/v1/player_leaves?select=id', auth: 'blocked', status: [200], empty: true },
    { id: 'TC-F04', name: 'TC-F04 Jugador FOE consulta excedencias', role: 'Jugador FOE', method: 'GET', path: '/rest/v1/player_leaves?select=id,status', auth: 'player_foe', status: [200], isArray: true },
    { id: 'TC-F05', name: 'TC-F05 Jugador FOE no aprueba excedencias ajenas', role: 'Jugador FOE', method: 'PATCH', path: '/rest/v1/player_leaves?profile_id=neq.{uid}&select=id', auth: 'player_foe', body: { status: 'approved' }, headers: NOROW, blocked: true },
  ]),
  ...S('g-jugadores', [
    { id: 'TC-G01', name: 'TC-G01 Super admin ve perfiles de ambos equipos', role: 'Super Admin', method: 'GET', path: '/rest/v1/profiles?select=squad', auth: 'superadmin', status: [200], hasSquads: ['MAD Irregulars', 'FOE'] },
    { id: 'TC-G02', name: 'TC-G02 Jugador MAD solo ve perfiles de su unidad', role: 'Jugador MAD', method: 'GET', path: '/rest/v1/profiles?select=nickname,squad', auth: 'player_mad', status: [200], nonEmpty: true, eachEq: { path: 'squad', value: 'MAD Irregulars' } },
    { id: 'TC-G03', name: 'TC-G03 Jugador FOE no ve perfiles de MAD', role: 'Jugador FOE', method: 'GET', path: '/rest/v1/profiles?select=nickname&nickname=eq.QA%20Jugador%20MAD', auth: 'player_foe', status: [200], empty: true },
    { id: 'TC-G04', name: 'TC-G04 Jugador MAD no cambia el rol de otros', role: 'Jugador MAD', method: 'PATCH', path: '/rest/v1/profiles?id=neq.{uid}&select=id', auth: 'player_mad', body: { app_role: 'admin' }, headers: NOROW, blocked: true },
    { id: 'TC-G05', name: 'TC-G05 Jugador MAD no bloquea a otros', role: 'Jugador MAD', method: 'PATCH', path: '/rest/v1/profiles?id=neq.{uid}&select=id', auth: 'player_mad', body: { is_blocked: true }, headers: NOROW, blocked: true },
  ]),
  ...S('h-calendario', [
    { id: 'TC-H01', name: 'TC-H01 Anónimo no ve fechas sin partida', role: 'Anónimo', method: 'GET', path: '/rest/v1/team_blackouts?select=id', status: [200], empty: true },
    { id: 'TC-H02', name: 'TC-H02 Anónimo no crea fechas sin partida', role: 'Anónimo', method: 'POST', path: '/rest/v1/team_blackouts', body: { squad: 'MAD Irregulars', start_date: '2030-01-01', end_date: '2030-01-02' }, status: [401, 403] },
    { id: 'TC-H03', name: 'TC-H03 Jugador MAD consulta fechas sin partida', role: 'Jugador MAD', method: 'GET', path: '/rest/v1/team_blackouts?select=id,squad', auth: 'player_mad', status: [200], isArray: true },
    { id: 'TC-H04', name: 'TC-H04 Jugador MAD no crea fechas sin partida', role: 'Jugador MAD', method: 'POST', path: '/rest/v1/team_blackouts', auth: 'player_mad', body: { squad: 'MAD Irregulars', start_date: '2030-01-01', end_date: '2030-01-02' }, status: [401, 403] },
    { id: 'TC-H05', name: 'TC-H05 Jugador MAD no borra fechas sin partida', role: 'Jugador MAD', method: 'DELETE', path: '/rest/v1/team_blackouts?id=not.is.null&select=id', auth: 'player_mad', headers: NOROW, blocked: true },
  ]),
  ...S('i-normas', [
    { id: 'TC-I01', name: 'TC-I01 Anónimo no lee documentos del equipo', role: 'Anónimo', method: 'GET', path: '/rest/v1/team_documents?select=id', status: [200], empty: true },
    { id: 'TC-I02', name: 'TC-I02 Jugador MAD consulta los documentos de su equipo', role: 'Jugador MAD', method: 'GET', path: '/rest/v1/team_documents?select=id,squad', auth: 'player_mad', status: [200], isArray: true },
    { id: 'TC-I03', name: 'TC-I03 Jugador MAD no sube documentos', role: 'Jugador MAD', method: 'POST', path: '/rest/v1/team_documents', auth: 'player_mad', body: { squad: 'MAD Irregulars', category: 'bof', title: 'QA', file_url: 'x', file_path: 'x' }, status: [401, 403] },
    { id: 'TC-I04', name: 'TC-I04 Jugador MAD no borra documentos', role: 'Jugador MAD', method: 'DELETE', path: '/rest/v1/team_documents?id=not.is.null&select=id', auth: 'player_mad', headers: NOROW, blocked: true },
    { id: 'TC-I05', name: 'TC-I05 El bucket de normas es privado', role: 'Anónimo', method: 'GET', path: '/storage/v1/object/public/team-documents/qa-no-existe.pdf', status: [400, 404] },
    { id: 'TC-I06', name: 'TC-I06 El ping keep_alive responde', role: 'Anónimo', method: 'GET', path: '/rest/v1/keep_alive?select=id&id=eq.1', status: [200], nonEmpty: true },
  ]),
];
