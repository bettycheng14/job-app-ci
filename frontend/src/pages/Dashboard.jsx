import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { JOBS } from '../data/jobs';

export default function Dashboard() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [appliedJobIds, setAppliedJobIds] = useState(new Set());
  const [loadingApps, setLoadingApps] = useState(true);

  useEffect(() => {
    fetch('/api/applications', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data))
          setAppliedJobIds(new Set(data.map((a) => a.jobId)));
      })
      .catch(() => {})
      .finally(() => setLoadingApps(false));
  }, [token]);

  return (
    <div className="page">
      <Navbar />
      <main className="container">
        <h2 className="section-title">Open Positions</h2>
        <div className="job-grid">
          {JOBS.map((job) => {
            const applied = appliedJobIds.has(job.id);
            return (
              <div key={job.id} className={`job-card ${applied ? 'job-card--applied' : ''}`}>
                <div className="job-card-header">
                  <div>
                    <h3 className="job-title">{job.title}</h3>
                    <p className="job-company">{job.company}</p>
                  </div>
                  <span className={`badge ${job.type === 'Contract' ? 'badge-warning' : 'badge-primary'}`}>
                    {job.type}
                  </span>
                </div>
                <div className="job-meta">
                  <span>📍 {job.location}</span>
                  <span>💰 {job.salary}</span>
                </div>
                <div className="tag-group">
                  {job.tags.map((t) => <span key={t} className="tag">{t}</span>)}
                </div>
                <button
                  className={`btn btn-full ${applied ? 'btn-applied' : 'btn-primary'}`}
                  onClick={() => navigate(`/apply/${job.id}`)}
                  disabled={applied || loadingApps}
                >
                  {applied ? '✓ Applied' : 'Apply Now'}
                </button>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
