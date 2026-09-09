require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit'); // [NUEVO]

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ==========================================
// MIDDLEWARES DE SEGURIDAD
// ==========================================

// Middleware para Admin (Verifica el PIN)
const authMiddleware = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.ADMIN_PIN) {
    return res.status(403).json({ error: 'Acceso denegado: API Key inválida o no proporcionada.' });
  }
  next();
};

const checkOverlap = async (clientOrPool, inicio, final, excludeId = null) => {
  let query = `
    SELECT id_horario FROM horario 
    WHERE inicio < $2 AND final > $1 
    AND estado != 'rechazado'
  `;
  const params = [inicio, final];
  if (excludeId) {
    query += ` AND id_horario != $3`;
    params.push(excludeId);
  }
  const result = await clientOrPool.query(query, params);
  return result.rows.length > 0;
};

// [NUEVO] Middleware Antispam para peticiones de pacientes
const patientRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora en milisegundos
  max: 5, // 5 peticiones máximas por IP en la ventana
  message: { error: 'Has superado el límite de 5 solicitudes. Intenta de nuevo en una hora.' },
  standardHeaders: true,
  legacyHeaders: false,
});


// ==========================================
// RUTAS PRIVADAS (ADMIN) - Protegidas con authMiddleware
// ==========================================

const toLocalDBString = (isoString) => {
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
};

app.get('/api/admin/horarios', authMiddleware, async (req, res) => {
  try {
    const query = `
      SELECT h.id_horario, 
             to_char(h.inicio, 'YYYY-MM-DD"T"HH24:MI:SS') as inicio, 
             to_char(h.final, 'YYYY-MM-DD"T"HH24:MI:SS') as final, 
             h.estado,
             p.id_paciente, p.nombre, p.f_nacimiento, p.nombre_tutor, p.telefono
      FROM horario h
      JOIN paciente p ON h.id_paciente = p.id_paciente
      ORDER BY h.inicio ASC;
    `;
    const { rows } = await pool.query(query);
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error al obtener los horarios:', error);
    res.status(500).json({ error: 'Error interno del servidor al recuperar los horarios.' });
  }
});

app.post('/api/admin/paciente-y-cita', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, f_nacimiento, nombre_tutor, telefono, inicio, final } = req.body;
    if (!nombre || !f_nacimiento || !inicio || !final) {
      return res.status(400).json({ error: 'Faltan campos obligatorios para registrar la cita.' });
    }

    await client.query('BEGIN');
    const queryPaciente = `
      INSERT INTO paciente (nombre, f_nacimiento, nombre_tutor, telefono)
      VALUES ($1, $2, $3, $4)
      RETURNING id_paciente;
    `;
    const resPaciente = await client.query(queryPaciente, [nombre, f_nacimiento, nombre_tutor, telefono]);
    const nuevoIdPaciente = resPaciente.rows[0].id_paciente;

    const localInicio = toLocalDBString(inicio);
    const localFinal = toLocalDBString(final);

    if (await checkOverlap(client, localInicio, localFinal)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'El horario solicitado ya se encuentra ocupado.' });
    }

    const queryHorario = `
      INSERT INTO horario (inicio, final, id_paciente, estado)
      VALUES ($1, $2, $3, 'aceptado')
      RETURNING *;
    `;
    const resHorario = await client.query(queryHorario, [localInicio, localFinal, nuevoIdPaciente]);
    await client.query('COMMIT');

    res.status(201).json({
      mensaje: 'Paciente y cita creados exitosamente.',
      paciente_id: nuevoIdPaciente,
      horario: resHorario.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en transacción:', error);
    res.status(500).json({ error: 'Error interno al procesar registro.' });
  } finally {
    client.release();
  }
});

app.put('/api/admin/horario/:id/estado', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    if (!['aceptado', 'rechazado'].includes(estado)) {
      return res.status(400).json({ error: "Estado inválido." });
    }
    const query = `UPDATE horario SET estado = $1 WHERE id_horario = $2 RETURNING *;`;
    const { rows, rowCount } = await pool.query(query, [estado, id]);

    if (rowCount === 0) return res.status(404).json({ error: 'Horario no encontrado.' });
    res.status(200).json({ mensaje: 'Actualizado', horario: rows[0] });
  } catch (error) {
    console.error('Error estado:', error);
    res.status(500).json({ error: 'Error interno al actualizar estado.' });
  }
});


app.get('/api/admin/pacientes', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM paciente');
    res.status(200).json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/api/admin/pacientes', authMiddleware, async (req, res) => {
  try {
    const { nombre, f_nacimiento, nombre_tutor, telefono } = req.body;
    const query = `
      INSERT INTO paciente (nombre, f_nacimiento, nombre_tutor, telefono)
      VALUES ($1, $2, $3, $4) RETURNING *;
    `;
    const { rows } = await pool.query(query, [nombre, f_nacimiento, nombre_tutor, telefono]);
    res.status(201).json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/api/admin/horario', authMiddleware, async (req, res) => {
  try {
    const { id_paciente, inicio } = req.body;
    const inicioDate = new Date(inicio);
    const finalDate = new Date(inicioDate.getTime() + 45 * 60000);

    const localInicio = toLocalDBString(inicioDate);
    const localFinal = toLocalDBString(finalDate);

    if (await checkOverlap(pool, localInicio, localFinal)) {
      return res.status(409).json({ error: 'El horario solicitado ya se encuentra ocupado.' });
    }

    const query = `
      INSERT INTO horario (inicio, final, id_paciente, estado)
      VALUES ($1, $2, $3, 'aceptado') RETURNING *;
    `;
    const { rows } = await pool.query(query, [localInicio, localFinal, id_paciente]);
    res.status(201).json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error interno' });
  }
});

app.put('/api/admin/horario/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { inicio } = req.body;
    const inicioDate = new Date(inicio);
    const finalDate = new Date(inicioDate.getTime() + 45 * 60000);

    const localInicio = toLocalDBString(inicioDate);
    const localFinal = toLocalDBString(finalDate);

    if (await checkOverlap(pool, localInicio, localFinal, id)) {
      return res.status(409).json({ error: 'El horario solicitado ya se encuentra ocupado.' });
    }

    const query = `UPDATE horario SET inicio = $1, final = $2 WHERE id_horario = $3 RETURNING *;`;
    const { rows } = await pool.query(query, [localInicio, localFinal, id]);
    res.status(200).json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error interno' });
  }
});

app.delete('/api/admin/horario/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM horario WHERE id_horario = $1', [id]);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// ==========================================
// [NUEVO] RUTAS PÚBLICAS (PACIENTES)
// ==========================================

/**
 * GET /api/public/disponibilidad
 * Calcula los bloques de 45 mins disponibles basados en un horario de 09:00 a 18:00
 */
app.get('/api/public/disponibilidad', async (req, res) => {
  try {
    const { fecha } = req.query; // Formato esperado: YYYY-MM-DD
    if (!fecha) {
      return res.status(400).json({ error: 'Falta el parámetro fecha (YYYY-MM-DD)' });
    }

    const query = `
      SELECT 
        EXTRACT(EPOCH FROM inicio::time)/60 as inicio_min,
        EXTRACT(EPOCH FROM final::time)/60 as final_min,
        estado
      FROM horario
      WHERE inicio >= $1::date 
        AND inicio < ($1::date + '1 day'::interval)
        AND estado != 'rechazado'
      ORDER BY inicio ASC;
    `;
    const { rows } = await pool.query(query, [fecha]);

    let currentTime = 9 * 60; // 09:00 = 540 min
    const finOperacionMin = 18 * 60 + 45; // 18:45 = 1125 min
    const intervalo = 45;
    const slots = [];

    const formatTime = (mins) => {
      const h = Math.floor(mins / 60).toString().padStart(2, '0');
      const m = (Math.floor(mins) % 60).toString().padStart(2, '0');
      return `${h}:${m}`;
    };

    for (const appt of rows) {
      const inicioMin = parseFloat(appt.inicio_min);
      const finalMin = parseFloat(appt.final_min);

      // Llenar espacios libres continuos de 45 mins antes de la cita
      while (currentTime + intervalo <= inicioMin) {
        slots.push({ hora: formatTime(currentTime), estado: 'libre' });
        currentTime += intervalo;
      }

      // Si es pendiente, se empuja como bloque en espera
      if (appt.estado === 'pendiente') {
        slots.push({ hora: formatTime(inicioMin), estado: 'pendiente' });
      }

      // Avanzamos el reloj al final de esta cita
      currentTime = Math.max(currentTime, finalMin);
    }

    // Llenar espacios de 45 mins al final del día
    while (currentTime + intervalo <= finOperacionMin) {
      slots.push({ hora: formatTime(currentTime), estado: 'libre' });
      currentTime += intervalo;
    }

    res.status(200).json({ disponibles: slots });
  } catch (error) {
    console.error('Error al calcular disponibilidad:', error);
    res.status(500).json({ error: 'Error interno calculando horarios disponibles.' });
  }
});

/**
 * POST /api/public/solicitar
 * Recibe formulario público. Usa transacción y confía en el DEFAULT 'pendiente'.
 * Restringido por middleware antispam.
 */
app.post('/api/public/solicitar', patientRequestLimiter, async (req, res) => {
  const client = await pool.connect();
  try {
    const { nombre, f_nacimiento, nombre_tutor, telefono, inicio, final } = req.body;

    if (!nombre || !f_nacimiento || !inicio || !final) {
      return res.status(400).json({ error: 'Faltan campos obligatorios para procesar la solicitud.' });
    }

    await client.query('BEGIN');

    const localInicio = toLocalDBString(inicio);
    const localFinal = toLocalDBString(final);

    if (await checkOverlap(client, localInicio, localFinal)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'El horario solicitado ya se encuentra ocupado.' });
    }

    // 1. Insertar paciente
    const queryPaciente = `
      INSERT INTO paciente (nombre, f_nacimiento, nombre_tutor, telefono)
      VALUES ($1, $2, $3, $4)
      RETURNING id_paciente;
    `;
    const resPaciente = await client.query(queryPaciente, [nombre, f_nacimiento, nombre_tutor, telefono]);
    const idGenerado = resPaciente.rows[0].id_paciente;

    // 2. Insertar horario (OMITIMOS el campo 'estado' para que PostreSQL asigne 'pendiente' DEFAULT)
    const queryHorario = `
      INSERT INTO horario (inicio, final, id_paciente)
      VALUES ($1, $2, $3);
    `;
    await client.query(queryHorario, [localInicio, localFinal, idGenerado]);

    await client.query('COMMIT');

    // Retornamos éxito genérico, sin revelar datos transaccionales por seguridad
    res.status(201).json({
      mensaje: 'Su solicitud ha sido enviada con éxito. El consultorio confirmará su cita a la brevedad.'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al procesar solicitud pública:', error);
    res.status(500).json({ error: 'Error interno procesando su solicitud.' });
  } finally {
    client.release();
  }
});

app.listen(port, () => {
  console.log(`Servidor backend corriendo en el puerto ${port}`);
});
