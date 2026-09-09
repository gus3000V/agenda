require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit'); // [NUEVO]

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const pool = new Pool();

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

app.get('/api/admin/horarios', authMiddleware, async (req, res) => {
  try {
    const query = `
      SELECT h.id_horario, h.inicio, h.final, h.estado,
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
    
    const queryHorario = `
      INSERT INTO horario (inicio, final, id_paciente)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const resHorario = await client.query(queryHorario, [inicio, final, nuevoIdPaciente]);
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

    // 1. Generar la "plantilla" de horas del día
    const inicioOperacionMin = 9 * 60;  // 09:00 = 540 min
    const finOperacionMin = 18 * 60;    // 18:00 = 1080 min
    const intervalo = 45;               // Bloques de 45 mins
    
    const bloquesTotales = [];
    for (let min = inicioOperacionMin; min + intervalo <= finOperacionMin; min += intervalo) {
      const h = Math.floor(min / 60).toString().padStart(2, '0');
      const m = (min % 60).toString().padStart(2, '0');
      bloquesTotales.push(`${h}:${m}`);
    }

    // 2. Extraer de la BD (solo las horas) de las citas ocupadas de ese día.
    // Usamos to_char('HH24:MI') para evitar inconsistencias de Timezone entre Postgres y Node.
    // Excluimos las 'rechazadas' porque vuelven a liberar el espacio.
    const query = `
      SELECT to_char(inicio, 'HH24:MI') as hora_ocupada 
      FROM horario 
      WHERE inicio >= $1::date 
        AND inicio < ($1::date + '1 day'::interval)
        AND estado != 'rechazado';
    `;
    const { rows } = await pool.query(query, [fecha]);
    const horasOcupadas = rows.map(r => r.hora_ocupada);

    // 3. Cruzar plantillas: Filtramos todo lo que no esté ocupado
    const disponibles = bloquesTotales.filter(slot => !horasOcupadas.includes(slot));

    // Retorno limpio, 0 fuga de datos.
    res.status(200).json({ disponibles });
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
    await client.query(queryHorario, [inicio, final, idGenerado]);
    
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
