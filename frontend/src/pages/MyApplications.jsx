import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { JOBS_MAP } from '../data/jobs';

export default function MyApplications() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/applications', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setApplications(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to load applications.'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="page">
      <Navbar />
      <main className="container">
        <div className="page-header">
          <div>
            <h2 className="section-title" style={{ marginBottom: 0 }}>My Applications</h2>
            <p className="muted" style={{ marginTop: '0.25rem' }}>
              {applications.length} application{applications.length !== 1 ? 's' : ''} submitted
            </p>
          </div>
          <button className="btn btn-outline" onClick={() => navigate('/dashboard')}>
            Browse Jobs
          </button>
        </div>

        {loading && <p className="muted">Loading…</p>}
        {error && <div className="alert alert-error">{error}</div>}

        {!loading && !error && applications.length === 0 && (
          <div className="empty-state">
            <p>You haven't applied to any jobs yet.</p>
            <button className="btn btn-primary mt-sm" onClick={() => navigate('/dashboard')}>
              Browse open positions
            </button>
          </div>
        )}

        {!loading && applications.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Job Title</th>
                  <th>Company</th>
                  <th>Applicant</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Resume</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => {
                  const job = JOBS_MAP[app.jobId];
                  return (
                    <tr key={app._id}>
                      <td>
                        <span className="fw-medium">{job?.title ?? '—'}</span>
                      </td>
                      <td>{job?.company ?? '—'}</td>
                      <td>{app.name}</td>
                      <td>{app.email}</td>
                      <td>{app.telNum}</td>
                      <td>
                        <a href={`/api/applications/${app._id}/resume`} target="_blank" rel="noreferrer" className="link">
                          View
                        </a>
                      </td>
                      <td>{new Date(app.createdAt).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
