import { lazy, Suspense } from 'react';
import Biggu from '../components/Biggu';
import TopBar from '../components/TopBar';
import { isAdmin } from '../lib/feedback';
import type { AdminTab, Route } from '../lib/router';
import type { AppUser } from '../lib/types';
import { t } from '../strings';
import AdminFeedback from './AdminFeedback';

const AdminUsage = lazy(() => import('./AdminUsage'));
const AdminAccess = lazy(() => import('./AdminAccess'));
const AdminMessages = lazy(() => import('./AdminMessages'));

const TABS: AdminTab[] = ['feedback', 'messages', 'usage', 'access'];

/**
 * Admin page (/study-assistant/admin[/usage]): Feedback and Usage tabs. Only shown to
 * ADMIN_EMAIL — the Firestore rules are what actually keep everyone else out.
 */
export default function Admin({
  user,
  tab,
  navigate,
  onBack,
}: {
  user: AppUser;
  tab: AdminTab;
  navigate: (r: Route, options?: { replace?: boolean }) => void;
  onBack: () => void;
}) {
  const loading = (
    <div className="progress-state">
      <Biggu mood="think" size={110} className="bob" />
    </div>
  );

  return (
    <main className="screen">
      <TopBar onBack={onBack} title={<span className="hand">{t.admin.title}</span>} />

      {!isAdmin(user.email) ? (
        <div className="progress-state">
          <Biggu mood="think" size={110} />
          <p className="muted">{t.admin.notAdmin}</p>
        </div>
      ) : (
        <>
          <div className="seg admin-tabs" role="tablist">
            {TABS.map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                className={tab === k ? 'on' : ''}
                onClick={() => tab !== k && navigate({ name: 'admin', tab: k }, { replace: true })}
              >
                {t.admin.tabs[k]}
              </button>
            ))}
          </div>
          {tab === 'feedback' ? (
            <AdminFeedback user={user} />
          ) : (
            <Suspense fallback={loading}>
              {tab === 'usage' ? (
                <AdminUsage user={user} />
              ) : tab === 'messages' ? (
                <AdminMessages user={user} />
              ) : (
                <AdminAccess user={user} />
              )}
            </Suspense>
          )}
        </>
      )}
    </main>
  );
}
