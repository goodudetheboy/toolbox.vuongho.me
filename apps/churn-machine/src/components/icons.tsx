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
export const LogoMark = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
    <rect width="28" height="28" rx="8" fill="var(--accent)" />
    <ellipse cx="14" cy="17.5" rx="7" ry="2.6" fill="#fff" opacity="0.55" />
    <ellipse cx="14" cy="14" rx="7" ry="2.6" fill="#fff" opacity="0.8" />
    <ellipse cx="14" cy="10.5" rx="7" ry="2.6" fill="#fff" />
  </svg>
);
