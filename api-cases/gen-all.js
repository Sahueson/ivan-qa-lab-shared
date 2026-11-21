// Genera, desde spec2.js, las suites de Newman, Bruno y Karate. Uso: node gen-all.js <raiz con qa-newman, qa-bruno, qa-karate>
const fs = require('fs'); const path = require('path');
const spec = require('./spec.js');
const root = process.argv[2];
const NL = '\n';
const emails = { superadmin: 'qa.superadmin@example.com', admin_mad: 'qa.admin.mad@example.com', admin_foe: 'qa.admin.foe@example.com', junta2: 'qa.junta2@example.com', player_foe: 'qa.player.foe@example.com', player_mad: 'qa.player.mad@example.com', blocked: 'qa.blocked@example.com', sinequipo: 'qa.sinequipo@example.com' };
const key = fs.readFileSync(process.env.ANON_FILE, 'utf8').trim();
const BASE = 'https://rpxdxitntsmgcbbnuyox.supabase.co';
const suites = [...new Set(spec.map((c) => c.suite))];
const needsPwd = (c) => !!(c.auth && c.auth !== 'none') || !!c.login;
const authed = (c) => !!(c.auth && c.auth !== 'none');
const mk = (p) => fs.mkdirSync(p, { recursive: true });
const write = (p, s) => { mk(path.dirname(p)); fs.writeFileSync(p, s); };
const rolesOf = {}; spec.forEach((c) => { rolesOf[c.id] = c.role; });
write(path.join(__dirname, 'roles.json'), JSON.stringify(rolesOf));

// ---- comprobaciones en JS (chai: Postman y Bruno) ----
const GET = "const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : Array.isArray(a) && !/^\\d+$/.test(k) ? a.map((x) => x == null ? x : x[k]) : a[k]), o);";
function chaiChecks(c, code, j) {
  const L = [];
  if (c.status) L.push(`expect(${JSON.stringify(c.status)}).to.include(${code});`);
  if (c.blocked) L.push(`expect([401, 403].includes(${code}) || ([200, 204].includes(${code}) && (!${j} || (Array.isArray(${j}) && ${j}.length === 0))), 'la operación debería estar bloqueada o no afectar a ninguna fila').to.equal(true);`);
  if (c.empty) L.push(`expect(${j}).to.be.an('array').that.is.empty;`);
  if (c.nonEmpty) L.push(`expect(${j}).to.be.an('array').that.is.not.empty;`);
  if (c.isArray) L.push(`expect(${j}).to.be.an('array');`);
  if (c.errorCode) L.push(`expect(${j}.error_code).to.equal(${JSON.stringify(c.errorCode)});`);
  if (c.token) L.push(`expect(${j}.access_token).to.be.a('string').that.is.not.empty;`);
  if (c.eachEq) L.push(`expect(${j}.every((e) => get(e, ${JSON.stringify(c.eachEq.path)}) === ${JSON.stringify(c.eachEq.value)}), 'todas las filas deben cumplir ${c.eachEq.path} = ${c.eachEq.value}').to.equal(true);`);
  if (c.hasValue) L.push(`expect(get(${j}, ${JSON.stringify(c.hasValue.path)})).to.equal(${JSON.stringify(c.hasValue.value)});`);
  if (c.hasSquads) L.push(`expect(${JSON.stringify(c.hasSquads)}.every((s) => ${j}.some((e) => e.squad === s)), 'faltan equipos en la respuesta').to.equal(true);`);
  if (c.notEscalated) L.push(`expect(${code} >= 400 || (Array.isArray(${j}) && (${j}.length === 0 || (${j}[0].app_role === 'player' && !${j}[0].is_super_admin))), 'el jugador no debe poder ascenderse').to.equal(true);`);
  return L;
}
const ind = (s, n = 2) => s.split(NL).map((l) => (l ? ' '.repeat(n) + l : l)).join(NL);
const urlOf = (c) => '{{base_url}}' + c.path.replace(/\{uid\}/g, '{{uid}}');
const bodyOf = (c) => (c.login ? { email: emails[c.login], password: '{{qa_password}}' } : c.body);

// ================= NEWMAN =================
{
  const items = suites.map((s) => ({
    name: s,
    item: spec.filter((c) => c.suite === s).map((c) => {
      const headers = [{ key: 'Content-Type', value: 'application/json' }];
      if (c.auth !== 'none') headers.push({ key: 'apikey', value: '{{anon_key}}' });
      if (authed(c)) headers.push({ key: 'Authorization', value: 'Bearer {{token}}' });
      Object.entries(c.headers || {}).forEach(([k, v]) => headers.push({ key: k, value: v }));
      const pre = [];
      if (authed(c)) pre.push(
        `const user = '${c.auth}';`,
        `const cached = pm.collectionVariables.get('tok_' + user);`,
        `if (cached) { pm.variables.set('token', cached); pm.variables.set('uid', pm.collectionVariables.get('uid_' + user)); }`,
        `else if (pm.environment.get('qa_password')) {`,
        `  const emails = ${JSON.stringify(emails)};`,
        `  pm.sendRequest({ url: pm.environment.get('base_url') + '/auth/v1/token?grant_type=password', method: 'POST',`,
        `    header: { apikey: pm.environment.get('anon_key'), 'Content-Type': 'application/json' },`,
        `    body: { mode: 'raw', raw: JSON.stringify({ email: emails[user], password: pm.environment.get('qa_password') }) } },`,
        `    (err, res) => { const ok = !err && res.code === 200; const tk = ok ? res.json().access_token : 'SIN_LOGIN'; const id = ok ? res.json().user.id : '';`,
        `      pm.variables.set('token', tk); pm.variables.set('uid', id);`,
        `      if (ok) { pm.collectionVariables.set('tok_' + user, tk); pm.collectionVariables.set('uid_' + user, id); } });`,
        `}`);
      const t = [];
      if (needsPwd(c)) t.push(`if (!pm.environment.get('qa_password')) { pm.test.skip(${JSON.stringify(c.name)}); return; }`);
      t.push(GET, `const j = (() => { try { return pm.response.json(); } catch (e) { return null; } })();`, `pm.test(${JSON.stringify(c.name)}, () => {`);
      if (authed(c)) t.push(`  pm.expect(pm.variables.get('token'), 'login previo').to.not.equal('SIN_LOGIN');`);
      chaiChecks(c, 'pm.response.code', 'j').forEach((l) => t.push('  ' + l.replace(/\bexpect\(/g, 'pm.expect(')));
      t.push('});');
      const req = { method: c.method, header: headers, url: urlOf(c) };
      const b = bodyOf(c);
      if (b) req.body = { mode: 'raw', raw: c.login ? JSON.stringify(b).replace('"{{qa_password}}"', '"{{qa_password}}"') : JSON.stringify(b) };
      const ev = [{ listen: 'test', script: { type: 'text/javascript', exec: t } }];
      if (pre.length) ev.unshift({ listen: 'prerequest', script: { type: 'text/javascript', exec: pre } });
      return { name: c.name, event: ev, request: req };
    }),
  }));
  const dir = path.join(root, 'qa-newman');
  write(path.join(dir, 'collections/api.postman_collection.json'), JSON.stringify({ info: { name: 'Tactical Calendar API (staging)', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' }, item: items }, null, 2));
  write(path.join(dir, 'environments/staging.postman_environment.json'), JSON.stringify({ name: 'staging', values: [{ key: 'base_url', value: BASE, enabled: true }, { key: 'anon_key', value: key, enabled: true }, { key: 'qa_password', value: '', enabled: true }] }, null, 2));
}

// ================= BRUNO =================
{
  const dir = path.join(root, 'qa-bruno');
  fs.rmSync(path.join(dir, 'api'), { recursive: true, force: true });
  write(path.join(dir, 'bruno.json'), JSON.stringify({ version: '1', name: 'Tactical Calendar API (staging)', type: 'collection', ignore: ['node_modules', '.git'] }, null, 2));
  write(path.join(dir, 'environments/staging.bru'), `vars {${NL}  base_url: ${BASE}${NL}  anon_key: ${key}${NL}}${NL}vars:secret [${NL}  qa_password${NL}]${NL}`);
  const seqIn = {};
  spec.forEach((c) => {
    const seq = (seqIn[c.suite] = (seqIn[c.suite] || 0) + 1);
    const hdr = [];
    if (c.auth !== 'none') hdr.push('apikey: {{anon_key}}');
    if (authed(c)) hdr.push('Authorization: Bearer {{token}}');
    Object.entries(c.headers || {}).forEach(([k, v]) => hdr.push(`${k}: ${v}`));
    const b = bodyOf(c);
    let out = `meta {${NL}  name: ${c.name}${NL}  type: http${NL}  seq: ${seq}${NL}}${NL}${NL}`;
    out += `${c.method.toLowerCase()} {${NL}  url: ${urlOf(c)}${NL}  body: ${b ? 'json' : 'none'}${NL}  auth: none${NL}}${NL}${NL}`;
    if (hdr.length) out += `headers {${NL}${ind(hdr.join(NL))}${NL}}${NL}${NL}`;
    if (b) out += `body:json {${NL}${ind(JSON.stringify(b))}${NL}}${NL}${NL}`;
    if (needsPwd(c)) {
      const pre = ["if (!bru.getEnvVar('qa_password')) { bru.runner.skipRequest(); return; }"];
      if (authed(c)) pre.push(
        "const user = '" + c.auth + "';",
        "if (bru.getVar('tok_' + user)) { bru.setVar('token', bru.getVar('tok_' + user)); bru.setVar('uid', bru.getVar('uid_' + user)); return; }",
        "const axios = require('axios');",
        'const emails = ' + JSON.stringify(emails) + ';',
        "let token = 'SIN_LOGIN', uid = '';",
        'try {',
        "  const r = await axios.post(bru.getEnvVar('base_url') + '/auth/v1/token?grant_type=password',",
        "    { email: emails[user], password: bru.getEnvVar('qa_password') },",
        "    { headers: { apikey: bru.getEnvVar('anon_key') } });",
        '  token = r.data.access_token; uid = r.data.user.id;',
        "  bru.setVar('tok_' + user, token); bru.setVar('uid_' + user, uid);",
        "} catch (e) { token = 'SIN_LOGIN'; }",
        "bru.setVar('token', token);", "bru.setVar('uid', uid);");
      out += `script:pre-request {${NL}${ind(pre.join(NL))}${NL}}${NL}${NL}`;
    }
    const body = [GET];
    if (authed(c)) body.push("expect(bru.getVar('token'), 'login previo').to.not.equal('SIN_LOGIN');");
    body.push(...chaiChecks(c, 'res.status', 'res.body'));
    out += `tests {${NL}${ind(`test(${JSON.stringify(c.name)}, function () {${NL}${ind(body.join(NL))}${NL}});`)}${NL}}${NL}`;
    write(path.join(dir, 'api', c.suite, `${c.id}.bru`), out);
  });
}

// ================= KARATE =================
{
  const dir = path.join(root, 'qa-karate');
  fs.rmSync(path.join(dir, 'features'), { recursive: true, force: true });
  write(path.join(dir, 'features/login.feature'), `@ignore${NL}Feature: Login reutilizable (devuelve token y id de usuario)${NL}${NL}  Scenario:${NL}    Given url baseUrl + '/auth/v1/token?grant_type=password'${NL}    And header apikey = anonKey${NL}    And request { email: '#(email)', password: '#(qaPassword)' }${NL}    When method post${NL}    Then status 200${NL}    * def token = response.access_token${NL}    * def uid = response.user.id${NL}`);
  const users = Object.keys(emails);
  write(path.join(dir, 'features/sessions.feature'), '@ignore' + NL + 'Feature: Sesiones de los usuarios QA (se calculan una sola vez por ejecución)' + NL + NL + '  Scenario:' + NL +
    users.map((u) => "    * def " + u + " = call read('login.feature') { email: '" + emails[u] + "', qaPassword: '#(qaPassword)' }").join(NL) + NL +
    '    * def sessions = { ' + users.map((u) => u + ": '#(" + u + ")'").join(', ') + ' }' + NL);
  const fn = (c) => `karate.toJson(${JSON.stringify(c)})`;
  suites.forEach((s) => {
    let out = `Feature: ${s} · API del staging (RLS y roles)${NL}${NL}  Background:${NL}    * url baseUrl${NL}    * def check = read('helpers/check.js')${NL}${NL}`;
    spec.filter((c) => c.suite === s).forEach((c) => {
      const spec1 = { status: c.status, blocked: c.blocked, empty: c.empty, nonEmpty: c.nonEmpty, isArray: c.isArray, errorCode: c.errorCode, token: c.token, eachEq: c.eachEq, hasValue: c.hasValue, hasSquads: c.hasSquads, notEscalated: c.notEscalated };
      Object.keys(spec1).forEach((k) => spec1[k] === undefined && delete spec1[k]);
      out += `  ${needsPwd(c) ? '@auth' + NL + '  ' : ''}Scenario: ${c.name}${NL}`;
      if (needsPwd(c)) out += `    * if (!qaPassword) karate.abort()${NL}`;
      if (authed(c)) out += `    * def session = karate.callSingle('classpath:features/sessions.feature').sessions.${c.auth}${NL}`;
      const p = c.path.replace(/\{uid\}/g, "' + (typeof session !== 'undefined' ? session.uid : '') + '");
      out += `    Given url baseUrl + '${p}'${NL}`;
      if (c.auth !== 'none') out += `    And header apikey = anonKey${NL}`;
      if (authed(c)) out += `    And header Authorization = 'Bearer ' + session.token${NL}`;
      Object.entries(c.headers || {}).forEach(([k, v]) => { out += `    And header ${k} = '${v}'${NL}`; });
      const b = c.login ? { email: emails[c.login], password: '#(qaPassword)' } : c.body;
      if (b) out += `    * def reqBody = ${JSON.stringify(b).replace(/"#\(qaPassword\)"/, "'#(qaPassword)'")}${NL}    And request reqBody${NL}`;
      out += `    When method ${c.method.toLowerCase()}${NL}`;
      out += `    * def ev = ({ request: { method: '${c.method}', url: baseUrl + '${p}', body: ${b ? 'reqBody' : 'null'} }, response: { status: responseStatus, time_ms: responseTime, body: response } })${NL}    * karate.embed(karate.toString(ev), 'application/json')${NL}`;
      out += `    * def err = check(${JSON.stringify(spec1)}, responseStatus, response)${NL}    Then match err == ''${NL}${NL}`;
    });
    write(path.join(dir, 'features', `${s}.feature`), out);
  });
  write(path.join(dir, 'features/helpers/check.js'), `// Comprobaciones comunes de los casos de API. Devuelve '' si todo está bien o el motivo del fallo.
function(spec, status, body) {
  var get = function(o, p) {
    var parts = p.split('.'), cur = o;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return cur;
      var k = parts[i];
      if (Array.isArray(cur) && !/^\\d+$/.test(k)) { var out = []; for (var j = 0; j < cur.length; j++) out.push(cur[j] == null ? null : cur[j][k]); cur = out; }
      else cur = cur[k];
    }
    return cur;
  };
  var isArr = Array.isArray(body);
  var has = function(a, v) { for (var i = 0; i < a.length; i++) if (a[i] == v) return true; return false; };
  if (spec.status && !has(spec.status, status)) return 'status ' + status + ' no esperado ' + spec.status;
  if (spec.blocked && !(has([401, 403], status) || (has([200, 204], status) && (!body || (isArr && body.length == 0))))) return 'la operación debería estar bloqueada o no afectar a ninguna fila (status ' + status + ')';
  if (spec.empty && !(isArr && body.length == 0)) return 'se esperaba una lista vacía';
  if (spec.nonEmpty && !(isArr && body.length > 0)) return 'se esperaba una lista con filas';
  if (spec.isArray && !isArr) return 'se esperaba una lista';
  if (spec.errorCode && (!body || body.error_code != spec.errorCode)) return 'error_code distinto de ' + spec.errorCode;
  if (spec.token && (!body || !body.access_token)) return 'falta access_token';
  if (spec.eachEq) { for (var i = 0; i < body.length; i++) if (get(body[i], spec.eachEq.path) != spec.eachEq.value) return 'una fila no cumple ' + spec.eachEq.path + ' = ' + spec.eachEq.value; }
  if (spec.hasValue && get(body, spec.hasValue.path) != spec.hasValue.value) return 'valor distinto en ' + spec.hasValue.path;
  if (spec.hasSquads) { for (var s = 0; s < spec.hasSquads.length; s++) { var found = false; for (var i = 0; i < body.length; i++) if (body[i].squad == spec.hasSquads[s]) found = true; if (!found) return 'falta el equipo ' + spec.hasSquads[s]; } }
  if (spec.notEscalated && !(status >= 400 || (isArr && (body.length == 0 || (body[0].app_role == 'player' && !body[0].is_super_admin))))) return 'el jugador no debe poder ascenderse';
  return '';
}
`);
}
console.log('suites:', suites.join(','), 'casos:', spec.length);
