import * as fs from 'fs';
import * as path from 'path';

export interface NpmMeta {
  isNpmBin: boolean;
  name?: string;
  version?: string;
  packageJsonPath?: string;
}

function findPackageJsonUpwards(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'package.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// Best-effort detection of npm-installed binaries (node_modules/.bin, global
// npm bin dirs) so package.json version can be folded into the cache key.
export function detectNpmMeta(executablePath: string): NpmMeta {
  let realPath = executablePath;
  try {
    realPath = fs.realpathSync(executablePath);
  } catch {
    // symlink resolution failed — fall back to the original path
  }

  const isNpmBin = realPath.includes(`${path.sep}node_modules${path.sep}`);
  if (!isNpmBin) return { isNpmBin: false };

  const pkgPath = findPackageJsonUpwards(path.dirname(realPath));
  if (!pkgPath) return { isNpmBin: true };

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return { isNpmBin: true, name: pkg.name, version: pkg.version, packageJsonPath: pkgPath };
  } catch {
    return { isNpmBin: true, packageJsonPath: pkgPath };
  }
}
