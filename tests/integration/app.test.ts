import { describe, expect, it } from 'vitest';

import { api } from '../helpers';

describe('Aplicación', () => {
  it('GET / devuelve información de la API', async () => {
    const res = await api().get('/');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Blogging Platform API', docs: '/docs' });
  });

  it('GET /health y /health/ready responden ok', async () => {
    expect((await api().get('/health')).body.status).toBe('ok');
    const ready = await api().get('/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({ status: 'ok', database: 'up' });
  });

  it('expone la especificación OpenAPI y la UI de Swagger', async () => {
    const spec = await api().get('/docs/openapi.json');
    expect(spec.status).toBe(200);
    expect(spec.body.openapi).toBe('3.1.0');
    expect(spec.body.paths).toHaveProperty('/api/v1/articles');

    const ui = await api().get('/docs/');
    expect(ui.status).toBe(200);
    expect(ui.text).toContain('swagger');
  });

  it('devuelve 404 con formato de error estándar para rutas desconocidas', async () => {
    const res = await api().get('/api/v1/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND' });
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('propaga X-Request-Id válido y genera uno si falta', async () => {
    const withId = await api().get('/health').set('X-Request-Id', 'mi-id-123');
    expect(withId.headers['x-request-id']).toBe('mi-id-123');

    const withoutId = await api().get('/health');
    expect(withoutId.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rechaza JSON mal formado con 400', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('rechaza cuerpos demasiado grandes con 413', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'a@b.c', password: 'x'.repeat(1_100_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('aplica cabeceras de seguridad y oculta X-Powered-By', async () => {
    const res = await api().get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
