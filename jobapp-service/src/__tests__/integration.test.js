process.env.JWT_SECRET = 'integration-test-secret';
process.env.NODE_ENV = 'test';

jest.mock('../models/Application');
jest.mock('@google-cloud/storage');
jest.mock('fs');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const Application = require('../models/Application');
const fs = require('fs');
const app = require('../app');

const validToken = jwt.sign(
  { id: 'uid1', email: 'admin@b.com' },
  'integration-test-secret',
  { expiresIn: '1h' }
);

describe('GET /health', () => {
  it('returns 200 with service name', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'jobapp' });
  });
});

describe('GET /metrics', () => {
  it('returns prometheus-format metrics', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
  });
});

describe('POST /api/applications', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when required body fields are missing', async () => {
    const res = await request(app)
      .post('/api/applications')
      .field('jobId', 'j1')
      .attach('resume', Buffer.from('fake pdf'), { filename: 'resume.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when resume file is missing', async () => {
    const res = await request(app)
      .post('/api/applications')
      .send({ jobId: 'j1', name: 'Alice', email: 'a@b.com', telNum: '1234' });
    expect(res.status).toBe(400);
  });

  it('returns 201 on successful submission (local storage)', async () => {
    delete process.env.GCS_BUCKET_NAME;
    fs.mkdirSync.mockImplementation(() => {});
    fs.writeFileSync.mockImplementation(() => {});
    Application.create.mockResolvedValue({
      _id: 'app1',
      jobId: 'j1',
      name: 'Alice',
      email: 'a@b.com',
      telNum: '1234',
      resumeUrl: 'http://localhost/uploads/resumes/resume.pdf',
    });

    const res = await request(app)
      .post('/api/applications')
      .field('jobId', 'j1')
      .field('name', 'Alice')
      .field('email', 'a@b.com')
      .field('telNum', '1234')
      .attach('resume', Buffer.from('fake pdf'), { filename: 'resume.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('_id', 'app1');
  });
});

describe('GET /api/applications', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/applications');
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/applications')
      .set('Authorization', 'Bearer bad.token');
    expect(res.status).toBe(401);
  });

  it('returns 200 with list for authenticated user', async () => {
    const apps = [{ _id: 'a1' }, { _id: 'a2' }];
    Application.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(apps) });

    const res = await request(app)
      .get('/api/applications')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

describe('GET /api/applications/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/applications/app1');
    expect(res.status).toBe(401);
  });

  it('returns 404 when application not found', async () => {
    Application.findById.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/applications/nonexistent')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(404);
  });

  it('returns 200 with application for authenticated user', async () => {
    Application.findById.mockResolvedValue({ _id: 'app1', name: 'Alice' });

    const res = await request(app)
      .get('/api/applications/app1')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Alice');
  });
});
