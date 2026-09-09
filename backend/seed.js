import { db } from './db.js';

async function seed() {
  try {
    const res = await db.query(`
      INSERT INTO paciente (nombre, f_nacimiento, nombre_tutor, telefono) 
      VALUES 
        ('Ana Torres', '2015-05-20', 'Maria Torres', '555-1234'), 
        ('Luis Gomez', '1990-10-15', NULL, '555-5678')
      RETURNING id_paciente;
    `);
    
    const anaId = res.rows[0].id_paciente;
    const luisId = res.rows[1].id_paciente;

    // Get next Monday
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day == 0 ? -6:1); // adjust when day is sunday
    const monday = new Date(today.setDate(diff));

    const inicioAna = new Date(monday);
    inicioAna.setHours(10, 0, 0, 0);
    const finalAna = new Date(monday);
    finalAna.setHours(10, 45, 0, 0);

    const inicioLuis = new Date(monday);
    inicioLuis.setHours(12, 15, 0, 0);
    const finalLuis = new Date(monday);
    finalLuis.setHours(13, 0, 0, 0);

    await db.query(`
      INSERT INTO horario (inicio, final, id_paciente) 
      VALUES 
        ($1, $2, $3),
        ($4, $5, $6)
    `, [inicioAna, finalAna, anaId, inicioLuis, finalLuis, luisId]);

    console.log('Mock data inserted');
  } catch(e) {
    console.error(e);
  }
  process.exit();
}

seed();
