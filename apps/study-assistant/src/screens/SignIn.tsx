import { useState } from 'react';
import Biggu from '../components/Biggu';
import { Heart, Paper, Star } from '../components/Scrap';
import { signInWithGoogle, signOut } from '../lib/auth';
import { t } from '../strings';

export default function SignIn({ notAllowed }: { notAllowed?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  return (
    <main className="screen center">
      <div className="hero">
        <Star size={30} style={{ position: 'absolute', left: 8, top: 20, transform: 'rotate(-12deg)' }} />
        <Heart size={26} style={{ position: 'absolute', right: 14, top: 60 }} />
        <Biggu mood={notAllowed ? 'think' : 'wave'} size={200} />
      </div>
      <Paper tilt={-1.5} tape="pink" className="hero-card">
        <h1 className="hand">{t.appName}</h1>
        <p className="tagline">{t.tagline}</p>
        {notAllowed ? (
          <>
            <p className="note-text">{t.notAllowed}</p>
            <button className="btn" onClick={() => signOut()}>
              {t.signOut}
            </button>
          </>
        ) : (
          <button
            className="btn btn-primary btn-big"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(false);
              try {
                await signInWithGoogle();
              } catch {
                setError(true);
              } finally {
                setBusy(false);
              }
            }}
          >
            <GoogleG /> {t.signIn}
          </button>
        )}
        {error && <p className="error-text">{t.error}</p>}
      </Paper>
    </main>
  );
}

function GoogleG() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
