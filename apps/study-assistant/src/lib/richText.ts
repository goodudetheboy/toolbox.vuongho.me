import { marked } from 'marked';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

// Markdown ⇄ HTML for the rich-text editor. Markdown stays the stored format;
// the rich editor is a contenteditable view of it, converted back on save.
// Only loaded with the editor screen.

const ALLOWED = new Set([
  'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'DEL', 'S', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'CODE', 'HR', 'A', 'DIV', 'SPAN',
]);

/** Keeps only formatting tags and drops every attribute (no scripts, handlers or styles). */
function sanitize(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walk = (el: Element) => {
    for (const child of [...el.children]) {
      walk(child);
      if (!ALLOWED.has(child.tagName)) {
        if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT'].includes(child.tagName)) child.remove();
        else child.replaceWith(...child.childNodes);
      } else {
        for (const attr of [...child.attributes]) if (attr.name !== 'href') child.removeAttribute(attr.name);
      }
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

export function markdownToHtml(md: string): string {
  return sanitize(marked.parse(md, { gfm: true, async: false }));
}

const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', emDelimiter: '*', strongDelimiter: '**' });
turndown.use(gfm);

export function htmlToMarkdown(html: string): string {
  return turndown
    .turndown(sanitize(html))
    .replace(/^(\s*)([-*+]|\d+\.) {2,}/gm, '$1$2 ') // "-   item" → "- item"
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
