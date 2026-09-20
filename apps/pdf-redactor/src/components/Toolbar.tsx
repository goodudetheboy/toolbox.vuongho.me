interface Props {
  onUndo: () => void;
  onClear: () => void;
  onExport: () => void;
  exportDisabled?: boolean;
}

export default function Toolbar({ onUndo, onClear, onExport, exportDisabled }: Props) {
  return (
    <div className="toolbar">
      <button onClick={onUndo}>Undo</button>
      <button onClick={onClear}>Clear page</button>
      <button className="primary" onClick={onExport} disabled={exportDisabled}>
        {exportDisabled ? 'Exporting…' : 'Export PDF'}
      </button>
    </div>
  );
}
