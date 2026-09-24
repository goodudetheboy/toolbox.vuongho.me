import type { User } from 'firebase/auth';
import { useState } from 'react';
import { sendEmailLink, signInWithGoogle, signOutUser } from '../lib/auth';

interface AuthBarProps {
  user: User | null;
  loading: boolean;
}

export default function AuthBar({ user, loading }: AuthBarProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return null;

  if (user) {
    return (
      <div className="auth-bar">
        <span className="auth-identity">{user.email ?? user.displayName ?? 'Signed in'}</span>
        <button className="link-button" onClick={() => signOutUser()}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="auth-bar">
      {!open && (
        <button className="link-button" onClick={() => setOpen(true)}>
          Sign in
        </button>
      )}
      {open && (
        <div className="auth-popover panel">
          <button
            className="secondary"
            onClick={() => {
              setError(null);
              signInWithGoogle().catch((err) =>
                setError(err instanceof Error ? err.message : 'Google sign-in failed.'),
              );
            }}
          >
            Continue with Google
          </button>
          <div className="auth-divider">or</div>
          {sent ? (
            <p className="hint">
              Check <strong>{email}</strong> for a sign-in link.
            </p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                sendEmailLink(email)
                  .then(() => setSent(true))
                  .catch((err) =>
                    setError(err instanceof Error ? err.message : 'Could not send that link.'),
                  );
              }}
            >
              <div className="field">
                <label htmlFor="signin-email">Email (no password — we'll send a link)</label>
                <input
                  id="signin-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="actions">
                <button type="button" className="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary">
                  Send link
                </button>
              </div>
            </form>
          )}
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </div>
  );
}
