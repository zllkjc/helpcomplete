// Commands we must never auto-probe with --help / -h, even though those flags
// are themselves "safe": some of these tools change behavior or hang waiting
// on interactive input in ways that vary by platform/version. Better to just
// never touch them from a Tab-triggered background process.
export const DEFAULT_DENYLIST = [
  'rm',
  'shutdown',
  'reboot',
  'sudo',
  'su',
  'ssh',
  'scp',
  'poweroff',
  'halt',
  'mkfs',
  'dd',
];

export function isDenied(basename: string): boolean {
  const extra = (process.env.HELPCOMPLETE_DENYLIST || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const list = new Set([...DEFAULT_DENYLIST, ...extra]);
  return list.has(basename);
}
