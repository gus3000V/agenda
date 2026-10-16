-- MANUAL MIGRATION: do not execute automatically on application startup.
-- Requires the existing paciente and horario tables. Existing rows are preserved.
BEGIN;
CREATE TABLE IF NOT EXISTS cita_serie (
  id_serie SERIAL PRIMARY KEY,
  id_paciente INTEGER NOT NULL REFERENCES paciente(id_paciente),
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE,
  dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora TIME NOT NULL CHECK (hora <= TIME '23:15:00'),
  duracion INTEGER NOT NULL DEFAULT 45 CHECK (duracion = 45),
  zona_horaria TEXT NOT NULL DEFAULT 'America/La_Paz' CHECK (zona_horaria = 'America/La_Paz'),
  especialidad TEXT NOT NULL DEFAULT 'fonoaudiologia' CHECK (especialidad = 'fonoaudiologia'),
  creada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (dia_semana = EXTRACT(DOW FROM fecha_inicio)),
  -- An empty series is retained when cancelled before its first occurrence.
  CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio - 1)
);
CREATE TABLE IF NOT EXISTS cita_excepcion (
  id_serie INTEGER NOT NULL REFERENCES cita_serie(id_serie),
  fecha_original DATE NOT NULL,
  cancelada BOOLEAN NOT NULL DEFAULT false,
  inicio TIMESTAMP WITHOUT TIME ZONE,
  final TIMESTAMP WITHOUT TIME ZONE,
  PRIMARY KEY (id_serie, fecha_original),
  CHECK ((cancelada AND inicio IS NULL AND final IS NULL) OR
    (NOT cancelada AND inicio IS NOT NULL AND final IS NOT NULL AND
      final = inicio + INTERVAL '45 minutes' AND inicio::date = final::date))
);
-- A converted booking remains stored for traceability; its series replaces it in the calendar.
ALTER TABLE horario ADD COLUMN IF NOT EXISTS convertido_a_serie INTEGER REFERENCES cita_serie(id_serie);
CREATE INDEX IF NOT EXISTS cita_serie_fechas_idx ON cita_serie(fecha_inicio, fecha_fin);
CREATE INDEX IF NOT EXISTS cita_excepcion_inicio_idx ON cita_excepcion(inicio) WHERE NOT cancelada;
CREATE INDEX IF NOT EXISTS horario_intervalo_idx ON horario(inicio, final);
COMMIT;
