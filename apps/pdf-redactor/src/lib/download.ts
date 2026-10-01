export function triggerDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as unknown as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  // Mobile browsers (iOS Safari, Android Chrome) only honor the click when the
  // anchor is in the DOM, and fetch the blob asynchronously after it — revoking
  // the URL right away makes the download silently fail there.
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
