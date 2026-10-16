# Activación de citas semanales

Esta migración es manual. El código no la ejecuta al arrancar y no se ha aplicado
a la base real. Se probó en una base temporal con las columnas y restricciones
de `paciente` y `horario` mostradas por el propietario del proyecto.

## Modelo

- `paciente` se conserva sin cambios.
- `horario` conserva las citas individuales, incluida cosmetología, y recibe
  `convertido_a_serie`: una referencia a la serie que reemplaza una cita convertida.
  La fila original permanece almacenada.
- `cita_serie` guarda paciente, día semanal, hora, inicio y fin opcional. Solo admite
  fonoaudiología, duración de 45 minutos y zona `America/La_Paz`.
- `cita_excepcion` guarda cancelaciones y cambios de una sola ocurrencia,
  identificada por su serie y fecha original, incluso si se mueve a otro mes.

El servidor calcula las ocurrencias al consultar una semana o la disponibilidad
pública. No necesita cron ni que el administrador abra la agenda para reservar
los horarios recurrentes. Valida conflictos más allá de la semana visible.

## Orden de actualización

1. Respaldar la base y acordar una breve pausa de escrituras/reservas.
2. Desactivar las programaciones externas que llamen a `/api/cron/duplicar-semana`
   y `/api/cron/mantenimiento-mensual`, donde hayan sido creadas. Quitar las rutas
   del código no elimina una programación en otro servicio.
3. Confirmar que las tablas están en `public`, que los identificadores son
   `INTEGER/SERIAL`, y que `inicio` y `final` son `TIMESTAMP WITHOUT TIME ZONE`
   expresados en hora de Bolivia, como en las capturas. Verificar que no existen
   tablas `cita_serie` o `cita_excepcion` con una definición distinta.
4. Ejecutar **todo** `001_recurring_appointments.sql` en el editor SQL conectado
   a la base correcta. Incluye BEGIN/COMMIT y no borra filas existentes.
5. Desplegar el nuevo backend en Render y el frontend administrativo en Vercel.
   Mantener DATABASE_URL, ADMIN_PIN y ALLOWED_ORIGINS. CRON_SECRET y las variables
   EMAIL_* dejan de ser utilizadas por este backend.
6. Verificar acceso, lectura semanal, reservas públicas y descarga del PDF.
   Si falta la migración, la API devolverá 503 con un mensaje específico.
7. Revisar citas futuras creadas por la antigua duplicación antes de convertir
   una cita: no se convierten ni eliminan automáticamente. Una coincidencia
   bloquea la conversión completa; resolverla desde la agenda según corresponda.
8. Reabrir reservas tras comprobar el funcionamiento.

No volver al backend anterior después de usar series: no entiende las nuevas
reservas y podría mostrar de nuevo las filas convertidas o aceptar solapamientos.
Conservar el respaldo y preparar cualquier reversión con la agenda detenida.

## Uso

Al agendar fonoaudiología, marcar «Repetir cada semana» y, si corresponde, indicar
la última fecha. Una cita futura aceptada también puede convertirse desde su
botón de edición. Cosmetología no ofrece repetición.

En una cita semanal, elegir «Solo esta cita» para moverla o cancelarla sin
afectar otras semanas. «Esta y las siguientes» finaliza el tramo anterior y,
al mover, inicia uno nuevo. Si el tramo contiene cambios puntuales, el servidor
exige confirmar su reemplazo. No se permite modificar ocurrencias pasadas.

Las cancelaciones individuales quedan como rechazadas; las semanales quedan
como excepciones o fin de serie. El PDF incluye citas aceptadas y pendientes,
no certifica asistencia. Ya no hay borrado mensual ni envío automático de correo.

## Comprobaciones pendientes en el entorno real

Las pruebas locales no verifican credenciales, TLS, permisos del usuario SQL ni
bloqueos entre varias conexiones reales. Todas las escrituras de agenda del
backend comparten un bloqueo transaccional de las tres tablas; es apropiado
para el volumen de un consultorio. No escribir directamente desde otro cliente
saltándose estas validaciones. La política de acceso directo a la base debe
revisarse por separado si se expone mediante una API adicional.
