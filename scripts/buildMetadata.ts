import { execFileSync } from 'node:child_process';

/** Only these public identifiers are compiled into the client bundle. */
export function buildMetadata(command: string, environment = process.env, git: (args: string[]) => string = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(), now = () => new Date()) {
  let revision = environment.VERCEL_GIT_COMMIT_SHA || '';
  if (!/^[a-f0-9]{40}$/i.test(revision)) {
    try {
      revision = git(['rev-parse', 'HEAD']);
      if (!/^[a-f0-9]{40}$/i.test(revision)) revision = '';
      else if (git(['status', '--porcelain']).trim()) revision += '-dirty';
    } catch { revision = ''; }
  }
  return { revision: revision || null, builtAt: command === 'build' ? now().toISOString() : null };
}
