import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { JOBS_MAP } from '../data/jobs';

export default function ApplicationForm() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const job = JOBS_MAP[jobId];

  const [form, setForm] = useState({ name: '', email: '', telNum: '' });
  const [resume, setResume] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!resume) return setError('Please attach your resume.');
    setError('');
    setLoading(true);

    const body = new FormData();
    body.append('jobId', jobId);
    body.append('name', form.name);
    body.append('email', form.email);
    body.append('telNum', form.telNum);
    body.append('resume', resume);

    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Submission failed');
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!job) {
    return (
      <div className="page">
        <Navbar />
        <main className="container">
          <div className="alert alert-error">Job not found.</div>
          <button className="btn btn-outline mt-sm" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </button>
        </main>
      </div>
    );
  }

  if (success) {
    return (
      <div className="page">
        <Navbar />
        <main className="container">
          <div className="success-card">
            <div className="success-icon">✓</div>
            <h2>Application Submitted!</h2>
            <p>Your application for <strong>{job.title}</strong> at <strong>{job.company}</strong> has been received.</p>
            <button className="btn btn-primary mt-sm" onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="page">
      <Navbar />
      <main className="container">
        <button className="btn btn-ghost mb-md" onClick={() => navigate('/dashboard')}>
          ← Back
        </button>

        <div className="form-card">
          <div className="form-card-header">
            <h2>{job.title}</h2>
            <p className="muted">{job.company}</p>
          </div>

          <form onSubmit={handleSubmit}>
            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-group">
              <label>Full Name</label>
              <input
                name="name"
                type="text"
                placeholder="Jane Doe"
                value={form.name}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label>Email</label>
              <input
                name="email"
                type="email"
                placeholder="jane@example.com"
                value={form.email}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label>Phone Number</label>
              <input
                name="telNum"
                type="tel"
                placeholder="+1 234 567 8900"
                value={form.telNum}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label>Resume</label>
              <div className="file-input-wrap">
                <input
                  type="file"
                  id="resume"
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => setResume(e.target.files[0])}
                />
                <label htmlFor="resume" className="file-label">
                  {resume ? resume.name : 'Choose PDF or Word document'}
                </label>
              </div>
              <span className="form-hint">PDF, DOC, DOCX — max 10 MB</span>
            </div>

            <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
              {loading ? 'Submitting…' : 'Submit Application'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
