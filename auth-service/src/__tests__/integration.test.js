process.env.JWT_SECRET = 'integration-test-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';

jest.mock('../models/User');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const app = require('../app');

describe('GET /health', () => {
  it('returns 200 with service name', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'auth' });
  });
});

describe('GET /metrics', () => {
  it('returns prometheus-format metrics', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
  });
});

describe('POST /api/auth/register', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when fields are missing', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'a@b.com' });
    expect(res.status).toBe(400);
  });

  it('returns 409 when email already exists', async () => {
    User.findOne.mockResolvedValue({ email: 'exists@b.com' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'exists@b.com', password: 'pass123' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Email already registered');
  });

  it('returns 201 with token on success', async () => {
    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue({ _id: 'uid1', email: 'new@b.com' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@b.com', password: 'pass123' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe('new@b.com');
  });

  it('returns 500 on unexpected error', async () => {
    User.findOne.mockRejectedValue(new Error('DB error'));
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@b.com', password: 'pass' });
    expect(res.status).toBe(500);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when fields are missing', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });

  it('returns 401 when user does not exist', async () => {
    User.findOne.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@b.com', password: 'pass' });
    expect(res.status).toBe(401);
  });

  it('returns 401 when password is wrong', async () => {
    const hashed = await bcrypt.hash('correct', 12);
    User.findOne.mockResolvedValue({ _id: 'uid1', email: 'a@b.com', password: hashed });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('returns 200 with token on success', async () => {
    const hashed = await bcrypt.hash('correct', 12);
    User.findOne.mockResolvedValue({ _id: 'uid1', email: 'a@b.com', password: hashed });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'correct' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with malformed token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.real.token');
    expect(res.status).toBe(401);
  });

  it('returns 200 with user payload for valid token', async () => {
    const token = jwt.sign(
      { id: 'uid1', email: 'a@b.com' },
      'integration-test-secret',
      { expiresIn: '1h' }
    );
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'uid1', email: 'a@b.com' });
  });
});
