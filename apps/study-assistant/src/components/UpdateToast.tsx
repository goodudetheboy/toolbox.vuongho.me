import { useRegisterSW } from 'virtual:pwa-register/react';
import { t } from '../strings';

const HOUR = 60 * 60 * 1000;

/**
 * Registers the service worker and, when a new version has downloaded, offers to
 * switch to it. Never reloads on its own — that could cut off a recitation.
 */
export default function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // Without this it waits for window "load", which has usually fired before React mounts us.
    immediate: true,
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      // An installed app can stay open for days: look for a new version hourly and on return.
      setInterval(() => void reg.update(), HOUR);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update();
      });
    },
  });

  if (!needRefresh) return null;
  return (
    <div className="update-toast" role="status">
      <span>{t.updateReady}</span>
      <button
        className="btn btn-primary"
        onClick={() => {
          // workbox-window only reloads if a worker already controlled the page when it registered,
          // so an update during the very first session would activate silently — reload ourselves.
          navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
          void updateServiceWorker(true);
        }}
      >
        {t.update}
      </button>
      <button className="text-btn quiet" onClick={() => setNeedRefresh(false)} aria-label={t.later}>
        ✕
      </button>
    </div>
  );
}
