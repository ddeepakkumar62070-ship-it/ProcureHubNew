import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PasswordInput from '../components/PasswordInput';

const initialForm = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  role: 'BUYER',
  businessName: '',
};

export default function RegisterPage() {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { register } = useAuth();

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setError('');
    setFieldErrors({});
    if (form.password !== form.confirmPassword) {
      setError('Please correct the highlighted fields.');
      setFieldErrors({ confirmPassword: 'Passwords do not match.' });
      return;
    }

    setSubmitting(true);
    try {
      const { confirmPassword, ...payload } = form;
      await register(payload);
      navigate('/dashboard');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to create your account right now.');
      setFieldErrors(requestError.response?.data?.errors || {});
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-shell auth-page">
      <div className="auth-card">
        <h2>Create account</h2>
        {error && <div className="alert error" role="alert">{error}</div>}
        <form onSubmit={handleSubmit} noValidate>
          <label>
            Full name
            <input
              autoComplete="name"
              maxLength={150}
              value={form.name}
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? 'register-name-error' : undefined}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
            />
            {fieldErrors.name && <small id="register-name-error" className="field-error" role="alert">{fieldErrors.name}</small>}
          </label>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              maxLength={254}
              value={form.email}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'register-email-error' : undefined}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              required
            />
            {fieldErrors.email && <small id="register-email-error" className="field-error" role="alert">{fieldErrors.email}</small>}
          </label>
          <label>
            Password
            <PasswordInput
              id="register-password"
              autoComplete="new-password"
              value={form.password}
              name="password"
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? 'register-password-error' : undefined}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              required
            />
            <small>Use 8–72 bytes. The password is never sent back in an error response.</small>
            {fieldErrors.password && <small id="register-password-error" className="field-error" role="alert">{fieldErrors.password}</small>}
          </label>
          <label>
            Confirm password
            <PasswordInput
              id="register-confirm-password"
              autoComplete="new-password"
              value={form.confirmPassword}
              name="confirmPassword"
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              aria-describedby={fieldErrors.confirmPassword ? 'register-confirm-error' : undefined}
              onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
              required
            />
            {fieldErrors.confirmPassword && <small id="register-confirm-error" className="field-error" role="alert">{fieldErrors.confirmPassword}</small>}
          </label>
          <label>
            Role
            <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
              <option value="BUYER">BUYER</option>
              <option value="SUPPLIER">SUPPLIER</option>
            </select>
            {fieldErrors.role && <small className="field-error" role="alert">{fieldErrors.role}</small>}
          </label>
          <label>
            Business name (optional)
            <input
              autoComplete="organization"
              maxLength={200}
              value={form.businessName}
              aria-invalid={Boolean(fieldErrors.businessName)}
              aria-describedby={fieldErrors.businessName ? 'register-business-error' : undefined}
              onChange={(event) => setForm({ ...form, businessName: event.target.value })}
            />
            {fieldErrors.businessName && <small id="register-business-error" className="field-error" role="alert">{fieldErrors.businessName}</small>}
          </label>
          <button className="primary-btn" type="submit" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Register'}
          </button>
        </form>
        <p className="helper-text">
          Already registered? <Link to="/login">Login</Link>
        </p>
      </div>
    </div>
  );
}
