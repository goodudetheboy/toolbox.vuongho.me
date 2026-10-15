// Line icons for the tab bar (24px grid, 2px stroke, currentColor).
const base = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const DealsIcon = () => (
  <svg {...base}><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>
);
export const PlanIcon = () => (
  <svg {...base}><path d="M3 17l5-5 4 4 8-8" /><path d="M15 8h5v5" /></svg>
);
export const AccountsIcon = () => (
  <svg {...base}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><path d="M7 15h3" /></svg>
);
/** The app icon itself (public/icon.svg), rounded like a home-screen icon. */
export const LogoMark = () => (
  <img src={`${import.meta.env.BASE_URL}icon.svg`} width={28} height={28} alt="" style={{ borderRadius: 8, display: 'block' }} />
);
