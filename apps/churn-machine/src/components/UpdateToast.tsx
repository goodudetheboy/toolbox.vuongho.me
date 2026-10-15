import { useRegisterSW } from 'virtual:pwa-register/react';

const HOUR = 60 * 60 * 1000;

/**
 * Registers the service worker and offers a new version when one is ready.
 * Never reloads on its own, so a half-typed note isn't lost.
 */
export function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      // An installed app can stay open for days: check hourly and when it comes back.
      setInterval(() => void reg.update(), HOUR);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update();
      });
    },
  });

  if (!needRefresh) return null;
  return (
    <div className="toast" role="status">
      <span>A new version is ready.</span>
      <button
        type="button"
        className="btn small primary"
        onClick={() => {
          // workbox-window only reloads if a worker already controlled the page,
          // which isn't true in the first session after install.
          navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
          void updateServiceWorker(true);
        }}
      >
        Update
      </button>
      <button type="button" className="btn quiet small" aria-label="Later" onClick={() => setNeedRefresh(false)}>✕</button>
    </div>
  );
}
