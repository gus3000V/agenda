const clinicNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/La_Paz' }));
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const validTime = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:00$/.test(value) &&
  validDate(value.slice(0, 10)) && Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60;
const text = (value, max, required = false) => (!required && (value == null || value === '')) ||
  (typeof value === 'string' && value.trim().length > 0 && value.length <= max);

function validateRequest(req, res, next) {
  const fail = message => res.status(400).json({ error: message });
  const routeId = req.path.match(/^\/horario\/([^/]+)/)?.[1];
  if (routeId && !/^[1-9]\d*$/.test(routeId)) return fail('Identificador inválido.');
  if (req.method === 'GET' && req.path === '/disponibilidad' && !validDate(req.query.fecha)) return fail('Fecha inválida (AAAA-MM-DD).');
  if (!['POST', 'PUT'].includes(req.method)) return next();
  const b = req.body || {};
  const isPublic = req.baseUrl === '/api/public';
  if (['/solicitar', '/pacientes', '/paciente-y-cita'].includes(req.path)) {
    if (!text(b.nombre, 150, true) || !validDate(b.f_nacimiento) || new Date(`${b.f_nacimiento}T00:00:00`) > clinicNow() ||
        !text(b.nombre_tutor, 150) || !text(b.telefono, 40, isPublic)) return fail('Revisa el nombre, la fecha de nacimiento y el teléfono.');
    const birth = new Date(`${b.f_nacimiento}T00:00:00`);
    const adult = new Date(birth); adult.setFullYear(adult.getFullYear() + 18);
    if (isPublic && adult > clinicNow() && !text(b.nombre_tutor, 150, true)) return fail('Indica el tutor del menor.');
  }
  if (req.path === '/horario' && !/^[1-9]\d*$/.test(String(b.id_paciente))) return fail('Selecciona un paciente válido.');
  if (b.especialidad && !['fonoaudiologia', 'cosmetologia'].includes(b.especialidad)) return fail('Especialidad inválida.');
  if (['/solicitar', '/paciente-y-cita', '/horario'].includes(req.path) || /^\/horario\/[^/]+$/.test(req.path)) {
    if (!validTime(b.inicio)) return fail('Fecha y hora de inicio inválidas.');
    if (b.final !== undefined && (!validTime(b.final) || new Date(b.final.replace(' ', 'T')) - new Date(b.inicio.replace(' ', 'T')) !== 45 * 60000)) return fail('La cita debe durar 45 minutos.');
    if (isPublic) {
      const start = new Date(b.inicio.replace(' ', 'T'));
      const minutes = start.getHours() * 60 + start.getMinutes();
      if (start <= clinicNow() || start.getDay() === 0 || minutes < 540 || minutes > 1080) return fail('Elige un horario futuro de lunes a sábado, entre 09:00 y 18:00.');
      // The public client cannot choose the duration or approval state.
      const end = new Date(start.getTime() + 45 * 60000);
      b.final = `${b.inicio.slice(0, 10)}T${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}:00`;
    }
  }
  next();
}
module.exports = { validateRequest, validDate, validTime, clinicNow };
