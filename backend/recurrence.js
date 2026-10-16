// All values are clinic wall-clock dates (America/La_Paz), not server-local Dates.
const { validDate, validTime } = require('./validation');
const DAY = 86400000;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const dateMs = date => Date.parse(`${date}T00:00:00Z`);
const addDays = (date, days) => new Date(dateMs(date) + days * DAY).toISOString().slice(0, 10);
const weekday = date => new Date(`${date}T00:00:00Z`).getUTCDay();
const addMinutes = (start, minutes) => new Date(Date.parse(`${start.replace(' ', 'T')}Z`) + minutes * 60000).toISOString().slice(0, 19);
const clinicTimestamp = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date()).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
};
function interval(start) {
  if (!validTime(start)) throw fail('Fecha y hora inválidas.');
  start = start.replace(' ', 'T');
  const end = addMinutes(start, 45);
  if (start.slice(0, 10) !== end.slice(0, 10)) throw fail('La cita debe finalizar dentro del mismo día.');
  return { inicio: start, final: end };
}
function seriesInput(body) {
  const { inicio } = interval(body.inicio);
  if (body.especialidad && body.especialidad !== 'fonoaudiologia') throw fail('Solo fonoaudiología admite repetición.');
  const fecha_inicio = inicio.slice(0, 10);
  const fecha_fin = body.fecha_fin || null;
  if (fecha_fin && (!validDate(fecha_fin) || fecha_fin < fecha_inicio)) throw fail('La fecha final debe ser igual o posterior al inicio.');
  return { fecha_inicio, fecha_fin, dia_semana: weekday(fecha_inicio), hora: inicio.slice(11), duracion: 45, zona_horaria: 'America/La_Paz' };
}
const occurs = (series, date) => date >= series.fecha_inicio && (!series.fecha_fin || date <= series.fecha_fin) && weekday(date) === series.dia_semana;
const overlaps = (a, b) => a.inicio < b.final && a.final > b.inicio;
const exceptionKey = (id, date) => `${id}:${date}`;
const activeException = (state, e) => {
  const series = state.series.find(s => String(s.id_serie) === String(e.id_serie));
  return series && occurs(series, e.fecha_original) ? series : null;
};
function occurrence(series, date, override) {
  const start = override?.inicio || `${date}T${series.hora}`;
  return {
    ...series, id_horario: `s${series.id_serie}@${date}`, fecha_original: date,
    inicio: start, final: override?.final || addMinutes(start, series.duracion),
    estado: 'aceptado', especialidad: 'fonoaudiologia', recurrente: true,
    excepcion: Boolean(override)
  };
}
function events(state, from, to) {
  const result = state.singles.filter(h => h.estado !== 'rechazado' && h.inicio < to && h.final > from);
  const exceptions = new Map(state.exceptions.map(e => [exceptionKey(e.id_serie, e.fecha_original), e]));
  for (const s of state.series) {
    const first = s.fecha_inicio > from.slice(0, 10) ? s.fecha_inicio : from.slice(0, 10);
    let date = addDays(first, (s.dia_semana - weekday(first) + 7) % 7);
    while (`${date}T00:00:00` < to && (!s.fecha_fin || date <= s.fecha_fin)) {
      if (!exceptions.has(exceptionKey(s.id_serie, date))) {
        const event = occurrence(s, date);
        if (event.inicio < to && event.final > from) result.push(event);
      }
      date = addDays(date, 7);
    }
  }
  // A moved instance can originate outside the requested week/month.
  for (const e of state.exceptions) {
    const s = activeException(state, e);
    if (s && !e.cancelada && e.inicio < to && e.final > from) result.push(occurrence(s, e.fecha_original, e));
  }
  return result.sort((a, b) => a.inicio.localeCompare(b.inicio));
}
function assertIntervalFree(state, candidate, excludeId) {
  const occupied = events(state, `${candidate.inicio.slice(0, 10)}T00:00:00`, `${addDays(candidate.final.slice(0, 10), 1)}T00:00:00`);
  if (occupied.some(e => String(e.id_horario) !== String(excludeId) && overlaps(e, candidate))) {
    throw fail('El horario solicitado ya está ocupado. No se guardaron los cambios.', 409);
  }
}
function assertSeriesFree(state, candidate) {
  const candidateExceptions = state.exceptions.filter(e => String(e.id_serie) === String(candidate.id_serie));
  const candidateState = { singles: [], series: [candidate], exceptions: candidateExceptions };
  // Check every existing individual booking, even one years into the future.
  const finite = [...state.singles.filter(h => h.estado !== 'rechazado')];
  for (const e of state.exceptions) {
    if (!e.cancelada && activeException(state, e)) finite.push(e);
  }
  for (const item of finite) {
    const generated = events(candidateState, `${item.inicio.slice(0, 10)}T00:00:00`, `${addDays(item.final.slice(0, 10), 1)}T00:00:00`);
    if (generated.some(e => overlaps(e, item) && !(String(e.id_serie) === String(item.id_serie) && e.fecha_original === item.fecha_original))) {
      throw fail(`La repetición coincide con otra cita el ${item.inicio.slice(0, 10)}.`, 409);
    }
  }
  // Weekly base patterns: no arbitrary eight-week conflict-check horizon.
  for (const other of state.series) {
    if (String(other.id_serie) === String(candidate.id_serie) || other.dia_semana !== candidate.dia_semana) continue;
    const first = candidate.fecha_inicio > other.fecha_inicio ? candidate.fecha_inicio : other.fecha_inicio;
    const last = [candidate.fecha_fin, other.fecha_fin].filter(Boolean).sort()[0] || '9999-12-31';
    let date = addDays(first, (candidate.dia_semana - weekday(first) + 7) % 7);
    if (date > last || !overlaps(occurrence(candidate, date), occurrence(other, date))) continue;
    const omitted = new Set(state.exceptions.filter(e => [String(candidate.id_serie), String(other.id_serie)].includes(String(e.id_serie))).map(e => e.fecha_original));
    while (date <= last && omitted.has(date)) date = addDays(date, 7);
    if (date <= last) throw fail(`La repetición coincide con otra serie el ${date}.`, 409);
  }
}
function range(from, to) {
  if (!validDate(from) || !validDate(to) || to <= from || dateMs(to) - dateMs(from) > 93 * DAY) throw fail('Indica un intervalo válido de hasta 93 días (fin exclusivo).');
  return [`${from}T00:00:00`, `${to}T00:00:00`];
}
module.exports = { fail, addDays, addMinutes, weekday, clinicTimestamp, interval, seriesInput, occurs, occurrence, overlaps, events, assertIntervalFree, assertSeriesFree, range };
