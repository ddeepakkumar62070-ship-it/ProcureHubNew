import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PasswordInput from '../components/PasswordInput';

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setError('');
    setFieldErrors({});
    setSubmitting(true);
    try {
      await login(form);
      navigate('/dashboard');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to sign in right now.');
      setFieldErrors(requestError.response?.data?.errors || {});
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-shell auth-page">
      <div className="auth-card">
        <h2>Login to ProcureHub</h2>
        {error && <div className="alert error" role="alert">{error}</div>}
        <form onSubmit={handleSubmit} noValidate>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={form.email}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              required
            />
            {fieldErrors.email && <small id="login-email-error" className="field-error" role="alert">{fieldErrors.email}</small>}
          </label>
          <label>
            Password
            <PasswordInput
              id="login-password"
              autoComplete="current-password"
              value={form.password}
              name="password"
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              required
            />
            {fieldErrors.password && <small id="login-password-error" className="field-error" role="alert">{fieldErrors.password}</small>}
          </label>
          <button className="primary-btn" type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Login'}
          </button>
        </form>
        <p className="helper-text">
          Don’t have an account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}
