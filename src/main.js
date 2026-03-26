const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const https = require('https');
const http = require('http');
const fs = require('fs/promises');
const log = require('electron-log');

log.transports.file.level = 'info';
log.transports.console.level = 'debug';
log.info('App starting...');

process.on('uncaughtException', (error) => {
    log.error('Uncaught exception:', error);
    app.exit(1);
});

process.on('unhandledRejection', (reason) => {
    log.error('Unhandled rejection:', reason);
});

let mainWindow = null;
let tray = null;
let isQuitting = false;

autoUpdater.logger = log;
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'alnyxcs',
    repo: 'LoBeats'
});

const UPDATE_REPO_OWNER = 'alnyxcs';
const UPDATE_REPO_NAME = 'LoBeats';
const STABLE_ASSETS = {
    win32: 'LoBeats-windows.exe',
    linux: 'LoBeats-linux.zip'
};

function parseVersion(version) {
    return String(version || '')
        .trim()
        .replace(/^v/i, '')
        .split('.')
        .map(part => parseInt(part, 10) || 0);
}

function isVersionNewer(currentVersion, latestVersion) {
    const current = parseVersion(currentVersion);
    const latest = parseVersion(latestVersion);
    const maxLength = Math.max(current.length, latest.length);

    for (let i = 0; i < maxLength; i++) {
        const c = current[i] || 0;
        const l = latest[i] || 0;
        if (l > c) return true;
        if (l < c) return false;
    }

    return false;
}

function fetchLatestRelease() {
    const url = `https://api.github.com/repos/${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}/releases/latest`;

    return new Promise((resolve, reject) => {
        const request = https.get(url, {
            headers: {
                'User-Agent': 'LoBeats-Updater',
                'Accept': 'application/vnd.github+json'
            }
        }, (response) => {
            let raw = '';

            response.on('data', chunk => {
                raw += chunk;
            });

            response.on('end', () => {
                if (response.statusCode !== 200) {
                    reject(new Error(`GitHub API status ${response.statusCode}`));
                    return;
                }

                try {
                    const parsed = JSON.parse(raw);
                    resolve(parsed);
                } catch (error) {
                    reject(error);
                }
            });
        });

        request.on('error', reject);
        request.setTimeout(10000, () => {
            request.destroy(new Error('Update check timed out'));
        });
    });
}

function pickReleaseAsset(assets, platform) {
    if (!Array.isArray(assets) || assets.length === 0) return null;

    const stableAssetName = STABLE_ASSETS[platform];
    if (stableAssetName) {
        const exact = assets.find(asset => asset && asset.name === stableAssetName);
        if (exact) return exact;
    }

    if (platform === 'win32') {
        return assets.find(asset => asset && typeof asset.name === 'string' && asset.name.toLowerCase().endsWith('.exe')) || null;
    }

    if (platform === 'linux') {
        return assets.find(asset => {
            if (!asset || typeof asset.name !== 'string') return false;
            const name = asset.name.toLowerCase();
            return name.endsWith('.zip') || name.endsWith('.appimage');
        }) || null;
    }

    return null;
}

function getStableLatestDownloadUrl(platform) {
    const stableAssetName = STABLE_ASSETS[platform];
    if (!stableAssetName) return null;
    return `https://github.com/${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}/releases/latest/download/${stableAssetName}`;
}

function requestUrlHealth(url, redirectCount = 0) {
    return new Promise((resolve) => {
        if (!url || typeof url !== 'string') {
            resolve({ status: 'offline', reason: 'invalid-url' });
            return;
        }

        let parsed;
        try {
            parsed = new URL(url);
        } catch (_) {
            resolve({ status: 'offline', reason: 'invalid-url' });
            return;
        }

        const transport = parsed.protocol === 'http:' ? http : parsed.protocol === 'https:' ? https : null;
        if (!transport) {
            resolve({ status: 'offline', reason: 'unsupported-protocol' });
            return;
        }

        const startedAt = Date.now();
        const req = transport.request(parsed, {
            method: 'GET',
            headers: {
                'User-Agent': 'LoBeats-HealthCheck',
                'Icy-MetaData': '1'
            }
        }, (res) => {
            const elapsed = Date.now() - startedAt;
            const code = Number(res.statusCode || 0);
            const location = res.headers && res.headers.location;

            if (code >= 300 && code < 400 && location && redirectCount < 3) {
                const nextUrl = new URL(location, parsed).toString();
                res.destroy();
                resolve(requestUrlHealth(nextUrl, redirectCount + 1));
                return;
            }

            res.destroy();

            if (code >= 200 && code < 400) {
                resolve({
                    status: elapsed > 2500 ? 'slow' : 'online',
                    responseMs: elapsed,
                    statusCode: code
                });
                return;
            }

            resolve({
                status: 'offline',
                responseMs: elapsed,
                statusCode: code
            });
        });

        req.on('error', () => {
            resolve({ status: 'offline', reason: 'network-error' });
        });

        req.setTimeout(6000, () => {
            req.destroy();
            resolve({ status: 'offline', reason: 'timeout' });
        });

        req.end();
    });
}

function createWindow() {
    log.info('Creating main window...');
    
    mainWindow = new BrowserWindow({
        width: 340,
        height: 640,
        resizable: false,
        frame: false,
        transparent: false,
        backgroundColor: '#1a1a2e',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
            log.info('Window hidden to tray');
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    log.info('Main window created');
}

function createTray() {
    log.info('Creating system tray...');
    
    const size = 16;
    const canvas = Buffer.alloc(size * size * 4);
    
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4;
            const dx = x - size / 2;
            const dy = y - size / 2;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < size / 2 - 1) {
                canvas[idx] = 233;
                canvas[idx + 1] = 69;
                canvas[idx + 2] = 96;
                canvas[idx + 3] = 255;
            } else {
                canvas[idx] = 0;
                canvas[idx + 1] = 0;
                canvas[idx + 2] = 0;
                canvas[idx + 3] = 0;
            }
        }
    }
    
    const trayIcon = nativeImage.createFromBuffer(canvas, { width: size, height: size });
    tray = new Tray(trayIcon);
    
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show/Hide',
            click: () => {
                if (mainWindow) {
                    if (mainWindow.isVisible()) {
                        mainWindow.hide();
                    } else {
                        mainWindow.show();
                        mainWindow.focus();
                    }
                }
            }
        },
        {
            label: 'Play/Pause',
            click: () => {
                if (mainWindow) {
                    mainWindow.webContents.send('toggle-play');
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Exit',
            click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('LoBeats');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
                mainWindow.focus();
            }
        }
    });

    log.info('System tray created');
}

ipcMain.on('minimize-window', () => {
    if (mainWindow) {
        mainWindow.minimize();
    }
});

ipcMain.on('close-window', () => {
    if (mainWindow) {
        mainWindow.hide();
    }
});

ipcMain.handle('get-app-path', () => {
    return __dirname;
});

autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...');
    if (mainWindow) {
        mainWindow.webContents.send('update-status', { status: 'checking' });
    }
});

autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version);
    if (mainWindow) {
        mainWindow.webContents.send('update-status', {
            status: 'available',
            version: info.version
        });
    }
});

autoUpdater.on('update-not-available', () => {
    log.info('No updates available');
    if (mainWindow) {
        mainWindow.webContents.send('update-status', { status: 'not-available' });
    }
});

autoUpdater.on('download-progress', (progress) => {
    log.info(`Download progress: ${progress.percent.toFixed(1)}%`);
    if (mainWindow) {
        mainWindow.webContents.send('update-status', {
            status: 'downloading',
            percent: progress.percent
        });
    }
});

autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info.version);
    if (mainWindow) {
        mainWindow.webContents.send('update-status', {
            status: 'downloaded',
            version: info.version
        });
    }
});

autoUpdater.on('error', (error) => {
    log.error('AutoUpdater error:', error);
    if (mainWindow) {
        mainWindow.webContents.send('update-status', {
            status: 'error',
            error: error.message
        });
    }
});

ipcMain.handle('check-for-updates', async () => {
    try {
        const result = await autoUpdater.checkForUpdates();
        if (result && result.updateInfo) {
            const currentVersion = app.getVersion();
            const latestVersion = String(result.updateInfo.version || '').replace(/^v/i, '');
            return {
                ok: true,
                currentVersion,
                latestVersion,
                hasUpdate: isVersionNewer(currentVersion, latestVersion)
            };
        }
        return {
            ok: true,
            currentVersion: app.getVersion(),
            latestVersion: app.getVersion(),
            hasUpdate: false
        };
    } catch (error) {
        log.error('Update check failed:', error);
        return {
            ok: false,
            error: error.message || 'Failed to check updates'
        };
    }
});

ipcMain.handle('download-update', async () => {
    try {
        await autoUpdater.downloadUpdate();
        return { ok: true };
    } catch (error) {
        log.error('Update download failed:', error);
        return { ok: false, error: error.message || 'Failed to download update' };
    }
});

ipcMain.handle('install-update', () => {
    isQuitting = true;
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
});

ipcMain.handle('open-external-url', async (_, url) => {
    if (!url || typeof url !== 'string') {
        return { ok: false, error: 'Invalid URL' };
    }

    try {
        await shell.openExternal(url);
        return { ok: true };
    } catch (error) {
        log.error('Failed to open external URL:', error);
        return { ok: false, error: error.message || 'Open external URL failed' };
    }
});

ipcMain.handle('set-always-on-top', async (_, enabled) => {
    if (!mainWindow) {
        return { ok: false, error: 'Window not available' };
    }

    try {
        mainWindow.setAlwaysOnTop(Boolean(enabled));
        return { ok: true, enabled: mainWindow.isAlwaysOnTop() };
    } catch (error) {
        log.error('Failed to set always-on-top:', error);
        return { ok: false, error: error.message || 'Failed to set always-on-top' };
    }
});

ipcMain.handle('export-library-data', async (_, payload) => {
    try {
        const { canceled, filePath } = await dialog.showSaveDialog({
            title: 'Export Library',
            defaultPath: `LoBeats-library-${app.getVersion()}.json`,
            filters: [{ name: 'JSON', extensions: ['json'] }]
        });

        if (canceled || !filePath) {
            return { ok: false, canceled: true };
        }

        await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
        return { ok: true, filePath };
    } catch (error) {
        log.error('Library export failed:', error);
        return { ok: false, error: error.message || 'Export failed' };
    }
});

ipcMain.handle('import-library-data', async () => {
    try {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            title: 'Import Library',
            properties: ['openFile'],
            filters: [{ name: 'JSON', extensions: ['json'] }]
        });

        if (canceled || !filePaths || filePaths.length === 0) {
            return { ok: false, canceled: true };
        }

        const selectedPath = filePaths[0];
        const raw = await fs.readFile(selectedPath, 'utf8');
        const data = JSON.parse(raw);
        return { ok: true, filePath: selectedPath, data };
    } catch (error) {
        log.error('Library import failed:', error);
        return { ok: false, error: error.message || 'Import failed' };
    }
});

ipcMain.handle('check-stream-health', async (_, streamList) => {
    try {
        if (!Array.isArray(streamList)) {
            return { ok: false, error: 'Invalid stream list' };
        }

        const checks = streamList.map(async (stream) => {
            const id = stream && stream.id ? String(stream.id) : '';
            const url = stream && stream.url ? String(stream.url) : '';
            const health = await requestUrlHealth(url);
            return { id, ...health };
        });

        const results = await Promise.all(checks);
        return { ok: true, results };
    } catch (error) {
        log.error('Stream health check failed:', error);
        return { ok: false, error: error.message || 'Health check failed' };
    }
});

app.whenReady().then(() => {
    log.info('App ready, creating window and tray');
    createWindow();
    createTray();
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        // Don't quit, keep running in tray
    }
});

app.on('before-quit', () => {
    isQuitting = true;
    log.info('App quitting');
});

log.info('Main process initialized');
