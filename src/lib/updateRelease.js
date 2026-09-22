import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
const run = promisify(execFile);
export async function updateRelease(branch) {
  if (typeof branch !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(branch)) throw new Error('Ungültiger Branchname.');
  await run('git',['check-ref-format','--branch',branch]);
  const root = process.env.HELPDESK_RELEASE_ROOT;
  const data = process.env.HELPDESK_DATA_DIR;
  if (!root || !data || !process.env.HELPDESK_UPLOAD_DIR || !process.env.HELPDESK_PM2_NAME) throw new Error('Release-Betrieb ist noch nicht eingerichtet. Bitte deployment.md befolgen. Die laufende Installation wurde nicht verändert.');
  for (const dir of [data,process.env.HELPDESK_UPLOAD_DIR]) {
    const real = await fs.realpath(dir);
    if (real.startsWith(path.resolve(root,'releases') + path.sep)) throw new Error('Datenverzeichnisse müssen außerhalb der Releases liegen.');
  }
  const current = path.join(root,'current');
  if (!(await fs.lstat(current)).isSymbolicLink()) throw new Error('current muss ein Release-Symlink sein.');
  const previous = await fs.readlink(current);
  const lockPath = path.join(root,'update.lock');
  const lock = await fs.open(lockPath,'wx').catch(() => { throw new Error('Ein Update läuft bereits.'); });
  const release = path.join(root,'releases',`${Date.now()}-${randomUUID()}`);
  const stagingData = path.join(root,'build-data',randomUUID());
  let activationStarted = false;
  const logs = [];
  const execute = async (command,args,options={}) => {
    const result = await run(command,args,{cwd:release,timeout:900000,maxBuffer:8*1024*1024,...options});
    logs.push(result.stdout); return result;
  };
  try {
    await fs.mkdir(path.dirname(release),{recursive:true});
    const {stdout:remote} = await run('git',['remote','get-url','origin']);
    if (!/^https:\/\/github\.com\/famnex\/it_helpdesk_bot(?:\.git)?\s*$/.test(remote)) throw new Error('Unerwartetes Update-Repository.');
    await execute('git',['clone','--depth','1','--branch',branch,'--',remote.trim(),release],{cwd:root});
    await execute('npm',['ci']);
    // Build must never run migrations against the live database.
    await execute('npm',['run','build'],{env:{...process.env,HELPDESK_DATA_DIR:stagingData,HELPDESK_UPLOAD_DIR:path.join(stagingData,'uploads')}});
    await fs.access(path.join(release,'scripts','activate-release.mjs'));
    // A detached supervisor survives the restart of this HTTP process.
    const child = spawn(process.execPath,[path.join(release,'scripts','activate-release.mjs'),root,previous,release,process.env.HELPDESK_PM2_NAME,`http://127.0.0.1:${process.env.PORT || 3005}/helpdesk/api/auth/me`],{cwd:root,detached:true,stdio:'ignore',env:process.env});
    await new Promise((resolve,reject) => { child.once('spawn',resolve); child.once('error',reject); });
    child.unref(); activationStarted = true;
    return {release,logs:logs.join('\n')};
  } finally {
    await fs.rm(stagingData,{recursive:true,force:true});
    await lock.close(); if (!activationStarted) await fs.unlink(lockPath);
  }
}
