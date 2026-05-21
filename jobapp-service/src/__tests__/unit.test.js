process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

jest.mock('../models/Application');
jest.mock('@google-cloud/storage');
jest.mock('fs');

const Application = require('../models/Application');
const { Storage } = require('@google-cloud/storage');
const fs = require('fs');

const {
  createApplication,
  getApplications,
  getApplicationById,
} = require('../controllers/applicationController');

const makeRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

const mockFile = {
  originalname: 'resume.pdf',
  mimetype: 'application/pdf',
  buffer: Buffer.from('fake pdf'),
};

describe('applicationController.createApplication', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when required fields are missing', async () => {
    const res = makeRes();
    await createApplication({ body: { jobId: 'j1' }, file: mockFile }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'jobId, name, email, and telNum are required' })
    );
  });

  it('returns 400 when resume file is missing', async () => {
    const res = makeRes();
    await createApplication(
      { body: { jobId: 'j1', name: 'Alice', email: 'a@b.com', telNum: '1234' }, file: null },
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Resume file is required' });
  });

  it('saves locally when GCS_BUCKET_NAME is not set', async () => {
    delete process.env.GCS_BUCKET_NAME;
    fs.mkdirSync.mockImplementation(() => {});
    fs.writeFileSync.mockImplementation(() => {});
    const mockApp = { _id: 'app1', jobId: 'j1', name: 'Alice', email: 'a@b.com', telNum: '1234', resumeUrl: 'http://localhost/uploads/resumes/file.pdf' };
    Application.create.mockResolvedValue(mockApp);

    const res = makeRes();
    const req = {
      body: { jobId: 'j1', name: 'Alice', email: 'a@b.com', telNum: '1234' },
      file: mockFile,
      protocol: 'http',
      get: jest.fn().mockReturnValue('localhost:3002'),
    };
    await createApplication(req, res);

    expect(fs.mkdirSync).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalled();
    expect(Application.create).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('uploads to GCS when GCS_BUCKET_NAME is set', async () => {
    process.env.GCS_BUCKET_NAME = 'test-bucket';
    const mockStream = {
      on: jest.fn().mockReturnThis(),
      end: jest.fn(),
    };
    const mockBlob = {
      createWriteStream: jest.fn().mockReturnValue(mockStream),
    };
    const mockBucket = { file: jest.fn().mockReturnValue(mockBlob) };
    Storage.mockImplementation(() => ({ bucket: jest.fn().mockReturnValue(mockBucket) }));

    // Simulate stream finish event
    mockStream.on.mockImplementation(function (event, cb) {
      if (event === 'finish') setTimeout(cb, 0);
      return this;
    });

    const mockApp = { _id: 'app2', resumeUrl: 'resumes/file.pdf' };
    Application.create.mockResolvedValue(mockApp);

    const res = makeRes();
    const req = {
      body: { jobId: 'j1', name: 'Alice', email: 'a@b.com', telNum: '1234' },
      file: mockFile,
      protocol: 'http',
      get: jest.fn().mockReturnValue('localhost:3002'),
    };
    await createApplication(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    delete process.env.GCS_BUCKET_NAME;
  });

  it('returns 500 on database error', async () => {
    delete process.env.GCS_BUCKET_NAME;
    fs.mkdirSync.mockImplementation(() => {});
    fs.writeFileSync.mockImplementation(() => {});
    Application.create.mockRejectedValue(new Error('DB error'));

    const res = makeRes();
    const req = {
      body: { jobId: 'j1', name: 'Alice', email: 'a@b.com', telNum: '1234' },
      file: mockFile,
      protocol: 'http',
      get: jest.fn().mockReturnValue('localhost:3002'),
    };
    await createApplication(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('applicationController.getApplications', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns list of applications', async () => {
    const apps = [{ _id: 'a1' }, { _id: 'a2' }];
    Application.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(apps) });

    const res = makeRes();
    await getApplications({}, res);

    expect(res.json).toHaveBeenCalledWith(apps);
  });

  it('returns 500 on error', async () => {
    Application.find.mockReturnValue({ sort: jest.fn().mockRejectedValue(new Error('DB error')) });

    const res = makeRes();
    await getApplications({}, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('applicationController.getApplicationById', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 404 when application not found', async () => {
    Application.findById.mockResolvedValue(null);

    const res = makeRes();
    await getApplicationById({ params: { id: 'nonexistent' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Application not found' });
  });

  it('returns application when found', async () => {
    const app = { _id: 'a1', jobId: 'j1', name: 'Alice' };
    Application.findById.mockResolvedValue(app);

    const res = makeRes();
    await getApplicationById({ params: { id: 'a1' } }, res);

    expect(res.json).toHaveBeenCalledWith(app);
  });

  it('returns 500 on error', async () => {
    Application.findById.mockRejectedValue(new Error('DB error'));

    const res = makeRes();
    await getApplicationById({ params: { id: 'a1' } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
