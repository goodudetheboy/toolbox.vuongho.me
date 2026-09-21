import type { AppSettings, ModelId } from '../types';

interface Props {
  settings: AppSettings;
  onChange: (s: AppSettings) => void;
  onClose: () => void;
}

const MODELS: { id: ModelId; name: string; desc: string }[] = [
  { id: 'Xenova/whisper-tiny.en', name: 'Fast', desc: 'Smallest (~39 MB) — quick results, decent accuracy' },
  { id: 'Xenova/whisper-base.en', name: 'Balanced', desc: 'Default (~74 MB) — great accuracy, reasonable speed' },
  { id: 'Xenova/whisper-small.en', name: 'Accurate', desc: 'Best quality (~244 MB) — slower, highest accuracy' },
];

export default function SettingsModal({ settings, onChange, onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Settings</h2>

        <div className="setting-group">
          <div className="setting-label">Model quality</div>
          {MODELS.map(m => (
            <label
              key={m.id}
              className={`model-option ${settings.model === m.id ? 'selected' : ''}`}
            >
              <input
                type="radio"
                name="model"
                value={m.id}
                checked={settings.model === m.id}
                onChange={() => onChange({ ...settings, model: m.id })}
              />
              <div className="model-option-info">
                <div className="model-option-name">{m.name}</div>
                <div className="model-option-desc">{m.desc}</div>
              </div>
            </label>
          ))}
        </div>

        <div className="modal-footer">
          <button className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
