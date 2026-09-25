import { useEffect, useRef, useState } from 'react';
import { tools, type Tool } from './tools';
import { ToolIcon } from './ToolIcon';
import type { SceneState, ToolboxScene } from './scene/ToolboxScene';

type Mode = 'list' | '3d';
const MODE_KEY = 'toolbox.view';

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

// Phones default to the plain list (the 3D scene is heavy on battery); a
// choice the visitor makes is remembered for next time.
function initialMode(webgl: boolean): Mode {
  if (!webgl) return 'list';
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === 'list' || saved === '3d') return saved;
  } catch {
    /* storage blocked: fall through to the default */
  }
  return isTouch() ? 'list' : '3d';
}

function saveMode(m: Mode) {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    /* ignore */
  }
}

function ToolList({ onGarage }: { onGarage?: () => void }) {
  return (
    <div className="list-panel">
      <div className="list-inner">
        <div className="list-head">
          <div>
            <h1>Vuong's Toolbox</h1>
            <p className="subtitle">Small tools that make life easier.</p>
          </div>
          {onGarage && (
            <button className="btn" onClick={onGarage}>
              Open the garage (3D)
            </button>
          )}
        </div>
        <ul className="tool-list">
          {tools.map((tool) => (
            <li key={tool.href}>
              <a className="tool-card" href={tool.href}>
                <span className="tool-icon">
                  <ToolIcon model={tool.model} />
                </span>
                <span className="tool-text">
                  <span className="tool-name">{tool.name}</span>
                  <span className="tool-description">{tool.description}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function App() {
  const [webgl] = useState(hasWebGL);
  const [mode, setMode] = useState<Mode>(() => initialMode(webgl));
  const [started, setStarted] = useState(mode === '3d');
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<SceneState>('closed');
  const [selected, setSelected] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const mount = useRef<HTMLDivElement>(null);
  const scene = useRef<ToolboxScene | null>(null);
  const touch = isTouch();

  const switchMode = (m: Mode) => {
    setMode(m);
    saveMode(m);
    if (m === '3d') setStarted(true);
  };

  // The scene is only created the first time 3D is shown, then paused
  // (not torn down) while the list is up.
  useEffect(() => {
    if (!started || !mount.current) return;
    let cancelled = false;
    let timer = 0;
    import('./scene/ToolboxScene').then(({ ToolboxScene }) => {
      if (cancelled || !mount.current) return;
      scene.current = new ToolboxScene(mount.current, tools, {
        onState: (s) => {
          setState(s);
          if (s === 'closed' || s === 'closing') setSelected(null);
        },
        onSelect: setSelected,
        onLaunch: (tool: Tool) => {
          setLeaving(true);
          timer = window.setTimeout(() => window.location.assign(tool.href), 650);
        },
      });
      setReady(true);
    });
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      setLeaving(false);
      scene.current?.restore();
    };
    window.addEventListener('pageshow', onShow);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener('pageshow', onShow);
      scene.current?.dispose();
      scene.current = null;
      setReady(false);
    };
  }, [started]);

  useEffect(() => {
    scene.current?.setPaused(mode === 'list');
  }, [mode, ready]);

  if (!webgl) return <ToolList />;

  const verb = touch ? 'Tap' : 'Click';
  const sel = selected !== null ? tools[selected] : null;
  const showPanel = sel && (state === 'open' || state === 'opening');

  return (
    <main className="stage">
      <div ref={mount} className="canvas-host" />

      {/* keyboard / screen-reader access to the same links */}
      <nav className="sr-nav" aria-label="Tools">
        {tools.map((t) => (
          <a key={t.href} href={t.href}>
            {t.name}
          </a>
        ))}
      </nav>

      <header className="brand">
        <h1>Vuong's Toolbox</h1>
        <p>Small tools that make life easier.</p>
      </header>

      <button className="btn list-toggle" onClick={() => switchMode('list')}>
        List view
      </button>

      <aside className={`info-panel ${showPanel ? 'show' : ''}`} aria-live="polite">
        {sel && (
          <>
            <button className="info-close" aria-label="Dismiss" onClick={() => setSelected(null)}>
              ×
            </button>
            <div className="info-icon">
              <ToolIcon model={sel.model} size={64} />
            </div>
            <h2>{sel.name}</h2>
            <p>{sel.description}</p>
            <button className="btn btn-primary" onClick={() => scene.current?.launchTool(selected!)}>
              Open {sel.name} →
            </button>
          </>
        )}
      </aside>

      <footer className={`hint ${ready ? 'show' : ''}`}>
        {state === 'closed' && <span>{verb} the toolbox to open it</span>}
        {(state === 'open' || state === 'opening') && (
          <>
            <span>
              {touch ? 'Hold a tool to see what it is · tap to open it' : 'Pick up a tool to see what it is · click to open it'}
            </span>
            <button className="btn" onClick={() => scene.current?.close()}>
              Close lid
            </button>
          </>
        )}
        {state === 'closing' && <span>Packing up…</span>}
      </footer>

      {started && !ready && <div className="loading">Opening the garage…</div>}
      <div className={`fade ${leaving ? 'show' : ''}`} />
      {mode === 'list' && <ToolList onGarage={() => switchMode('3d')} />}
    </main>
  );
}
