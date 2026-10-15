// The user guide: src/guide.md, rendered by a tiny markdown subset (headings,
// paragraphs, "- " lists, "> " tips, **bold**, _italic_, `code`, [links](url)).
// Builds React elements, never raw HTML. Keep guide.md current: see CLAUDE.md.
import guide from '../guide.md?raw';

type Block =
  | { kind: 'h1' | 'h2' | 'h3' | 'p' | 'tip' | 'meta'; text: string }
  | { kind: 'ul'; items: string[] };

function parse(md: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: 'p', text: para.join(' ') });
    para = [];
  };
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,3}) (.*)$/);
    if (!line.trim()) { flush(); continue; }
    if (h) { flush(); blocks.push({ kind: (['h1', 'h2', 'h3'] as const)[h[1].length - 1], text: h[2] }); continue; }
    if (line.startsWith('- ')) {
      flush();
      const last = blocks[blocks.length - 1];
      if (last?.kind === 'ul') last.items.push(line.slice(2));
      else blocks.push({ kind: 'ul', items: [line.slice(2)] });
      continue;
    }
    if (line.startsWith('> ')) { flush(); blocks.push({ kind: 'tip', text: line.slice(2) }); continue; }
    if (/^_[^_]+_$/.test(line)) { flush(); blocks.push({ kind: 'meta', text: line.slice(1, -1) }); continue; }
    para.push(line.trim());
  }
  flush();
  return blocks;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|`[^`]+`|_[^_]+_)/g).filter(Boolean).map((part, i) => {
    if (part.startsWith('**')) return <b key={i}>{part.slice(2, -2)}</b>;
    if (part.startsWith('`')) return <span key={i} className="code">{part.slice(1, -1)}</span>;
    if (/^_[^_]+_$/.test(part)) return <i key={i}>{part.slice(1, -1)}</i>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const external = /^https?:/.test(link[2]);
      return <a key={i} href={link[2]} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>{link[1]}</a>;
    }
    return part;
  });
}

const BLOCKS = parse(guide);
const SECTIONS = BLOCKS.filter((b): b is { kind: 'h2'; text: string } => b.kind === 'h2');

export function GuidePage() {
  return (
    <div className="layout guide">
      <aside className="layout-side guide-toc">
        <div className="card">
          <h3>Contents</h3>
          <nav>
            {SECTIONS.map((s) => <a key={s.text} href={`#${slug(s.text)}`}>{s.text}</a>)}
          </nav>
        </div>
      </aside>
      <article className="layout-main guide-body">
        {BLOCKS.map((b, i) => {
          switch (b.kind) {
            case 'h1': return <div key={i} className="page-head"><h1>{inline(b.text)}</h1></div>;
            case 'h2': return <h2 key={i} id={slug(b.text)}>{inline(b.text)}</h2>;
            case 'h3': return <h3 key={i}>{inline(b.text)}</h3>;
            case 'meta': return <p key={i} className="muted small">{inline(b.text)}</p>;
            case 'tip': return <div key={i} className="callout">{inline(b.text)}</div>;
            case 'ul': return <ul key={i} className="bullets">{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ul>;
            default: return <p key={i}>{inline(b.text)}</p>;
          }
        })}
      </article>
    </div>
  );
}
