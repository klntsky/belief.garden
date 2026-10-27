#!/usr/bin/env node
import { constants } from 'node:fs';
import { cp, mkdir, mkdtemp, open, readFile, readdir, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const sleep = ms => new Promise(done => setTimeout(done, ms));
const digest = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const save = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');

async function processInfo(pid) {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    return { pid: Number(pid), parent: Number(fields[1]), state: fields[0], group: Number(fields[2]), born: fields[19] };
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ESRCH') return null;
    throw error;
  }
}

async function members(state) {
  const leader = await processInfo(state.pid);
  if (leader && leader.born !== state.born) throw new Error('PID reused; refusing to drive or kill it');
  const entries = await readdir('/proc');
  const processes = await Promise.all(entries.filter(name => /^\d+$/.test(name)).map(processInfo));
  const owned = new Set([state.pid]);
  for (const saved of state.owned || []) {
    if (processes.some(info => info?.pid === saved.pid && info.born === saved.born)) owned.add(saved.pid);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const info of processes) {
      if (info && !owned.has(info.pid) && (info.group === state.pid || owned.has(info.parent))) {
        owned.add(info.pid);
        changed = true;
      }
    }
  }
  return processes.filter(info => info && owned.has(info.pid) && info.state !== 'Z');
}

async function doctor(state) {
  if (state.cleaned) throw new Error('Instance has already been cleaned');
  const processes = await members(state);
  if (!processes.length) throw new Error('Owned process group is not running');
  const portHex = state.port.toString(16).toUpperCase().padStart(4, '0');
  const tables = await Promise.all(['tcp', 'tcp6'].map(name => readFile(`/proc/net/${name}`, 'utf8')));
  const inodes = new Set(tables.flatMap(table => table.trim().split('\n').slice(1)
    .map(line => line.trim().split(/\s+/))
    .filter(fields => fields[1].endsWith(`:${portHex}`) && fields[3] === '0A')
    .map(fields => `socket:[${fields[9]}]`)));
  let owner;
  for (const info of processes) {
    try {
      if (await readlink(`/proc/${info.pid}/cwd`) !== state.scratch) continue;
      for (const fd of await readdir(`/proc/${info.pid}/fd`)) {
        try {
          if (inodes.has(await readlink(`/proc/${info.pid}/fd/${fd}`))) owner = info.pid;
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (!owner) throw new Error(`Listening port is not owned by our isolated app: ${JSON.stringify({ processes, inodes: [...inodes], cwd: await Promise.all(processes.map(async info => [info.pid, await readlink(`/proc/${info.pid}/cwd`).catch(() => null)])) })}`);
  if (await digest(join(state.scratch, 'src/app.ts')) !== state.appSha256) throw new Error('App snapshot changed');
  const response = await fetch(state.url, { signal: AbortSignal.timeout(3000) });
  const html = await response.text();
  if (!response.ok || !html.includes('<title>belief.garden</title>') || !html.includes('Welcome!')) {
    throw new Error(`Unexpected home surface: HTTP ${response.status}`);
  }
  return { url: state.url, listenerPid: owner, scratch: state.scratch, appSha256: state.appSha256, auth: 'anonymous home; login is proved by the browser drive' };
}

async function cleanup(state, manifest) {
  state.owned = await members(state);
  const signal = async name => {
    for (const info of await members(state)) {
      try { process.kill(info.pid, name); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  };
  if (state.owned.length) {
    await signal('SIGTERM');
    for (let attempt = 0; attempt < 60 && (await members(state)).length; attempt++) await sleep(200);
    if ((await members(state)).length) {
      await signal('SIGKILL');
      for (let attempt = 0; attempt < 20 && (await members(state)).length; attempt++) await sleep(100);
    }
  }
  if ((await members(state)).length) throw new Error('Owned process group did not stop; scratch retained');
  await rm(state.scratch, { recursive: true, force: true });
  state.cleaned = true;
  await save(manifest, state);
  const retained = await readdir(dirname(manifest));
  await save(join(dirname(manifest), 'cleanup.json'), { stopped: true, scratchRemoved: true, retained });
  console.log(JSON.stringify({ stopped: true, evidence: dirname(manifest), retained }, null, 2));
}

async function launch() {
  const evidence = await mkdtemp(join(tmpdir(), 'belief-garden-evidence-'));
  const scratch = await mkdtemp(join(tmpdir(), 'belief-garden-app-'));
  const manifest = join(evidence, 'instance.json');
  let state;
  try {
    for (const entry of ['src', 'views', 'public', 'package.json', 'tsconfig.json']) {
      await cp(join(root, entry), join(scratch, entry), {
        recursive: true, mode: constants.COPYFILE_FICLONE,
        filter: source => !['users.json', 'bio', 'comments', 'previews'].some(name => source === join(root, 'public', name) || source === join(root, 'public/img', name)),
      });
    }
    await symlink(join(root, 'node_modules'), join(scratch, 'node_modules'), 'dir');
    await mkdir(join(scratch, 'data'));
    await writeFile(join(scratch, 'public/users.json'), '[]\n');
    await writeFile(join(scratch, 'pnpm-workspace.yaml'), await readFile(join(root, 'pnpm-workspace.yaml'), 'utf8') + '\nverifyDepsBeforeRun: false\n');
    const socket = createServer();
    await new Promise((done, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', done); });
    const port = socket.address().port;
    await new Promise(done => socket.close(done));
    const log = await open(join(evidence, 'server.log'), 'a');
    const child = spawn('corepack', ['pnpm', 'run', 'start'], {
      cwd: scratch, detached: true, stdio: ['ignore', log.fd, log.fd],
      env: { ...process.env, NODE_ENV: 'development', PORT: String(port), OPENAI_API_KEY: 'verification-no-network',
        SESSION_SECRET: randomBytes(32).toString('hex'), PUBLIC_SITE_URL: `http://127.0.0.1:${port}`,
        SITE_DEPLOYMENT_PATH: `http://127.0.0.1:${port}`, UPDATE_USERS_INTERVAL_MS: '3600000' },
    });
    await new Promise((done, reject) => { child.once('spawn', done); child.once('error', reject); });
    await log.close();
    child.unref();
    const info = await processInfo(child.pid);
    if (!info) throw new Error('Launcher exited before recording ownership');
    state = { pid: child.pid, born: info.born, port, url: `http://127.0.0.1:${port}`, scratch,
      source: root, appSha256: await digest(join(scratch, 'src/app.ts')), command: 'corepack pnpm run start', cleaned: false };
    await save(manifest, state);
    let lastError;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const health = await doctor(state);
        state.owned = await members(state);
        await save(manifest, state);
        await save(join(evidence, 'doctor.json'), health);
        console.log(JSON.stringify({ manifest, ...health }, null, 2));
        return;
      } catch (error) { lastError = error; }
      await sleep(300);
    }
    throw lastError;
  } catch (error) {
    if (state) await cleanup(state, manifest);
    else await rm(scratch, { recursive: true, force: true });
    console.error(`Launch failed; logs retained at ${evidence}`);
    throw error;
  }
}

const [command, manifestArgument] = process.argv.slice(2);
try {
  if (command === 'launch') await launch();
  else if (['doctor', 'cleanup'].includes(command) && manifestArgument) {
    const manifest = resolve(manifestArgument);
    const state = JSON.parse(await readFile(manifest, 'utf8'));
    if (command === 'doctor') console.log(JSON.stringify(await doctor(state), null, 2));
    else await cleanup(state, manifest);
  } else throw new Error('Usage: instance.mjs launch | doctor /absolute/instance.json | cleanup /absolute/instance.json');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
