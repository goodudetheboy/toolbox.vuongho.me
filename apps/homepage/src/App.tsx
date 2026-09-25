import { useEffect, useRef, useState } from 'react';
import { tools, type Tool } from './tools';
import type { SceneState, ToolboxScene } from './scene/ToolboxScene';

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function ToolList({ onClose }: { onClose?: () => void }) {
  return (
    <div className="list-panel">
      <div className="list-inner">
        <div className="list-head">
          <h1>Vuong's Toolbox</h1>
          {onClose && (
            <button className="btn" onClick={onClose}>
              Back to the garage
            </button>
          )}
        </div>
        <p className="subtitle">Small tools that make life easier.</p>
        <ul className="tool-list">
          {tools.map((tool) => (
            <li key={tool.href}>
              <a className="tool-card" href={tool.href}>
                <span className="tool-name">{tool.name}</span>
                <span className="tool-description">{tool.description}</span>
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
  const [listView, setListView] = useState(false);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<SceneState>('closed');
  const [focus, setFocus] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const mount = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const scene = useRef<ToolboxScene | null>(null);
  const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  useEffect(() => {
    if (!webgl || !mount.current || !label.current) return;
    let cancelled = false;
    let timer = 0;
    import('./scene/ToolboxScene').then(({ ToolboxScene }) => {
      if (cancelled || !mount.current || !label.current) return;
      scene.current = new ToolboxScene(mount.current, tools, label.current, {
        onState: setState,
        onFocus: setFocus,
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
    };
  }, [webgl]);

  if (!webgl) return <ToolList />;

  const focused = focus !== null && focus >= 0 ? tools[focus] : null;
  const verb = touch ? 'Tap' : 'Click';

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

      <button className="btn list-toggle" onClick={() => setListView(true)}>
        List view
      </button>

      <div ref={label} className={`tool-label ${focus !== null ? 'show' : ''}`} aria-hidden="true">
        <div className="tool-label-card">
          {focus === -1 ? (
            <span className="tool-name">Open toolbox</span>
          ) : focused ? (
            <>
              <span className="tool-name">{focused.name}</span>
              <span className="tool-description">{focused.description}</span>
              {touch && <span className="tool-hint">Tap again to open</span>}
            </>
          ) : null}
        </div>
      </div>

      <footer className={`hint ${ready ? 'show' : ''}`}>
        {state === 'closed' && <span>{verb} the toolbox to open it</span>}
        {(state === 'open' || state === 'opening') && (
          <>
            <span>{verb} a tool to use it · drag things around</span>
            <button className="btn" onClick={() => scene.current?.close()}>
              Close lid
            </button>
          </>
        )}
        {state === 'closing' && <span>Packing up…</span>}
      </footer>

      {!ready && <div className="loading">Opening the garage…</div>}
      <div className={`fade ${leaving ? 'show' : ''}`} />
      {listView && <ToolList onClose={() => setListView(false)} />}
    </main>
  );
}
