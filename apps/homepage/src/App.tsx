const tools = [
  {
    name: 'PDF Redactor',
    description: 'Black out sensitive parts of a PDF, entirely in your browser.',
    href: '/pdf-redactor/',
  },
  {
    name: 'Audio Transcriber',
    description: 'Transcribe audio and video files to timestamped text, entirely in your browser.',
    href: '/audio-transcriber/',
  },
  {
    name: 'Trip Planner',
    description: 'Keep a simple day-by-day itinerary for a trip, saved on this device.',
    href: '/trip-planner/',
  },
];

export default function App() {
  return (
    <main className="page">
      <h1>Vuong's Toolbox</h1>
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
    </main>
  );
}
