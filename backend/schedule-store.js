const r = require('./recurrence');
const { validDate } = require('./validation');
const id = value => {
  if (!/^[1-9]\d*$/.test(String(value))) throw r.fail('Identificador inválido.');
  return Number(value);
};
const snapshotSQL = `SELECT json_build_object(
  'singles', COALESCE((SELECT json_agg(x) FROM (
    SELECT h.id_horario, h.id_paciente, h.estado, h.especialidad, h.convertido_a_serie,
      to_char(h.inicio, 'YYYY-MM-DD"T"HH24:MI:SS') AS inicio,
      to_char(h.final, 'YYYY-MM-DD"T"HH24:MI:SS') AS final,
      p.nombre, to_char(p.f_nacimiento, 'YYYY-MM-DD') AS f_nacimiento, p.nombre_tutor, p.telefono
    FROM horario h JOIN paciente p USING (id_paciente)
    WHERE h.convertido_a_serie IS NULL OR h.inicio::date <
      (SELECT s.fecha_inicio FROM cita_serie s WHERE s.id_serie = h.convertido_a_serie)
  ) x), '[]'::json),
  'series', COALESCE((SELECT json_agg(x) FROM (
    SELECT s.id_serie, s.id_paciente, s.dia_semana, s.duracion, s.zona_horaria,
      to_char(s.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
      to_char(s.fecha_fin, 'YYYY-MM-DD') AS fecha_fin, to_char(s.hora, 'HH24:MI:SS') AS hora,
      p.nombre, to_char(p.f_nacimiento, 'YYYY-MM-DD') AS f_nacimiento, p.nombre_tutor, p.telefono
    FROM cita_serie s JOIN paciente p USING (id_paciente)
  ) x), '[]'::json),
  'exceptions', COALESCE((SELECT json_agg(x) FROM (
    SELECT id_serie, to_char(fecha_original, 'YYYY-MM-DD') AS fecha_original, cancelada,
      to_char(inicio, 'YYYY-MM-DD"T"HH24:MI:SS') AS inicio,
      to_char(final, 'YYYY-MM-DD"T"HH24:MI:SS') AS final FROM cita_excepcion
  ) x), '[]'::json)
) AS schedule`;

function createStore(pool) {
  const snapshot = async db => {
    const result = await db.query(snapshotSQL);
    return result.rows[0]?.schedule || { singles: [], series: [], exceptions: [] };
  };
  const write = async operation => {
    let client;
    try { client = await pool.connect(); } catch { throw r.fail('Servicio temporalmente no disponible.', 503); }
    try {
      await client.query('BEGIN');
      // Every appointment/series/exception mutation shares this lock, including public bookings.
      await client.query('LOCK TABLE horario, cita_serie, cita_excepcion IN SHARE ROW EXCLUSIVE MODE');
      const result = await operation(client, await snapshot(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  };
  const findSingle = (state, key) => {
    const found = state.singles.find(h => h.id_horario === id(key));
    if (!found) throw r.fail('Cita no encontrada o ya convertida en serie.', 404);
    return found;
  };
  const patient = async (db, body) => {
    const result = await db.query('INSERT INTO paciente (nombre, f_nacimiento, nombre_tutor, telefono) VALUES ($1,$2,$3,$4) RETURNING *',
      [body.nombre.trim(), body.f_nacimiento, body.nombre_tutor || '', body.telefono || '']);
    return result.rows[0];
  };
  const insertSingle = async (db, state, body, patientId, status) => {
    const slot = r.interval(body.inicio);
    r.assertIntervalFree(state, slot);
    return (await db.query('INSERT INTO horario (inicio, final, id_paciente, estado, especialidad) VALUES ($1,$2,$3,$4,$5) RETURNING id_horario',
      [slot.inicio, slot.final, id(patientId), status, body.especialidad || 'fonoaudiologia'])).rows[0];
  };
  const insertSeries = async (db, body, patientId) => {
    const value = r.seriesInput(body);
    const result = await db.query(`INSERT INTO cita_serie (id_paciente, fecha_inicio, fecha_fin, dia_semana, hora)
      VALUES ($1,$2,$3,$4,$5) RETURNING id_serie`, [id(patientId), value.fecha_inicio, value.fecha_fin, value.dia_semana, value.hora]);
    return { ...value, id_serie: result.rows[0].id_serie, id_paciente: id(patientId) };
  };
  return {
    readRange: async (from, to) => r.events(await snapshot(pool), ...r.range(from, to)),
    patients: async () => (await pool.query('SELECT * FROM paciente ORDER BY nombre')).rows,
    createPatient: body => patient(pool, body),
    createSingle: body => write((db, state) => insertSingle(db, state, body, body.id_paciente, 'aceptado')),
    createPatientAndAppointment: (body, isPublic = false) => write(async (db, state) => {
      const p = await patient(db, body);
      return insertSingle(db, state, { ...body, especialidad: isPublic ? 'fonoaudiologia' : body.especialidad }, p.id_paciente, isPublic ? 'pendiente' : 'aceptado');
    }),
    moveSingle: (key, body) => write(async (db, state) => {
      const current = findSingle(state, key);
      if (current.estado === 'rechazado') throw r.fail('La cita está cancelada.');
      const slot = r.interval(body.inicio);
      r.assertIntervalFree(state, slot, current.id_horario);
      await db.query('UPDATE horario SET inicio=$1, final=$2 WHERE id_horario=$3', [slot.inicio, slot.final, current.id_horario]);
      return { success: true };
    }),
    setStatus: (key, status) => write(async (db, state) => {
      if (!['aceptado', 'rechazado'].includes(status)) throw r.fail('Estado inválido.');
      const current = findSingle(state, key);
      if (status === 'aceptado') r.assertIntervalFree(state, current, current.id_horario);
      await db.query('UPDATE horario SET estado=$1 WHERE id_horario=$2', [status, current.id_horario]);
      return { success: true };
    }),
    createSeries: (body, sourceId) => write(async (db, state) => {
      let source;
      const now = r.clinicTimestamp();
      if (sourceId !== undefined) {
        source = findSingle(state, sourceId);
        if (source.convertido_a_serie) throw r.fail('Esta cita ya tiene una serie asociada.', 409);
        if (source.especialidad !== 'fonoaudiologia' || source.estado !== 'aceptado') throw r.fail('Solo una cita aceptada de fonoaudiología puede convertirse.');
        if (source.final !== r.addMinutes(source.inicio, 45)) throw r.fail('La cita debe durar 45 minutos para convertirla.');
        body = { ...body, id_paciente: source.id_paciente, inicio: source.inicio, especialidad: source.especialidad };
        // Keep the historical appointment; use its weekday/time for the next occurrence.
        if (body.inicio <= now) {
          const elapsedDays = Math.floor((Date.parse(`${now.slice(0, 10)}T00:00:00Z`) - Date.parse(`${source.inicio.slice(0, 10)}T00:00:00Z`)) / 86400000);
          let nextDate = r.addDays(source.inicio.slice(0, 10), Math.floor(elapsedDays / 7) * 7);
          if (`${nextDate}T${source.inicio.slice(11)}` <= now) nextDate = r.addDays(nextDate, 7);
          body.inicio = `${nextDate}T${source.inicio.slice(11)}`;
        }
      }
      if (typeof body.inicio !== 'string' || body.inicio.replace(' ', 'T') <= now) throw r.fail('La repetición debe comenzar en una cita futura.');
      const series = await insertSeries(db, body, body.id_paciente);
      if (source) state.singles = state.singles.filter(h => h.id_horario !== source.id_horario);
      r.assertSeriesFree(state, series);
      if (source) await db.query('UPDATE horario SET convertido_a_serie=$1 WHERE id_horario=$2', [series.id_serie, source.id_horario]);
      return series;
    }),
    changeOccurrence: (key, originalDate, body) => write(async (db, state) => {
      const series = state.series.find(s => s.id_serie === id(key));
      if (!series || !validDate(originalDate) || !r.occurs(series, originalDate)) throw r.fail('La fecha no pertenece a esta serie.', 404);
      if (!['one', 'following'].includes(body.scope) || !['move', 'cancel'].includes(body.action)) throw r.fail('Indica la acción y si afecta solo esta cita o las siguientes.');
      const currentException = state.exceptions.find(e => e.id_serie === series.id_serie && e.fecha_original === originalDate);
      const current = r.occurrence(series, originalDate, currentException?.cancelada ? undefined : currentException);
      const now = r.clinicTimestamp();
      if (current.inicio < now || `${originalDate}T${series.hora}` < now) throw r.fail('No se puede modificar el historial de una serie.');
      if (body.scope === 'one') {
        if (body.action === 'cancel') {
          await db.query(`INSERT INTO cita_excepcion (id_serie, fecha_original, cancelada) VALUES ($1,$2,true)
            ON CONFLICT (id_serie, fecha_original) DO UPDATE SET cancelada=true, inicio=NULL, final=NULL`, [series.id_serie, originalDate]);
        } else {
          const slot = r.interval(body.inicio);
          if (slot.inicio < now) throw r.fail('El nuevo horario debe ser futuro.');
          r.assertIntervalFree(state, slot, current.id_horario);
          await db.query(`INSERT INTO cita_excepcion (id_serie, fecha_original, cancelada, inicio, final) VALUES ($1,$2,false,$3,$4)
            ON CONFLICT (id_serie, fecha_original) DO UPDATE SET cancelada=false, inicio=EXCLUDED.inicio, final=EXCLUDED.final`,
          [series.id_serie, originalDate, slot.inicio, slot.final]);
        }
      } else {
        const affected = state.exceptions.filter(e => e.id_serie === series.id_serie && e.fecha_original >= originalDate);
        if (affected.some(e => !e.cancelada && e.inicio < now)) throw r.fail('Hay una excepción pasada en este tramo. Selecciona una fecha posterior.');
        if (affected.length && body.confirm_exceptions !== true) throw r.fail('Este tramo tiene excepciones. Confirma que se reemplazarán.', 409);
        // Splitting, rather than overwriting a series, preserves every previous occurrence.
        const previousEnd = series.fecha_fin;
        series.fecha_fin = r.addDays(originalDate, -1);
        await db.query('UPDATE cita_serie SET fecha_fin=$1 WHERE id_serie=$2', [series.fecha_fin, series.id_serie]);
        await db.query('DELETE FROM cita_excepcion WHERE id_serie=$1 AND fecha_original >= $2', [series.id_serie, originalDate]);
        state.exceptions = state.exceptions.filter(e => !(e.id_serie === series.id_serie && e.fecha_original >= originalDate));
        if (body.action === 'move') {
          const slot = r.interval(body.inicio);
          if (slot.inicio < now || slot.inicio.slice(0, 10) < originalDate) throw r.fail('El nuevo tramo debe comenzar en esta fecha o después.');
          const next = await insertSeries(db, { ...body, fecha_fin: body.fecha_fin === undefined ? previousEnd : body.fecha_fin }, series.id_paciente);
          r.assertSeriesFree(state, next);
        }
      }
      return { success: true };
    })
  };
}
module.exports = { createStore };
