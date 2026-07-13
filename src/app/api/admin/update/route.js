import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import db from '@/lib/db';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

export async function POST() {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 403 });
  }

  // GitHub-Konfiguration laden
  let branch = 'main';
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('github_config');
    if (row) {
      const config = JSON.parse(row.value);
      branch = config.branch || 'main';
    }
  } catch (e) {
    // ignorieren, Fallback auf main
  }

  try {
    console.log(`Starte GitHub-Update für Branch: ${branch}...`);

    // 1. Git pull ausführen
    const { stdout: gitOut, stderr: gitErr } = await execPromise(`git pull origin ${branch}`);
    console.log('Git Pull:', gitOut, gitErr);

    // 2. npm install ausführen
    const { stdout: npmOut, stderr: npmErr } = await execPromise('npm install');
    console.log('NPM Install:', npmOut, npmErr);

    // 3. Next.js rebuild ausführen
    const { stdout: buildOut, stderr: buildErr } = await execPromise('npm run build');
    console.log('Next Build:', buildOut, buildErr);

    // 4. Neustart über PM2 triggern
    // Durch das Beenden des Node-Prozesses mit Code 0 wird PM2 veranlasst, die App automatisch neu zu starten.
    // Wir verzögern dies um 1 Sekunde, damit die API-Antwort noch an den Client gesendet werden kann.
    setTimeout(() => {
      console.log('Führe automatischen Neustart via PM2 aus (process.exit)...');
      process.exit(0);
    }, 1000);

    return NextResponse.json({
      success: true,
      message: 'Update erfolgreich durchgeführt. Der Server wird neu gestartet.',
      log: {
        git: gitOut + '\n' + gitErr,
        npm: npmOut + '\n' + npmErr,
        build: buildOut + '\n' + buildErr
      }
    });

  } catch (err) {
    console.error('Fehler beim Ausführen des GitHub Updates:', err);
    return NextResponse.json({ 
      error: 'Fehler beim Update-Prozess.',
      details: err.message,
      stdout: err.stdout,
      stderr: err.stderr
    }, { status: 500 });
  }
}
