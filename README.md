# Agenda y reservas

- `frontend`: agenda privada del administrador (Vue, puerto 5173).
- `agend_fronted`: reservas públicas (Vue, puerto 5174).
- `backend`: API Express y PostgreSQL (puerto 3000).
- `server.js` en la raíz inicia el mismo backend; ya no mantiene otra implementación.

## Desarrollo

Instalar dependencias con `npm run install:all`. Configurar `backend/.env` tomando
como referencia `backend/.env.example` y ejecutar `npm run dev` desde la raíz.
Los dos Vite redirigen `/api` al backend local. Desde un teléfono en la misma red,
abrir la IP del equipo con el puerto 5173 o 5174; las llamadas ya no apuntan al
`localhost` del teléfono. El firewall del equipo debe permitir esos puertos.

La base existente debe tener las tablas `paciente` y `horario` utilizadas por
`backend/server.js`. **El archivo histórico `backend/schema.sql` solo crea una
tabla de ejemplo `items`; no sirve para inicializar esta aplicación.** No se han
ejecutado migraciones ni modificado datos reales.

## Despliegue

Publicar backend y frontend administrativo juntos: el antiguo acceso por
`x-api-key` fue sustituido por sesiones. Configurar antes de compilar:

| Aplicación | Variable | Ejemplo |
| --- | --- | --- |
| Agenda privada | `API_URL` | `https://api.ejemplo.com/api/admin` |
| Reservas | `API_URL` | `https://api.ejemplo.com/api/public` |
| Backend | `ALLOWED_ORIGINS` | `https://agenda.ejemplo.com,https://reservas.ejemplo.com` |

Sin `API_URL`, se utiliza `/api/admin` o `/api/public` en el mismo origen;
en producción eso requiere un proxy hacia Express. La configuración de Vite incorpora explícitamente solo `API_URL` al navegador.
También acepta `VITE_API_URL` como alternativa. Cambiar la variable en Vercel
requiere un nuevo despliegue del frontend; en desarrollo requiere reiniciar Vite. Nunca poner contraseñas o secretos en variables `VITE_`.

Usar HTTPS y configurar `ADMIN_PIN` como contraseña larga y única del administrador.
El backend comprueba la contraseña y entrega un token aleatorio que vence a las
8 horas. El PIN no se guarda; el token se conserva en `sessionStorage`. Cerrar
sesión revoca ese token. Las sesiones se guardan en memoria: reiniciar el servidor
obliga a iniciar sesión otra vez. Varias instancias requieren un almacén de
sesiones y límites compartido antes de escalar.

Hay un límite de 10 intentos de inicio de sesión por IP cada 15 minutos y de 5
solicitudes públicas por IP por hora. Si hay un proxy, configurar
`TRUST_PROXY_HOPS` con el número real de saltos de confianza; no activarlo sin
revisar la topología, porque afecta a la identificación de IP y los límites.

`CRON_SECRET` debe existir y coincidir para ejecutar las tareas automáticas.
La tarea histórica de mantenimiento envía un PDF y elimina citas antiguas;
su comportamiento no fue cambiado ni ejecutado durante esta revisión.

PostgreSQL verifica el certificado TLS por defecto. `PGSSLMODE=disable` es solo
para una base local sin TLS. Para un proveedor con CA privada, configurar
`PGSSLROOTCERT_PEM` con su certificado. Evitar opciones de conexión que desactiven
la verificación de certificados.

Las reservas públicas se crean como pendientes, duran 45 minutos y se validan
en horario de Bolivia, de lunes a sábado entre 09:00 y 18:00 (final hasta 18:45).
Las escrituras de citas comprueban solapamientos dentro de una transacción con
bloqueo de tabla. Esto serializa las reservas para el volumen de un consultorio;
una carga elevada requerirá revisar esta estrategia.

## Verificación

```
npm test --prefix backend
npm run build --prefix frontend
npm run build --prefix agend_fronted
node tests/ui-smoke.cjs
```

El último comando requiere Playwright disponible (o `NODE_PATH` apuntando a su
instalación) y Edge instalado. Sirve ambos `dist` localmente, simula todas las
respuestas API y comprueba reservas, acceso, cierre de sesión, ausencia de
desbordamiento horizontal y errores de JavaScript a 360, 390, 768 y 1440 px.
En móvil también verifica mover citas y elegir pacientes. Las capturas quedan
en `.ui-checks`. Las pruebas HTTP usan una base simulada; falta validar las
transacciones y la configuración TLS con una base PostgreSQL de pruebas.
