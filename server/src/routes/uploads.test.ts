import { describe, it, expect } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { app } from '../index';
import { workerToken } from '../test/helpers';

// 1x1 red pixel PNG
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

describe('Upload routes', () => {
  it('POST /api/uploads requires auth', async () => {
    const res = await request(app)
      .post('/api/uploads')
      .attach('photos', PNG_1PX, 'pixel.png');
    expect(res.status).toBe(401);
  });

  it('POST /api/uploads rejects a non-image mime type', async () => {
    const token = await workerToken();
    const res = await request(app)
      .post('/api/uploads')
      .set('Authorization', `Bearer ${token}`)
      .attach('photos', Buffer.from('not an image'), 'evil.txt', {
        contentType: 'text/plain',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unsupported/i);
  });

  it('POST /api/uploads saves an image and returns a public path', async () => {
    const token = await workerToken();
    const res = await request(app)
      .post('/api/uploads')
      .set('Authorization', `Bearer ${token}`)
      .attach('photos', PNG_1PX, 'pixel.png');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.photos)).toBe(true);
    expect(res.body.photos).toHaveLength(1);
    const publicPath = res.body.photos[0] as string;
    expect(publicPath).toMatch(/^\/uploads\/\d{4}-\d{2}\//);

    // the file must exist on disk (strip leading / — path.resolve with an
    // absolute second arg would otherwise jump to the filesystem root)
    const absolute = path.join(process.cwd(), publicPath.replace(/^\//, ''));
    const deadline = Date.now() + 3000;
    while (!fs.existsSync(absolute) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(fs.existsSync(absolute)).toBe(true);

    // and be fetchable over HTTP
    const get = await request(app).get(publicPath);
    expect(get.status).toBe(200);
  });
});
