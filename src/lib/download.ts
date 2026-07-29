export function downloadBlob(content: BlobPart, filename: string, mimeType: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Prefix cells that could trigger formula injection in Excel/Sheets. */
export function sanitizeCsvCell(value: string | number): string {
  const str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str.replace(/"/g, '""');
}

export function escapeCsvRow(cells: (string | number)[]): string {
  return cells.map((c) => `"${sanitizeCsvCell(c)}"`).join(',');
}
