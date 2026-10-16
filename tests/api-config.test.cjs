const { test } = require('node:test');
const assert = require('node:assert/strict');
test('API_URL se incorpora explícitamente y normaliza el endpoint de cada frontend', async () => {
  const old = process.env.API_URL;
  try {
    for (const [folder, scope] of [['frontend', 'admin'], ['agend_fronted', 'public']]) {
      const { default: config } = await import(`../${folder}/vite.config.js`);
      for (const value of ['https://backend.example', 'https://backend.example/api/', `https://backend.example/api/${scope}/`]) {
        process.env.API_URL = value;
        const result = config({ mode: 'production' });
        assert.deepEqual(result.define, { 'import.meta.env.API_URL': JSON.stringify(`https://backend.example/api/${scope}`) });
      }
      process.env.API_URL = 'https://backend.example/wrong';
      assert.throws(() => config({ mode: 'production' }), /API_URL/);
    }
  } finally {
    if (old === undefined) delete process.env.API_URL; else process.env.API_URL = old;
  }
});
