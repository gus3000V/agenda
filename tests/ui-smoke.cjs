// Run with NODE_PATH pointing to a Playwright installation. All API responses are fixtures.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
async function serve(directory) {
  const server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname;
    const file = path.join(directory, name === '/' ? 'index.html' : name);
    res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    fs.createReadStream(file).on('error', () => { res.statusCode = 404; res.end(); }).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
(async () => {
  const admin = await serve(path.resolve('frontend/dist'));
  const publicSite = await serve(path.resolve('agend_fronted/dist'));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    fs.mkdirSync('.ui-checks', { recursive: true });
    for (const width of [360, 390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 1024 });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const today = new Date().toLocaleDateString('en-CA');
      let bookings = 0, moves = 0, loginAttempts = 0;
      await page.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.pathname.includes('/api/')) {
          let data = {};
          if (url.pathname.endsWith('/login')) {
            if (loginAttempts++ === 0) return route.fulfill({ status: 404, contentType: 'text/html', body: '<!DOCTYPE html><html>Not found</html>' });
            data = { token: 'fixture-session' };
          }
          else if (url.pathname.endsWith('/disponibilidad')) data = { disponibles: [{ hora: '09:00', estado: 'libre' }, { hora: '09:45', estado: 'pendiente' }, { hora: '10:30', estado: 'libre' }] };
          else if (url.pathname.endsWith('/solicitar')) { bookings++; data = { mensaje: 'Solicitud recibida' }; }
          else if (url.pathname.endsWith('/horarios')) data = [{ id_horario: 1, nombre: 'Paciente de prueba', inicio: `${today}T09:00:00`, final: `${today}T09:45:00`, estado: 'pendiente', especialidad: 'fonoaudiologia' }];
          else if (url.pathname.endsWith('/pacientes')) data = [{ id_paciente: 1, nombre: 'Paciente de prueba' }];
          else if (request.method() === 'PUT') { moves++; data = { success: true }; }
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
        }
        if (url.hostname !== '127.0.0.1') return route.abort();
        return route.continue();
      });
      await page.goto(publicSite.url);
      await page.getByRole('button', { name: '09:00', exact: true }).first().click();
      await page.getByLabel('Nombre completo del paciente', { exact: true }).fill('Prueba local');
      await page.getByLabel('Fecha de nacimiento, día mes y año').fill('01011990');
      await page.getByLabel('Teléfono móvil').fill('12345678');
      await page.getByRole('button', { name: 'Enviar solicitud', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Solicitud enviada' }).waitFor();
      assert.equal(bookings, 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Public overflow at ${width}`);
      await page.screenshot({ path: `.ui-checks/public-${width}.png` });
      await page.goto(admin.url);
      await page.getByLabel('PIN de Acceso').fill('fixture-only');
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'El servidor devolvió una página' }).waitFor();
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await page.getByRole('heading', { name: 'Calendario', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('admin_pin')), null);
      if (width < 1024) {
        await page.getByRole('button', { name: 'Mover', exact: true }).click();
        await page.getByLabel('Hora', { exact: true }).fill('10:30');
        await page.getByRole('button', { name: 'Guardar cita', exact: true }).click();
        await page.getByRole('heading', { name: 'Mover cita', exact: true }).waitFor({ state: 'hidden' });
        assert.equal(moves, 1);
        await page.getByRole('button', { name: 'Agendar nueva cita', exact: true }).click();
        await page.getByPlaceholder('Busca o registra un paciente').fill('Paciente');
        await page.getByRole('button', { name: 'Continuar', exact: true }).click();
        await page.getByRole('heading', { name: 'Nueva cita', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Cancelar', exact: true }).first().click();
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Admin overflow at ${width}`);
      await page.screenshot({ path: `.ui-checks/admin-${width}.png` });
      assert.deepEqual(errors, []);
      await page.getByRole('button', { name: 'Cerrar Sesión', exact: true }).click();
      await page.getByRole('button', { name: 'Entrar', exact: true }).waitFor();
      await context.close();
      console.log(`PASS booking, admin login/logout, overflow and browser errors at ${width}px`);
    }
  } finally {
    await browser?.close();
    admin.server.close(); publicSite.server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
