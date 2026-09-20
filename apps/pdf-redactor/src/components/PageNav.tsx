interface Props {
  page: number;
  numPages: number;
  onPrev: () => void;
  onNext: () => void;
}

export default function PageNav({ page, numPages, onPrev, onNext }: Props) {
  return (
    <div className="page-nav">
      <button onClick={onPrev} disabled={page <= 1}>
        Prev
      </button>
      <span>
        Page {page} of {numPages}
      </span>
      <button onClick={onNext} disabled={page >= numPages}>
        Next
      </button>
    </div>
  );
}
