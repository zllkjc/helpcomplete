export type ValueType = 'file' | 'directory' | 'boolean' | 'unknown';

const FILE_HINTS = ['file', 'path', 'filename', 'filepath'];
const DIR_HINTS = ['dir', 'directory', 'folder'];
const BOOL_HINTS = ['boolean', 'bool', 'true|false'];

// Simple heuristic per spec section 9: look at the placeholder name inside
// <...>/[...] (e.g. "<file>", "<path>") and bucket it into a known type.
// Anything else (e.g. "<mode>") is left "unknown" so we don't guess wrong.
export function inferValueType(placeholder: string | undefined): ValueType {
  if (!placeholder) return 'unknown';
  const clean = placeholder
    .replace(/[<>[\]]/g, '')
    .trim()
    .toLowerCase();
  if (!clean) return 'unknown';

  if (BOOL_HINTS.some((h) => clean === h || clean.includes(h))) return 'boolean';
  if (DIR_HINTS.some((h) => clean === h || clean.includes(h))) return 'directory';
  if (FILE_HINTS.some((h) => clean === h || clean.includes(h))) return 'file';
  return 'unknown';
}
