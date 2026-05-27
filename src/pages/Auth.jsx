import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Mail, Lock, UserRound, Globe } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AuthPage() {
  const { loginWithEmail, signupWithEmail, loginWithGoogle, resetPassword, available, missingVars } = useAuth();
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const redirectTo = useMemo(() => location.state?.from || '/library', [location.state]);

  const normalizeError = (err) => {
    const code = err?.code || '';
    if (code.includes('invalid-credential')) return 'Incorrect email or password.';
    if (code.includes('email-already-in-use')) return 'That email is already in use.';
    if (code.includes('weak-password')) return 'Use a stronger password (6+ characters).';
    if (code.includes('popup-closed-by-user')) return 'Google sign-in was cancelled.';
    if (code.includes('too-many-requests')) return 'Too many attempts. Try again in a few minutes.';
    return err?.message || 'Something went wrong. Please try again.';
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    setError('');
    try {
      if (mode === 'login') {
        await loginWithEmail(email.trim(), password);
      } else {
        await signupWithEmail(email.trim(), password, name.trim());
      }
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await loginWithGoogle();
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (!email.trim()) {
      setError('Enter your email first, then tap reset password.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await resetPassword(email.trim());
      setMessage('Password reset email sent.');
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-container auth-page-wrap">
      <div className="auth-card">
        {!available && (
          <p className="auth-error">
            Authentication is not configured on this deployment. Missing vars: {missingVars.join(', ')}
          </p>
        )}
        <div className="auth-tabs">
          <button className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>Login</button>
          <button className={`auth-tab ${mode === 'signup' ? 'active' : ''}`} onClick={() => setMode('signup')}>Sign up</button>
        </div>

        <h1 className="auth-title">{mode === 'login' ? 'Welcome back' : 'Create account'}</h1>

        <form className="auth-form" onSubmit={submit}>
          {mode === 'signup' && (
            <label className="auth-field">
              <UserRound size={16} />
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" autoComplete="name" />
            </label>
          )}

          <label className="auth-field">
            <Mail size={16} />
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="email" />
          </label>

          <label className="auth-field">
            <Lock size={16} />
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </label>

          {error && <p className="auth-error">{error}</p>}
          {message && <p className="auth-success">{message}</p>}

          <button className="btn auth-submit" type="submit" disabled={busy || !available}>
            {busy ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create account'}
          </button>

          <button className="auth-forgot-link" type="button" onClick={handleReset} disabled={busy}>
            Forgot password?
          </button>
        </form>

        <div className="auth-divider">or</div>

        <button className="btn auth-google" onClick={handleGoogle} disabled={busy || !available}>
          <Globe size={16} /> Continue with Google
        </button>
      </div>
    </div>
  );
}
