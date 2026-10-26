import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { imageIdFromSrc, useImage } from '../lib/images';

/** A picture pasted into a part (`![](img:ID)`), shown as a little photo print. */
function NoteImage({ src }: { src?: string }) {
  const url = useImage(imageIdFromSrc(src));
  return url ? <img className="note-img" src={url} alt="" /> : <span className="note-img loading" aria-hidden />;
}

// Keep our own `img:` references; everything else gets react-markdown's usual safe-URL check.
const urlTransform = (url: string) => (imageIdFromSrc(url) ? url : defaultUrlTransform(url));

export default function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={urlTransform} components={{ img: ({ src }) => <NoteImage src={typeof src === 'string' ? src : undefined} /> }}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
