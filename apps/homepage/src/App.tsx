import { tools } from './tools';
import { ToolIcon } from './ToolIcon';

export default function App() {
  return (
    <main className="list-inner">
      <header className="list-head">
        <h1>Vuong's Toolbox</h1>
        <p className="subtitle">Small tools that make life easier.</p>
      </header>
      <ul className="tool-list">
        {tools.map((tool) => (
          <li key={tool.href}>
            <a className="tool-card" href={tool.href}>
              <span className="tool-icon">
                <ToolIcon icon={tool.icon} />
              </span>
              <span className="tool-text">
                <span className="tool-name">{tool.name}</span>
                <span className="tool-description">{tool.description}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
