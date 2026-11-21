// Genera qa-jmeter/plan.jmx y qa-jmeter/cases.json (umbrales por caso). Uso: node gen-jmeter.js <qa-jmeter>
const fs = require('fs'); const path = require('path');
const dir = process.argv[2];
const key = fs.readFileSync(process.env.ANON_FILE, 'utf8').trim();
const emails = { superadmin: 'qa.superadmin@example.com', admin_foe: 'qa.admin.foe@example.com', player_foe: 'qa.player.foe@example.com', player_mad: 'qa.player.mad@example.com' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// suite -> casos { id, name, role, user|null, path, limit(ms p95) }
const suites = {
  'a-auth': [
    { id: 'PERF-01', name: 'Login por contraseña', role: 'Jugador MAD', login: 'player_mad', limit: 1500 },
    { id: 'PERF-02', name: 'Lectura del propio perfil', role: 'Jugador MAD', user: 'player_mad', path: '/rest/v1/profiles?select=nickname,app_role&limit=1', limit: 1200 },
  ],
  'b-eventos': [
    { id: 'PERF-03', name: 'Partidas visibles para un anónimo (RLS)', role: 'Anónimo', user: null, path: '/rest/v1/events?select=id', limit: 800 },
    { id: 'PERF-04', name: 'Partidas del jugador MAD', role: 'Jugador MAD', user: 'player_mad', path: '/rest/v1/events?select=id,title,squad,date', limit: 1200 },
    { id: 'PERF-05', name: 'Partidas del super admin', role: 'Super Admin', user: 'superadmin', path: '/rest/v1/events?select=*', limit: 1500 },
  ],
  'c-inscripciones': [
    { id: 'PERF-06', name: 'Inscripciones del jugador MAD', role: 'Jugador MAD', user: 'player_mad', path: '/rest/v1/event_registrations?select=id,status,team', limit: 1200 },
    { id: 'PERF-07', name: 'Inscripciones con su partida embebida', role: 'Super Admin', user: 'superadmin', path: '/rest/v1/event_registrations?select=id,events(title,squad)', limit: 1500 },
  ],
  'd-asistencia': [
    { id: 'PERF-08', name: 'Asistencia consultada por el super admin', role: 'Super Admin', user: 'superadmin', path: '/rest/v1/event_registrations?select=id,attended,profile_id', limit: 1500 },
  ],
  'e-gobernanza': [
    { id: 'PERF-09', name: 'Votaciones de la Junta (admin FOE)', role: 'Admin FOE', user: 'admin_foe', path: '/rest/v1/foe_polls?select=id,title,status', limit: 1200 },
    { id: 'PERF-10', name: 'Faltas FOE (jugador FOE)', role: 'Jugador FOE', user: 'player_foe', path: '/rest/v1/foe_infractions?select=id,severity,status', limit: 1200 },
  ],
  'f-excedencias': [
    { id: 'PERF-11', name: 'Excedencias consultadas por un jugador FOE', role: 'Jugador FOE', user: 'player_foe', path: '/rest/v1/player_leaves?select=id,status,start_date,end_date', limit: 1200 },
  ],
  'g-jugadores': [
    { id: 'PERF-12', name: 'Perfiles vistos por el super admin', role: 'Super Admin', user: 'superadmin', path: '/rest/v1/profiles?select=id,nickname,squad,app_role', limit: 1500 },
    { id: 'PERF-13', name: 'Perfiles de la unidad del jugador MAD', role: 'Jugador MAD', user: 'player_mad', path: '/rest/v1/profiles?select=id,nickname,squad', limit: 1200 },
  ],
  'h-calendario': [
    { id: 'PERF-14', name: 'Fechas sin partida del jugador MAD', role: 'Jugador MAD', user: 'player_mad', path: '/rest/v1/team_blackouts?select=id,squad,start_date,end_date', limit: 1200 },
  ],
  'i-normas': [
    { id: 'PERF-15', name: 'Documentos del equipo (jugador MAD)', role: 'Jugador MAD', user: 'player_mad', path: '/rest/v1/team_documents?select=id,title,category', limit: 1200 },
    { id: 'PERF-16', name: 'Ping keep_alive', role: 'Anónimo', user: null, path: '/rest/v1/keep_alive?select=id&id=eq.1', limit: 800 },
  ],
  // Demo de fallos: umbrales irreales (fallan a propósito) para enseñar cómo sale un incumplimiento de rendimiento.
  'j-demo-fallos': [
    { id: 'PERF-17', name: 'Lectura del perfil en menos de 20 ms (umbral irreal)', role: 'Jugador MAD', user: 'player_mad', path: '/rest/v1/profiles?select=nickname&limit=1', limit: 20 },
    { id: 'PERF-18', name: 'Partidas del super admin en menos de 30 ms (umbral irreal)', role: 'Super Admin', user: 'superadmin', path: '/rest/v1/events?select=id,squad', limit: 30 },
    { id: 'PERF-19', name: 'Ping keep_alive en menos de 10 ms (umbral irreal)', role: 'Anónimo', user: null, path: '/rest/v1/keep_alive?select=id&id=eq.1', limit: 10 },
  ],
};

const label = (c) => `${c.id} ${c.name}`;
const hdr = (h) => `<HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="Cabeceras" enabled="true"><collectionProp name="HeaderManager.headers">${Object.entries(h).map(([k, v]) => `<elementProp name="" elementType="Header"><stringProp name="Header.name">${esc(k)}</stringProp><stringProp name="Header.value">${esc(v)}</stringProp></elementProp>`).join('')}</collectionProp></HeaderManager><hashTree/>`;
const code200 = `<ResponseAssertion guiclass="AssertionGui" testclass="ResponseAssertion" testname="HTTP 200" enabled="true"><collectionProp name="Asserion.test_strings"><stringProp name="1">200</stringProp></collectionProp><stringProp name="Assertion.test_field">Assertion.response_code</stringProp><boolProp name="Assertion.assume_success">false</boolProp><intProp name="Assertion.test_type">8</intProp></ResponseAssertion><hashTree/>`;
const sampler = (name, method, p, body, children) => `<HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="${esc(name)}" enabled="true"><boolProp name="HTTPSampler.postBodyRaw">${body ? 'true' : 'false'}</boolProp><elementProp name="HTTPsampler.Arguments" elementType="Arguments"><collectionProp name="Arguments.arguments">${body ? `<elementProp name="" elementType="HTTPArgument"><boolProp name="HTTPArgument.always_encode">false</boolProp><stringProp name="Argument.value">${esc(body)}</stringProp><stringProp name="Argument.metadata">=</stringProp></elementProp>` : ''}</collectionProp></elementProp><stringProp name="HTTPSampler.path">${esc(p)}</stringProp><stringProp name="HTTPSampler.method">${method}</stringProp><boolProp name="HTTPSampler.follow_redirects">true</boolProp><boolProp name="HTTPSampler.use_keepalive">true</boolProp></HTTPSamplerProxy><hashTree>${children}</hashTree>`;
const ifc = (name, cond, inner) => `<IfController guiclass="IfControllerPanel" testclass="IfController" testname="${esc(name)}" enabled="true"><stringProp name="IfController.condition">${esc(cond)}</stringProp><boolProp name="IfController.evaluateAll">false</boolProp><boolProp name="IfController.useExpression">true</boolProp></IfController><hashTree>${inner}</hashTree>`;
const once = (inner) => `<OnceOnlyController guiclass="OnceOnlyControllerGui" testclass="OnceOnlyController" testname="Una vez por usuario virtual" enabled="true"/><hashTree>${inner}</hashTree>`;
const HAS_PWD = '${__jexl3("${__P(qa_password,)}" != "")}';
const loginBody = (u) => JSON.stringify({ email: emails[u], password: '${__P(qa_password,)}' });
const baseHdr = { apikey: '${__P(anon_key,' + key + ')}', 'Content-Type': 'application/json' };
const tokenExtractor = `<JSONPostProcessor guiclass="JSONPostProcessorGui" testclass="JSONPostProcessor" testname="token" enabled="true"><stringProp name="JSONPostProcessor.referenceNames">token</stringProp><stringProp name="JSONPostProcessor.jsonPathExprs">$.access_token</stringProp><stringProp name="JSONPostProcessor.match_numbers">1</stringProp><stringProp name="JSONPostProcessor.defaultValues">SIN_LOGIN</stringProp></JSONPostProcessor><hashTree/>`;
const saveToken = (u) => `<JSR223PostProcessor guiclass="TestBeanGUI" testclass="JSR223PostProcessor" testname="guardar token" enabled="true"><stringProp name="scriptLanguage">groovy</stringProp><stringProp name="parameters"></stringProp><stringProp name="filename"></stringProp><stringProp name="cacheKey">true</stringProp><stringProp name="script">props.put("tok_${u}", vars.get("token"))</stringProp></JSR223PostProcessor><hashTree/>`;
const loginSampler = (name, u, extra) => sampler(name, 'POST', '/auth/v1/token?grant_type=password', loginBody(u), code200 + tokenExtractor + extra);

// Setup: un login por usuario (4 en total por ejecución, lejos del límite de 30 cada 5 min de Supabase Auth)
const setup = `<SetupThreadGroup guiclass="SetupThreadGroupGui" testclass="SetupThreadGroup" testname="Login de usuarios (una vez por ejecución)" enabled="true"><stringProp name="ThreadGroup.on_sample_error">continue</stringProp><elementProp name="ThreadGroup.main_controller" elementType="LoopController" guiclass="LoopControlPanel" testclass="LoopController" enabled="true"><boolProp name="LoopController.continue_forever">false</boolProp><stringProp name="LoopController.loops">1</stringProp></elementProp><stringProp name="ThreadGroup.num_threads">1</stringProp><stringProp name="ThreadGroup.ramp_time">1</stringProp></SetupThreadGroup><hashTree>${hdr(baseHdr)}${ifc('Solo con QA_PASSWORD', HAS_PWD, Object.keys(emails).map((u) => loginSampler(`setup login ${u}`, u, saveToken(u))).join(''))}</hashTree>`;

const suiteBlocks = Object.entries(suites).map(([s, cases]) => {
  const inner = cases.map((c) => {
    if (c.login) return ifc('Solo con QA_PASSWORD', HAS_PWD, once(hdr(baseHdr) + loginSampler(label(c), c.login, '')));
    const h = c.user ? hdr({ ...baseHdr, Authorization: `Bearer \${__P(tok_${c.user},)}` }) : hdr(baseHdr);
    const smp = sampler(label(c), 'GET', c.path, null, code200);
    return c.user ? ifc('Solo con QA_PASSWORD', HAS_PWD, h + smp) : h + smp;
  }).join('');
  return ifc(`Suite ${s}`, `\${__jexl3("\${__P(suites,all)}" == "all" || "\${__P(suites,all)}".contains("${s}"))}`, inner);
}).join('');

const jmx = `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3">
<hashTree>
<TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="Tactical Calendar - rendimiento API (staging)" enabled="true"><boolProp name="TestPlan.functional_mode">false</boolProp><boolProp name="TestPlan.serialize_threadgroups">false</boolProp><elementProp name="TestPlan.user_defined_variables" elementType="Arguments"><collectionProp name="Arguments.arguments"/></elementProp></TestPlan>
<hashTree>
<ConfigTestElement guiclass="HttpDefaultsGui" testclass="ConfigTestElement" testname="Valores por defecto HTTP" enabled="true"><elementProp name="HTTPsampler.Arguments" elementType="Arguments"><collectionProp name="Arguments.arguments"/></elementProp><stringProp name="HTTPSampler.domain">\${__P(host,rpxdxitntsmgcbbnuyox.supabase.co)}</stringProp><stringProp name="HTTPSampler.protocol">https</stringProp></ConfigTestElement><hashTree/>
${setup}
<ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="Usuarios virtuales" enabled="true"><stringProp name="ThreadGroup.on_sample_error">continue</stringProp><elementProp name="ThreadGroup.main_controller" elementType="LoopController" guiclass="LoopControlPanel" testclass="LoopController" enabled="true"><boolProp name="LoopController.continue_forever">false</boolProp><stringProp name="LoopController.loops">\${__P(loops,10)}</stringProp></elementProp><stringProp name="ThreadGroup.num_threads">\${__P(threads,5)}</stringProp><stringProp name="ThreadGroup.ramp_time">\${__P(rampup,5)}</stringProp><boolProp name="ThreadGroup.scheduler">false</boolProp></ThreadGroup>
<hashTree>
${suiteBlocks}
</hashTree>
</hashTree>
</hashTree>
</jmeterTestPlan>
`;
fs.writeFileSync(path.join(dir, 'plan.jmx'), jmx);
const cases = {};
Object.entries(suites).forEach(([s, list]) => list.forEach((c) => { cases[label(c)] = { suite: s, limit: c.limit, role: c.role }; }));
fs.writeFileSync(path.join(dir, 'cases.json'), JSON.stringify(cases, null, 2));
console.log('suites', Object.keys(suites).length, 'casos', Object.keys(cases).length);
