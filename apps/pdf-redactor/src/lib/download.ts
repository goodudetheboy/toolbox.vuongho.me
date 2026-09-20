export function triggerDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as unknown as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
