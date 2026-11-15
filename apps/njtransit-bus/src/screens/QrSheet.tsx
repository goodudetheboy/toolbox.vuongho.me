import qrcode from 'qrcode-generator';

const URL = 'https://toolbox.vuongho.me/njtransit-bus/';

// The app's link as a QR code, for a friend to scan off your phone.
export default function QrSheet({ onClose }: { onClose: () => void }) {
  const qr = qrcode(0, 'M');
  qr.addData(URL);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;

  return (
    <div className="stats" role="dialog" aria-label="Share">
      <div className="stats-head">
        <div className="label">SHARE</div>
        <button className="flip" onClick={onClose} aria-label="Close">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" aria-hidden="true">
            <path d="M5 5l14 14M19 5L5 19" />
          </svg>
        </button>
      </div>
      <div className="qr">
        <svg viewBox={`-4 -4 ${n + 8} ${n + 8}`} shapeRendering="crispEdges" role="img" aria-label={`QR code for ${URL}`}>
          <rect x="-4" y="-4" width={n + 8} height={n + 8} fill="#fff" />
          <path d={d} fill="#005097" />
        </svg>
        <div className="small">SCAN TO OPEN BUS ON ANOTHER PHONE</div>
        <div className="small">TOOLBOX.VUONGHO.ME/NJTRANSIT-BUS</div>
      </div>
    </div>
  );
}
