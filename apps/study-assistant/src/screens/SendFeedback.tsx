import { useState } from 'react';
import Biggu from '../components/Biggu';
import { Paper } from '../components/Scrap';
import TopBar from '../components/TopBar';
import { MESSAGE_KINDS, sendMessage, type MessageKind } from '../lib/messages';
import type { AppUser } from '../lib/types';
import { t } from '../strings';

/** "Send feedback" from the account menu: what kind, a few words, send. */
export default function SendFeedback({ user, onBack }: { user: AppUser; onBack: () => void }) {
  const [kind, setKind] = useState<MessageKind>('idea');
  const [text, setText] = useState('');
  const [state, setState] = useState<'writing' | 'sending' | 'sent' | 'error'>('writing');

  async function send() {
    if (!text.trim() || state === 'sending') return;
    setState('sending');
    try {
      await sendMessage(user, kind, text);
      setState('sent');
    } catch {
      setState('error');
    }
  }

  if (state === 'sent') {
    return (
      <main className="screen center">
        <Biggu mood="cheer" size={170} />
        <p className="big-status hand">{t.messageThanks}</p>
        <button className="btn" onClick={onBack}>
          {t.back}
        </button>
      </main>
    );
  }

  return (
    <main className="screen">
      <TopBar onBack={onBack} title={<span className="hand">{t.sendFeedback}</span>} />

      <p className="ask hand">{t.messageAsk}</p>

      <div className="chips message-kinds" role="radiogroup" aria-label={t.messageKind}>
        {MESSAGE_KINDS.map((k) => (
          <button key={k} role="radio" aria-checked={kind === k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
            {t.messageKinds[k]}
          </button>
        ))}
      </div>

      <Paper tilt={0.5} tape="yellow" lined className="paste-card">
        <textarea
          className="paste-area message-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t.messagePlaceholder[kind]}
          maxLength={2000}
          aria-label={t.messageAsk}
        />
      </Paper>

      {state === 'error' && <p className="error-text">{t.error}</p>}

      <div className="bottom-action">
        <button className="btn btn-primary btn-big" onClick={send} disabled={!text.trim() || state === 'sending'}>
          {state === 'sending' ? t.saving : t.messageSend}
        </button>
      </div>
    </main>
  );
}
