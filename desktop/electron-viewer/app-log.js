const fs = require('fs');
const path = require('path');

/** @type {() => string} */
let getUserDataPath = () => path.join(process.cwd(), '.app-log-test');

function setUserDataPath(fn) {
    getUserDataPath = typeof fn === 'function' ? fn : getUserDataPath;
}

function logsDir() {
    const dir = path.join(getUserDataPath(), 'logs');
    fs.mkdirSync(dir, {recursive: true});
    return dir;
}

function appLogFile() {
    return path.join(logsDir(), 'camera-wall.log');
}

function appendAppLog(tag, message, extra) {
    const line = extra
        ? `[${new Date().toISOString()}] [${tag}] ${message} ${JSON.stringify(extra)}\n`
        : `[${new Date().toISOString()}] [${tag}] ${message}\n`;
    try {
        fs.appendFileSync(appLogFile(), line, 'utf8');
    } catch {
        /* ignore */
    }
}

function installProcessLogHandlers() {
    process.on('uncaughtException', (err) => {
        appendAppLog('uncaughtException', err?.message || String(err), {stack: err?.stack});
    });
    process.on('unhandledRejection', (reason) => {
        appendAppLog('unhandledRejection', reason?.message || String(reason));
    });
}

module.exports = {
    setUserDataPath,
    logsDir,
    appLogFile,
    appendAppLog,
    installProcessLogHandlers,
};
