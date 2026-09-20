interface Props {
  onUndo: () => void;
  onClear: () => void;
  onExportFast: () => void;
  onExportQuality: () => void;
  exportDisabled?: boolean;
  exportProgress?: { done: number; total: number } | null;
}

export default function Toolbar({
  onUndo,
  onClear,
  onExportFast,
  onExportQuality,
  exportDisabled,
  exportProgress,
}: Props) {
  return (
    <div className="toolbar">
      <button onClick={onUndo}>Undo</button>
      <button onClick={onClear}>Clear page</button>
      <button className="primary" onClick={onExportFast} disabled={exportDisabled}>
        Fast Export
      </button>
      <button className="primary" onClick={onExportQuality} disabled={exportDisabled}>
        Best Quality
      </button>
      {exportProgress && (
        <span className="export-progress">
          Exporting {exportProgress.done}/{exportProgress.total}…
        </span>
      )}
    </div>
  );
}
