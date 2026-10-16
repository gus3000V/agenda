require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit');
const PDFDocument = require('pdfkit');
const { installSecurity } = require('./security');
const { validateRequest, validDate } = require('./validation');

const app = express();
const port = process.env.PORT || 3000;

app.disable('x-powered-by');
if (process.env.TRUST_PROXY_HOPS) app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS));
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:5174').split(',').map(s => s.trim());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '16kb' }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: true, ...(process.env.PGSSLROOTCERT_PEM ? { ca: process.env.PGSSLROOTCERT_PEM } : {}) }
});

const { createStore } = require('./schedule-store');
const r = require('./recurrence');
const store = createStore(pool);
installSecurity(app);
app.use('/api/admin', validateRequest);
app.use('/api/public', validateRequest);
const route = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const patientRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Has superado el límite de 5 solicitudes. Intenta de nuevo en una hora.' }
});

// Retired endpoints are deliberately inert, even if an external scheduler still calls them.
app.all('/api/cron/:task', (req, res) => res.status(410).json({ error: 'Tarea retirada. Desactiva su programación externa.' }));

app.get('/api/admin/horarios', route(async (req, res) => {
  const from = req.query.desde || r.clinicTimestamp().slice(0, 10);
  const to = req.query.hasta || (validDate(from) ? r.addDays(from, 7) : '');
  res.json(await store.readRange(from, to));
}));
app.get('/api/admin/pacientes', route(async (req, res) => res.json(await store.patients())));
app.post('/api/admin/pacientes', route(async (req, res) => res.status(201).json(await store.createPatient(req.body))));
app.post('/api/admin/paciente-y-cita', route(async (req, res) => res.status(201).json(await store.createPatientAndAppointment(req.body))));
app.post('/api/admin/horario', route(async (req, res) => res.status(201).json(await store.createSingle(req.body))));
app.put('/api/admin/horario/:id', route(async (req, res) => res.json(await store.moveSingle(req.params.id, req.body))));
app.put('/api/admin/horario/:id/estado', route(async (req, res) => res.json(await store.setStatus(req.params.id, req.body.estado))));
app.delete('/api/admin/horario/:id', route(async (req, res) => res.json(await store.setStatus(req.params.id, 'rechazado'))));
app.post('/api/admin/series', route(async (req, res) => res.status(201).json(await store.createSeries(req.body))));
app.post('/api/admin/horario/:id/serie', route(async (req, res) => res.status(201).json(await store.createSeries(req.body, req.params.id))));
app.put('/api/admin/series/:id/ocurrencias/:fecha', route(async (req, res) => res.json(await store.changeOccurrence(req.params.id, req.params.fecha, req.body))));

app.get('/api/admin/reporte', route(async (req, res) => {
  const month = req.query.mes;
  if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month) || !validDate(`${month}-01`)) throw r.fail('Indica un mes válido (AAAA-MM).');
  const from = `${month}-01`;
  const next = new Date(`${from}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
  const rows = await store.readRange(from, next.toISOString().slice(0, 10));
  const doc = new PDFDocument({ margin: 40 });
  const data = new Promise((resolve, reject) => {
    const buffers = []; doc.on('data', chunk => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers))); doc.on('error', reject);
  });
  doc.fontSize(18).text(`Agenda mensual: ${month}`);
  doc.fontSize(10).text('Horario de Bolivia. Incluye citas aceptadas y pendientes; no acredita asistencia.');
  doc.moveDown();
  if (!rows.length) doc.text('No hay citas en este mes.');
  for (const h of rows) {
    doc.fontSize(11).text(`${h.inicio.slice(0, 10)} ${h.inicio.slice(11, 16)} - ${h.final.slice(11, 16)}`);
    doc.text(`${h.nombre} | ${h.especialidad} | ${h.estado}${h.recurrente ? ' | Semanal' : ''}`);
    doc.moveDown(0.5);
  }
  doc.end();
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename="agenda-${month}.pdf"`);
  res.send(await data);
}));

app.get('/api/public/disponibilidad', route(async (req, res) => {
  const date = req.query.fecha;
  const now = r.clinicTimestamp();
  if (date < now.slice(0, 10) || r.weekday(date) === 0) return res.json({ disponibles: [] });
  const occupied = await store.readRange(date, r.addDays(date, 1));
  let current = 540;
  const slots = [];
  const time = mins => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  const minutes = stamp => Number(stamp.slice(11, 13)) * 60 + Number(stamp.slice(14, 16));
  for (const h of occupied) {
    const start = h.inicio.slice(0, 10) < date ? 0 : minutes(h.inicio);
    const end = h.final.slice(0, 10) > date ? 1440 : minutes(h.final);
    while (current + 45 <= Math.min(start, 1125)) {
      slots.push({ hora: time(current), estado: 'libre' }); current += 45;
    }
    if (h.estado === 'pendiente' && start >= 540 && start + 45 <= 1125) slots.push({ hora: time(start), estado: 'pendiente' });
    current = Math.max(current, end);
  }
  while (current + 45 <= 1125) { slots.push({ hora: time(current), estado: 'libre' }); current += 45; }
  res.json({ disponibles: slots.filter(slot => `${date}T${slot.hora}:00` > now) });
}));
app.post('/api/public/solicitar', patientRequestLimiter, route(async (req, res) => {
  await store.createPatientAndAppointment(req.body, true);
  res.status(201).json({ mensaje: 'Solicitud enviada. El consultorio confirmará su cita.' });
}));
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta de API no encontrada. Comprueba que frontend y backend estén actualizados.' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  // Never expose SQL, connection strings, or patient information in a response.
  console.error('Error de solicitud:', error.code || error.status || 'internal');
  if (['42P01', '42703'].includes(error.code)) return res.status(503).json({ error: 'Falta aplicar la migración de citas recurrentes en el servidor.' });
  if (['23503', '23514', '23505'].includes(error.code)) return res.status(400).json({ error: 'Datos inválidos o registro duplicado.' });
  const status = error.status || 500;
  res.status(status).json({ error: status < 500 ? error.message : 'Servicio temporalmente no disponible.' });
});
if (require.main === module) app.listen(port, () => console.log(`Servidor backend corriendo en el puerto ${port}`));
module.exports = { app, pool };
