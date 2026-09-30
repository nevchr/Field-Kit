import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const projectRoot = process.cwd();
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const { version } = packageJson;

const unsigned = process.argv.includes('--unsigned');
const signingConfigured = Boolean(process.env.CSC_LINK || process.env.WIN_CSC_LINK || process.env.CSC_NAME);
if (!unsigned && !signingConfigured) {
  throw new Error('A public Field Kit package must be signed. Set CSC_LINK (and CSC_KEY_PASSWORD when needed), or use `pnpm package:local` for an explicitly unsigned local QA build.');
}

function run(command, args, extraEnv = {}, cwd = projectRoot) {
  const result = spawnSync(command, args, { cwd, env: { ...process.env, ...extraEnv }, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} exited with status ${result.status}`);
}

run(process.execPath, ['scripts/assets.mjs']);
run(process.execPath, ['scripts/notices.mjs']);
run(process.execPath, ['scripts/build.mjs']);

const builder = require.resolve('electron-builder/cli.js');
const stagingParent = path.resolve('.test-output');
const staging = path.join(stagingParent, `package-stage-${version}`);
if (!staging.startsWith(stagingParent + path.sep)) throw new Error('Invalid package staging path');
fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(path.join(staging, 'docs'), { recursive: true });
fs.mkdirSync(path.join(staging, 'vendor'), { recursive: true });
for (const directory of ['dist', 'dist-electron', 'build']) fs.cpSync(path.join(projectRoot, directory), path.join(staging, directory), { recursive: true });
for (const file of ['README.md', 'THIRD_PARTY_NOTICES.txt']) fs.copyFileSync(path.join(projectRoot, file), path.join(staging, file));
fs.copyFileSync(path.join(projectRoot, 'docs/FFMPEG.md'), path.join(staging, 'docs/FFMPEG.md'));
fs.symlinkSync(path.join(projectRoot, 'vendor/ffmpeg'), path.join(staging, 'vendor/ffmpeg'), 'junction');
fs.symlinkSync(path.join(projectRoot, 'node_modules'), path.join(staging, 'node_modules'), 'junction');
fs.writeFileSync(path.join(staging, 'package.json'), JSON.stringify({ ...packageJson, build: { ...packageJson.build, directories: { ...packageJson.build.directories, output: path.join(projectRoot, 'release') } } }, null, 2));

const builderArgs = ['--win', 'nsis', 'zip', '--x64'];
if (unsigned) {
  builderArgs.push(
    '--config.forceCodeSigning=false',
    '--config.win.signExecutable=false',
    `--config.artifactName=Field-Kit-${version}-UNSIGNED-QA-Portable-x64.\${ext}`,
    `--config.nsis.artifactName=Field-Kit-${version}-UNSIGNED-QA-Setup-x64.exe`,
  );
}
else builderArgs.push('--config.forceCodeSigning=true');
run(process.execPath, [builder, ...builderArgs], unsigned ? { CSC_IDENTITY_AUTO_DISCOVERY: 'false' } : {}, staging);

const setup = path.resolve(`release/Field-Kit-${version}-Setup-x64.exe`);
if (!unsigned) run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.resolve('scripts/verify-signatures.ps1'), setup]);
console.log(unsigned ? `Created explicitly unsigned local QA artifacts for ${version}.` : `Created and verified signed release artifacts for ${version}.`);
