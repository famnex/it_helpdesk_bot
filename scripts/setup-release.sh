#!/usr/bin/env bash
# One-time migration of an existing PM2 installation. Run as its PM2 owner.
set -Eeuo pipefail
umask 077
source_dir="${1:-/var/www/it_helpdesk}"
release_root="${2:-/srv/helpdesk}"
process_name="${3:-it-helpdesk}"
for command in node npm pm2 python3 git; do command -v "$command" >/dev/null; done
[[ "$source_dir" = /* && "$release_root" = /* ]] || { echo 'Absolute paths required.' >&2; exit 1; }
[[ -f "$source_dir/database.db" && -f "$source_dir/package-lock.json" ]] || { echo 'Source database or lockfile missing.' >&2; exit 1; }
case "$release_root/" in "$source_dir/"*) echo 'Release target must be outside source.' >&2; exit 1;; esac
[[ ! -e "$release_root" ]] || { echo "Target already exists: $release_root. No changes made." >&2; exit 1; }
mkdir -p "$release_root"/{releases,shared/uploads,build-data}
export HELPDESK_SETUP_ROOT="$release_root" HELPDESK_SETUP_SOURCE="$source_dir" HELPDESK_SETUP_NAME="$process_name"
pm2 jlist > "$release_root/previous-pm2.json"
node <<'JS'
const fs=require('fs');
const root=process.env.HELPDESK_SETUP_ROOT;
const app=JSON.parse(fs.readFileSync(root+'/previous-pm2.json')).find(p=>p.name===process.env.HELPDESK_SETUP_NAME);
if(!app || app.pm2_env.status!=='online')throw Error('Expected PM2 process is not online.');
const e=app.pm2_env;
if(fs.realpathSync(e.pm_cwd)!==fs.realpathSync(process.env.HELPDESK_SETUP_SOURCE))throw Error('PM2 working directory differs from source.');
if(e.env?.HELPDESK_DATA_DIR || e.env?.HELPDESK_UPLOAD_DIR)throw Error('Custom data paths require an individual migration.');
fs.writeFileSync(root+'/previous.config.cjs','module.exports='+JSON.stringify({apps:[{name:app.name,script:e.pm_exec_path,args:e.args,cwd:e.pm_cwd,interpreter:e.exec_interpreter,exec_mode:'fork',instances:1,env:e.env||{}}]},null,2));
JS
# A private runtime avoids changing Node for other applications.
npm install --prefix "$release_root/runtime" --no-audit --no-fund node@22
export PATH="$release_root/runtime/node_modules/node/bin:$PATH"
release="$release_root/releases/initial"
mkdir "$release"
cp -a "$source_dir/." "$release/"
rm -rf "$release/node_modules" "$release/.next" "$release/uploads" "$release/public/uploads"
rm -f "$release/database.db" "$release/database.db-wal" "$release/database.db-shm"
(
  cd "$release"
  npm ci
  HELPDESK_DATA_DIR="$release_root/build-data" HELPDESK_UPLOAD_DIR="$release_root/build-data/uploads" npm run build
)
ln -s "$release" "$release_root/current"
# PM2 must resolve Next from the current release on EVERY restart.
cat > "$release_root/start.cjs" <<'JS'
const path=require('path');
process.chdir(path.join(__dirname,'current'));
require(require.resolve('next/dist/bin/next',{paths:[process.cwd()]}));
JS
node <<'JS'
const fs=require('fs'),path=require('path'),{parseEnv}=require('node:util');
const root=process.env.HELPDESK_SETUP_ROOT,source=process.env.HELPDESK_SETUP_SOURCE;
const old=require(root+'/previous.config.cjs').apps[0];
let env={};
for(const file of ['.env','.env.production','.env.local','.env.production.local']) {
 const p=path.join(source,file);if(fs.existsSync(p)){const values=parseEnv(fs.readFileSync(p,'utf8'));if(Object.values(values).some(v=>/\$\{?[A-Za-z_]/.test(v)))throw Error('Interpolated .env values require individual migration.');Object.assign(env,values);}
}
Object.assign(env,old.env);
if(env.HELPDESK_DATA_DIR || env.HELPDESK_UPLOAD_DIR)throw Error('Custom data paths require an individual migration.');
Object.assign(env,{NODE_ENV:'production',PATH:process.env.PATH,HELPDESK_RELEASE_ROOT:root,HELPDESK_DATA_DIR:root+'/shared',HELPDESK_UPLOAD_DIR:root+'/shared/uploads',HELPDESK_PM2_NAME:old.name});
fs.writeFileSync(root+'/ecosystem.config.cjs','module.exports='+JSON.stringify({apps:[{...old,cwd:root+'/current',script:root+'/start.cjs',interpreter:root+'/runtime/node_modules/node/bin/node',env}]},null,2));
JS
stopped=0
rollback() {
  code=$?
  if (( stopped )); then
    echo 'Migration failed. Restoring previous PM2 application.' >&2
    pm2 delete "$process_name" || true
    pm2 start "$release_root/previous.config.cjs" && pm2 save || true
  fi
  echo "Preparation retained at $release_root; inspect before retrying." >&2
  exit "$code"
}
trap rollback ERR
pm2 stop "$process_name"
stopped=1
# Original installation remains untouched as a frozen fallback copy.
for file in database.db database.db-wal database.db-shm; do
  if [[ -f "$source_dir/$file" ]]; then cp -a "$source_dir/$file" "$release_root/shared/$file"; fi
done
python3 <<'PY'
import os,pathlib,shutil,filecmp
source=pathlib.Path(os.environ['HELPDESK_SETUP_SOURCE'])
target=pathlib.Path(os.environ['HELPDESK_SETUP_ROOT'])/'shared/uploads'
for folder in (source/'uploads',source/'public/uploads'):
 if not folder.exists(): continue
 for item in folder.rglob('*'):
  dest=target/item.relative_to(folder)
  if item.is_symlink(): raise RuntimeError('Upload symlink requires manual inspection: '+str(item))
  if item.is_dir(): dest.mkdir(parents=True,exist_ok=True)
  elif item.is_file():
   dest.parent.mkdir(parents=True,exist_ok=True)
   if dest.exists():
    if not filecmp.cmp(item,dest,shallow=False): raise RuntimeError('Conflicting upload: '+str(dest))
   else: shutil.copy2(item,dest)
PY
pm2 delete "$process_name"
pm2 start "$release_root/ecosystem.config.cjs"
node <<'JS'
const root=process.env.HELPDESK_SETUP_ROOT;
const config=require(root+'/ecosystem.config.cjs').apps[0];
(async()=>{for(let i=0;i<30;i++){
 try{const r=await fetch(`http://127.0.0.1:${config.env.PORT||3005}/helpdesk/api/auth/me`,{signal:AbortSignal.timeout(2000)});if(r.ok)return;}catch{}
 await new Promise(r=>setTimeout(r,1000));
}throw Error('New application failed startup check.');})().catch(e=>{console.error(e.message);process.exit(1)});
JS
pm2 save
stopped=0
trap - ERR
printf '\nRelease setup complete. Automatic updates are now available.\nOriginal installation retained at: %s\n' "$source_dir"
