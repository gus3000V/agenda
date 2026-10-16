const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { createStore } = require('./schedule-store');
const r = require('./recurrence');
let db, pool, store;
const migration = fs.readFileSync(path.join(__dirname, 'migrations/001_recurring_appointments.sql'), 'utf8');
before(async () => {
  // An ephemeral database. Never reads DATABASE_URL and never opens a network connection.
  db = await PGlite.create();
  await db.exec(`CREATE TABLE paciente (id_paciente SERIAL PRIMARY KEY, nombre TEXT NOT NULL, f_nacimiento DATE NOT NULL, nombre_tutor TEXT, telefono TEXT);
    CREATE TABLE horario (id_horario SERIAL PRIMARY KEY, id_paciente INTEGER NOT NULL REFERENCES paciente, inicio TIMESTAMP NOT NULL,
      final TIMESTAMP NOT NULL, estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aceptado','rechazado')), especialidad VARCHAR(255) DEFAULT 'fonoaudiologia');
    INSERT INTO paciente(nombre,f_nacimiento) VALUES ('Paciente existente','1990-01-01');
    INSERT INTO horario(id_paciente,inicio,final,estado) VALUES (1,'2025-01-01 09:00','2025-01-01 09:45','aceptado');`);
  await db.exec(migration); await db.exec(migration);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM horario')).rows[0].n, 1);
  // PGlite has a single connection; queue transactions as a one-client pg Pool would.
  let queue = Promise.resolve();
  pool = {
    query: (...args) => db.query(...args),
    connect: async () => {
      const previous = queue; let release;
      queue = new Promise(resolve => { release = resolve; }); await previous;
      return { query: (...args) => db.query(...args), release };
    }
  };
  store = createStore(pool);
});
beforeEach(async () => {
  await db.exec('TRUNCATE horario, cita_excepcion, cita_serie, paciente RESTART IDENTITY CASCADE');
  await db.query("INSERT INTO paciente(nombre,f_nacimiento,telefono) VALUES ('Paciente de prueba','1990-01-01','12345678')");
});
after(async () => { await db?.close(); });
const base = { id_paciente: 1, inicio: '2099-01-05T09:00:00', especialidad: 'fonoaudiologia' };
const read = () => store.readRange('2099-01-01', '2099-02-01');

test('series expand without materializing rows and cosmetology stays individual', async () => {
  await store.createSeries(base);
  await store.createSingle({ ...base, inicio: '2099-01-06T11:00:00', especialidad: 'cosmetologia' });
  const rows = await read();
  assert.equal(rows.filter(h => h.recurrente).length, 4);
  assert.equal(rows.filter(h => h.especialidad === 'cosmetologia').length, 1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM horario')).rows[0].n, 1);
  await assert.rejects(store.createSeries({ ...base, especialidad: 'cosmetologia' }), { status: 400 });
});
test('one cancellation releases only that date; moving across months retains its original identity', async () => {
  const s = await store.createSeries(base);
  await store.changeOccurrence(s.id_serie, '2099-01-12', { action: 'cancel', scope: 'one' });
  await store.createSingle({ ...base, inicio: '2099-01-12T09:00:00' });
  await store.changeOccurrence(s.id_serie, '2099-01-19', { action: 'move', scope: 'one', inicio: '2099-02-03T11:00:00' });
  const rows = await read();
  assert.equal(rows.filter(h => h.recurrente).length, 2);
  const moved = await store.readRange('2099-02-03', '2099-02-04');
  assert.equal(moved[0].fecha_original, '2099-01-19');
  assert.equal(moved[0].inicio, '2099-02-03T11:00:00');
});
test('conflicts roll back series creation, conversion and patient creation', async () => {
  const source = await store.createSingle(base);
  await store.createSingle({ ...base, inicio: `${r.addDays('2099-01-05', 700)}T09:00:00` });
  await assert.rejects(store.createSeries({}, source.id_horario), { status: 409 });
  assert.equal((await db.query('SELECT count(*)::int AS n FROM cita_serie')).rows[0].n, 0);
  assert.equal((await db.query('SELECT convertido_a_serie FROM horario WHERE id_horario=$1', [source.id_horario])).rows[0].convertido_a_serie, null);
  await assert.rejects(store.createPatientAndAppointment({ ...base, nombre: 'No guardar', f_nacimiento: '1990-01-01' }, true), { status: 409 });
  assert.equal((await db.query('SELECT count(*)::int AS n FROM paciente')).rows[0].n, 1);
});
test('conversion preserves its source record and produces only one event on the source date', async () => {
  const source = await store.createSingle(base);
  const s = await store.createSeries({ fecha_fin: '2099-01-19' }, source.id_horario);
  assert.equal((await read()).length, 3);
  assert.equal((await db.query('SELECT convertido_a_serie FROM horario')).rows[0].convertido_a_serie, s.id_serie);
  await assert.rejects(store.createSeries({}, source.id_horario), { status: 404 });
});
test('following edits split the series and explicitly handle future exceptions', async () => {
  const s = await store.createSeries({ ...base, fecha_fin: '2099-02-02' });
  await store.changeOccurrence(s.id_serie, '2099-01-26', { action: 'cancel', scope: 'one' });
  const change = { action: 'move', scope: 'following', inicio: '2099-01-20T10:00:00' };
  await assert.rejects(store.changeOccurrence(s.id_serie, '2099-01-19', change), { status: 409 });
  await store.changeOccurrence(s.id_serie, '2099-01-19', { ...change, confirm_exceptions: true });
  const rows = await read();
  assert.deepEqual(rows.map(h => h.inicio), ['2099-01-05T09:00:00','2099-01-12T09:00:00','2099-01-20T10:00:00','2099-01-27T10:00:00']);
  assert.equal((await store.readRange('2099-02-03','2099-02-10')).length, 0);
});
test('finishing a series preserves earlier occurrences and does not delete source history', async () => {
  const s = await store.createSeries(base);
  await store.changeOccurrence(s.id_serie, '2099-01-19', { action: 'cancel', scope: 'following' });
  assert.equal((await read()).length, 2);
});
test('simultaneous writes cannot create duplicate bookings in the same pool', async () => {
  const results = await Promise.allSettled([store.createSingle(base), store.createSeries(base)]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(results.find(x => x.status === 'rejected').reason.status, 409);
});
test('acceptance and moves respect recurring reservations', async () => {
  const single = await store.createSingle(base);
  await store.setStatus(single.id_horario, 'rechazado');
  await store.createSeries(base);
  await assert.rejects(store.setStatus(single.id_horario, 'aceptado'), { status: 409 });
  const free = await store.createSingle({ ...base, inicio: '2099-01-06T09:00:00' });
  await assert.rejects(store.moveSingle(free.id_horario, base), { status: 409 });
});

test('a past Monday starts next Monday and retains history without allowing duplicate conversion', async () => {
  const clock = r.clinicTimestamp;
  r.clinicTimestamp = () => '2026-10-15T16:00:00';
  try {
    const source = await store.createSingle({ ...base, inicio: '2026-10-12T15:20:00' });
    const series = await store.createSeries({}, source.id_horario);
    assert.equal(series.fecha_inicio, '2026-10-19');
    assert.equal(series.hora, '15:20:00');
    const rows = await store.readRange('2026-10-12', '2026-10-27');
    assert.deepEqual(rows.map(h => h.inicio), ['2026-10-12T15:20:00', '2026-10-19T15:20:00', '2026-10-26T15:20:00']);
    assert.equal(rows[0].id_horario, source.id_horario);
    await assert.rejects(store.createSeries({}, source.id_horario), { status: 409 });
  } finally { r.clinicTimestamp = clock; }
});

test('past conversion validates next occurrence conflicts and end date without losing history', async () => {
  const clock = r.clinicTimestamp;
  r.clinicTimestamp = () => '2026-10-15T16:00:00';
  try {
    const source = await store.createSingle({ ...base, inicio: '2026-10-15T15:00:00' });
    await assert.rejects(store.createSeries({ fecha_fin: '2026-10-16' }, source.id_horario), { status: 400 });
    await store.createSingle({ ...base, inicio: '2026-10-22T15:00:00' });
    await assert.rejects(store.createSeries({}, source.id_horario), { status: 409 });
    assert.equal((await db.query('SELECT count(*)::int AS n FROM cita_serie')).rows[0].n, 0);
    assert.equal((await db.query('SELECT convertido_a_serie FROM horario WHERE id_horario=$1', [source.id_horario])).rows[0].convertido_a_serie, null);
  } finally { r.clinicTimestamp = clock; }
});
