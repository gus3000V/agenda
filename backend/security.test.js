const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.ADMIN_PIN = 'test-only-long-admin-password';
const { app, pool } = require('./server');
// These HTTP tests must never contact the real database.
pool.query = async () => ({ rows: [], rowCount: 0 });
pool.connect = async () => { throw new Error('Database intentionally unavailable in tests'); };
let server, base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); await pool.end(); });
const send = (path, method = 'GET', body, token) => fetch(base + path, {
  method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) })
});

test('all administrative reads and writes require a session', async () => {
  for (const [method, path] of [['GET','horarios'], ['GET','pacientes'], ['POST','pacientes'], ['POST','horario'], ['POST','paciente-y-cita'], ['PUT','horario/1'], ['PUT','horario/1/estado'], ['DELETE','horario/1'], ['POST','series'], ['PUT','series/1/ocurrencias/2099-01-05'], ['POST','horario/1/serie'], ['GET','reporte?mes=2099-01']]) {
    assert.equal((await send(`/api/admin/${path}`, method, method === 'GET' ? undefined : {})).status, 401);
  }
  const legacy = await fetch(base + '/api/admin/horarios', { headers: { 'x-api-key': process.env.ADMIN_PIN } });
  assert.equal(legacy.status, 401);
});
test('login validates credentials and logout revokes the session', async () => {
  assert.equal((await send('/api/auth/login', 'POST', { pin: 'wrong' })).status, 401);
  const res = await send('/api/auth/login', 'POST', { pin: process.env.ADMIN_PIN });
  const { token } = await res.json();
  assert.equal(res.status, 200);
  assert.equal((await send('/api/admin/horarios', 'GET', undefined, token)).status, 200);
  assert.equal((await send('/api/admin/horario/abc', 'PUT', {}, token)).status, 400);
  assert.equal((await send('/api/auth/logout', 'POST', {}, token)).status, 204);
  assert.equal((await send('/api/admin/horarios', 'GET', undefined, token)).status, 401);
});
test('retired cron endpoints cannot mutate data', async () => {
  for (const route of ['duplicar-semana', 'mantenimiento-mensual']) {
    assert.equal((await send(`/api/cron/${route}`, 'POST', {}, 'undefined')).status, 410);
  }
});
test('public availability works anonymously without patient information', async () => {
  const res = await send('/api/public/disponibilidad?fecha=2099-10-15');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.disponibles));
  for (const slot of data.disponibles) assert.deepEqual(Object.keys(slot).sort(), ['estado', 'hora']);
  assert.equal((await send('/api/public/disponibilidad?fecha=2026-02-30')).status, 400);
});
test('public booking rejects malformed dates, past times, missing tutors and manipulated durations', async () => {
  const body = { nombre: 'Test', f_nacimiento: '2000-01-01', telefono: '12345678', inicio: '2099-10-15T09:00:00', final: '2099-10-15T09:45:00' };
  for (const change of [{ f_nacimiento: '2020-02-30' }, { inicio: '2000-01-01T09:00:00' }, { f_nacimiento: '2025-01-01' }, { final: '2099-10-15T18:00:00' }]) {
    assert.equal((await send('/api/public/solicitar', 'POST', { ...body, ...change })).status, 400);
  }
  assert.equal((await send('/api/public/solicitar', 'POST', body)).status, 503);
});
test('login attempts are throttled', async () => {
  let response;
  for (let i = 0; i < 11; i++) response = await send('/api/auth/login', 'POST', { pin: 'wrong' });
  assert.equal(response.status, 429);
});
