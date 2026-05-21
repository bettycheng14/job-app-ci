process.env.JWT_SECRET = 'test-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';

jest.mock('../models/User');
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { register, login } = require('../controllers/authController');

const makeRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

describe('authController.register', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when email is missing', async () => {
    const res = makeRes();
    await register({ body: { password: 'pass' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Email and password are required' });
  });

  it('returns 400 when password is missing', async () => {
    const res = makeRes();
    await register({ body: { email: 'a@b.com' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when body is empty', async () => {
    const res = makeRes();
    await register({ body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 409 when email already registered', async () => {
    User.findOne.mockResolvedValue({ email: 'a@b.com' });
    const res = makeRes();
    await register({ body: { email: 'a@b.com', password: 'pass' } }, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ message: 'Email already registered' });
  });

  it('returns 201 with token on successful registration', async () => {
    User.findOne.mockResolvedValue(null);
    bcrypt.hash.mockResolvedValue('hashed_pw');
    const mockUser = { _id: 'uid1', email: 'new@b.com' };
    User.create.mockResolvedValue(mockUser);
    jwt.sign.mockReturnValue('mock.token.abc');

    const res = makeRes();
    await register({ body: { email: 'new@b.com', password: 'pass' } }, res);

    expect(bcrypt.hash).toHaveBeenCalledWith('pass', 12);
    expect(jwt.sign).toHaveBeenCalledWith(
      { id: 'uid1', email: 'new@b.com' },
      'test-secret',
      { expiresIn: '1h' }
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      token: 'mock.token.abc',
      user: { id: 'uid1', email: 'new@b.com' },
    });
  });

  it('returns 500 on database error', async () => {
    User.findOne.mockRejectedValue(new Error('DB down'));
    const res = makeRes();
    await register({ body: { email: 'a@b.com', password: 'pass' } }, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Registration failed' })
    );
  });
});

describe('authController.login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when email is missing', async () => {
    const res = makeRes();
    await login({ body: { password: 'pass' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when password is missing', async () => {
    const res = makeRes();
    await login({ body: { email: 'a@b.com' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 401 when user not found', async () => {
    User.findOne.mockResolvedValue(null);
    const res = makeRes();
    await login({ body: { email: 'nobody@b.com', password: 'pass' } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid credentials' });
  });

  it('returns 401 when password does not match', async () => {
    User.findOne.mockResolvedValue({ _id: 'uid1', email: 'a@b.com', password: 'hashed' });
    bcrypt.compare.mockResolvedValue(false);
    const res = makeRes();
    await login({ body: { email: 'a@b.com', password: 'wrong' } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 200 with token on successful login', async () => {
    const mockUser = { _id: 'uid1', email: 'a@b.com', password: 'hashed' };
    User.findOne.mockResolvedValue(mockUser);
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign.mockReturnValue('login.token.xyz');

    const res = makeRes();
    await login({ body: { email: 'a@b.com', password: 'correct' } }, res);

    expect(res.json).toHaveBeenCalledWith({
      token: 'login.token.xyz',
      user: { id: 'uid1', email: 'a@b.com' },
    });
  });

  it('returns 500 on database error', async () => {
    User.findOne.mockRejectedValue(new Error('DB down'));
    const res = makeRes();
    await login({ body: { email: 'a@b.com', password: 'pass' } }, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Login failed' })
    );
  });
});

describe('authenticate middleware', () => {
  // Re-require with real jwt for middleware tests
  jest.unmock('jsonwebtoken');
  const authenticate = require('../middleware/auth');
  const realJwt = require('jsonwebtoken');

  const makeReqRes = (authHeader) => ({
    req: { headers: authHeader ? { authorization: authHeader } : {} },
    res: { status: jest.fn().mockReturnThis(), json: jest.fn() },
    next: jest.fn(),
  });

  it('returns 401 when no authorization header', () => {
    const { req, res, next } = makeReqRes(null);
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when header does not start with Bearer', () => {
    const { req, res, next } = makeReqRes('Basic abc123');
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for an invalid token', () => {
    const { req, res, next } = makeReqRes('Bearer invalid.token.here');
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next and sets req.user for a valid token', () => {
    const token = realJwt.sign({ id: 'uid1', email: 'a@b.com' }, 'test-secret', { expiresIn: '1h' });
    const { req, res, next } = makeReqRes(`Bearer ${token}`);
    authenticate(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({ id: 'uid1', email: 'a@b.com' });
  });
});
