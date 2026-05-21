import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="navbar">
      <span className="navbar-brand" onClick={() => navigate('/dashboard')}>
        JobApp
      </span>
      <div className="navbar-links">
        <button
          className={`nav-link ${pathname === '/dashboard' ? 'nav-link--active' : ''}`}
          onClick={() => navigate('/dashboard')}
        >
          Jobs
        </button>
        <button
          className={`nav-link ${pathname === '/my-applications' ? 'nav-link--active' : ''}`}
          onClick={() => navigate('/my-applications')}
        >
          My Applications
        </button>
      </div>
      <div className="navbar-right">
        <span className="navbar-user">{user?.email}</span>
        <button className="btn btn-outline" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </nav>
  );
}
