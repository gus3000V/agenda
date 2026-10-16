const { test } = require('node:test');
const assert = require('node:assert/strict');
const r = require('./recurrence');
const series = (id, start = '2099-01-05T09:00:00', end = null) => ({ ...r.seriesInput({ inicio: start, fecha_fin: end }), id_serie: id, nombre: 'Prueba' });
const empty = () => ({ singles: [], series: [], exceptions: [] });
test('weekly expansion has stable identities and respects inclusive end dates', () => {
  const state = empty(); state.series.push(series(1, undefined, '2099-01-19'));
  const rows = r.events(state, '2099-01-01T00:00:00', '2099-02-01T00:00:00');
  assert.deepEqual(rows.map(h => h.fecha_original), ['2099-01-05', '2099-01-12', '2099-01-19']);
  assert.equal(rows[1].id_horario, 's1@2099-01-12');
});
test('cancelled and moved instances replace originals, including across month boundaries', () => {
  const state = empty(); state.series.push(series(1));
  state.exceptions.push({ id_serie: 1, fecha_original: '2099-01-05', cancelada: true });
  state.exceptions.push({ id_serie: 1, fecha_original: '2099-01-12', cancelada: false, inicio: '2099-02-03T10:00:00', final: '2099-02-03T10:45:00' });
  assert.equal(r.events(state, '2099-01-01T00:00:00', '2099-01-15T00:00:00').length, 0);
  const rows = r.events(state, '2099-02-03T00:00:00', '2099-02-04T00:00:00');
  assert.equal(rows[0].id_horario, 's1@2099-01-12');
});
test('conflicts are checked beyond a short generation horizon', () => {
  const state = empty();
  const distant = r.addDays('2099-01-05', 7 * 1000);
  state.singles.push({ id_horario: 1, estado: 'aceptado', inicio: `${distant}T09:15:00`, final: `${distant}T10:00:00` });
  assert.throws(() => r.assertSeriesFree(state, series(1)), { status: 409 });
  state.singles = []; state.series.push(series(2, `${distant}T09:15:00`));
  assert.throws(() => r.assertSeriesFree(state, series(1)), { status: 409 });
});
test('exceptions can remove a finite pattern conflict but not an infinite one', () => {
  const state = empty(); state.series.push(series(2, undefined, '2099-01-05'));
  state.exceptions.push({ id_serie: 2, fecha_original: '2099-01-05', cancelada: true });
  assert.doesNotThrow(() => r.assertSeriesFree(state, series(1)));
  state.series[0].fecha_fin = null;
  assert.throws(() => r.assertSeriesFree(state, series(1)), { status: 409 });
});
test('adjacent appointments are allowed, partial overlaps are rejected', () => {
  const state = empty(); state.series.push(series(1));
  assert.doesNotThrow(() => r.assertIntervalFree(state, r.interval('2099-01-05T09:45:00')));
  assert.throws(() => r.assertIntervalFree(state, r.interval('2099-01-05T09:30:00')), { status: 409 });
});
test('ranges, malformed input and cosmetology recurrence are rejected', () => {
  assert.throws(() => r.range('2099-02-30', '2099-03-01'));
  assert.throws(() => r.range('2099-01-01', '2100-01-01'));
  assert.throws(() => r.seriesInput({ inicio: '2099-01-05T09:00:00', especialidad: 'cosmetologia' }));
  assert.throws(() => r.interval('2099-01-05T23:30:00'));
});
