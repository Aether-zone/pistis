/*
 * `pnpm --filter @pistis/api serve` — rebuild on change and restart the server.
 *
 * This is the half of Nx's `@nx/js:node` target worth keeping. Neither tool
 * does the whole job alone: `webpack --watch` rebuilds but never restarts the
 * process, and `node --watch` restarts but cannot compile TypeScript. So one
 * webpack compiler runs in watch mode here and owns a single child process,
 * killing and respawning it after each successful emit.
 *
 * Owning the child (rather than watching dist/ from a second process) is what
 * makes shutdown clean: Ctrl-C stops the server this script started, and only
 * that one.
 *
 * The child runs from the workspace root, which is where `nx serve` ran it and
 * therefore where a developer's `db.sqlite` already is — TypeORM resolves that
 * default relative to the working directory.
 */
const { spawn } = require('node:child_process');
const { join } = require('node:path');
const webpack = require('webpack');

const configFactory = require('./webpack.config.js');
const compiler = webpack(configFactory({}, { mode: 'development' }));

const entry = join(__dirname, 'dist', 'main.js');
const workspaceRoot = join(__dirname, '..');
let child = null;
let stopping = false;

function stopChild(onExit) {
    if (!child) {
        onExit?.();
        return;
    }

    const previous = child;
    child = null;
    previous.removeAllListeners('exit');
    previous.once('exit', () => onExit?.());
    previous.kill('SIGTERM');
}

function startChild() {
    child = spawn(process.execPath, [entry], {
        cwd: workspaceRoot,
        stdio: 'inherit',
        env: process.env,
    });

    child.on('exit', (code, signal) => {
        // Only report a crash. An exit we asked for has already cleared `child`,
        // and a rebuild landing mid-boot is normal.
        if (!stopping && child) {
            console.error(
                `api: the server exited (${signal ?? code}); waiting for the next change.`,
            );
            child = null;
        }
    });
}

compiler.watch({}, (error, stats) => {
    if (error) {
        console.error(error);
        return;
    }

    console.log(stats.toString({ colors: true, preset: 'minimal' }));

    // A failed compile leaves the last good bundle running, which is what makes
    // a typo in the middle of an edit survivable.
    if (stats.hasErrors()) {
        return;
    }

    stopChild(startChild);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        stopping = true;
        stopChild(() => compiler.close(() => process.exit(0)));
    });
}
