import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const [root,previous,release,processName,healthUrl] = process.argv.slice(2);
const current = path.join(root,'current');
const status = (state,error) => fs.writeFile(path.join(root,'update-status.json'),JSON.stringify({state,release,error,at:new Date().toISOString()}));
const switchTo = async target => {
  const temporary = path.join(root,`switch-${process.pid}`);
  await fs.rm(temporary,{force:true});
  await fs.symlink(target,temporary); await fs.rename(temporary,current);
};
await new Promise(r => setTimeout(r,1500));
try {
  await status('activating');
  await switchTo(release);
  await run('pm2',['restart',processName,'--update-env'],{cwd:root});
  let healthy = false;
  for (let i=0;i<15;i++) {
    await new Promise(r => setTimeout(r,2000));
    try { if ((await fetch(healthUrl,{signal:AbortSignal.timeout(2000)})).ok) { healthy=true; break; } } catch {}
  }
  if (!healthy) throw new Error('Der neue Prozess hat den Startcheck nicht bestanden.');
  await status('active');
} catch (e) {
  await switchTo(previous);
  try {
    await run('pm2',['restart',processName,'--update-env'],{cwd:root});
    await status('rolled-back',e.message);
  } catch (rollbackError) { await status('rollback-failed',`${e.message}; ${rollbackError.message}`); }
} finally { await fs.unlink(path.join(root,'update.lock')).catch(()=>{}); }
