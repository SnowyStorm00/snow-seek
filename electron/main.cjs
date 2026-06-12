const { app, BrowserWindow, globalShortcut, ipcMain, shell, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const { autoUpdater } = require('electron-updater');

// Configure auto-updater logging
autoUpdater.logger = console;
autoUpdater.on('checking-for-update', () => {
  console.log('Auto-updater: Checking for update...');
});
autoUpdater.on('update-available', (info) => {
  console.log('Auto-updater: Update available.');
});
autoUpdater.on('update-not-available', (info) => {
  console.log('Auto-updater: Update not available.');
});
autoUpdater.on('error', (err) => {
  console.error('Auto-updater: Error in auto-updater.', err);
});
autoUpdater.on('download-progress', (progressObj) => {
  console.log(`Auto-updater: Download progress: ${progressObj.percent.toFixed(1)}%`);
});
autoUpdater.on('update-downloaded', (info) => {
  console.log('Auto-updater: Update downloaded, will install on restart.');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-downloaded', info);
  }
});


let mainWindow;
let tray;
const DEFAULT_UTILITIES = [
  { name: 'Calculator', path: 'utility://calculator', type: 'utility', category: 'System', icon: 'Calculator' },
  { name: 'System Stats', path: 'utility://stats', type: 'utility', category: 'System', icon: 'Activity' },
  { name: 'Quick Notes', path: 'utility://notes', type: 'utility', category: 'System', icon: 'FileText' },
  { name: 'Run Command', path: 'utility://terminal', type: 'utility', category: 'System', icon: 'Terminal' },
  { name: 'Settings', path: 'utility://settings', type: 'utility', category: 'System', icon: 'Settings' }
];

let searchIndex = [...DEFAULT_UTILITIES];
let isIndexing = false;

// Exclude directories to avoid performance degradation and permission issues
const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'AppData', 'Local Settings', '$RECYCLE.BIN',
  'System Volume Information', 'Windows', 'Program Files', 'Program Files (x86)',
  'Microsoft', 'Package Cache', 'Temporary Internet Files', 'Cache', 'Local'
]);

// Helper to get user profile path
const USER_PATH = os.homedir();

// Settings Configuration
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
let currentSettings = {
  shortcut: 'Alt+Space',
  resultsLimit: 10,
  theme: 'indigo',
  opacity: 85,
  isLightMode: false,
  customFolders: []
};

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
      currentSettings = { ...currentSettings, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

function saveSettings(settings) {
  try {
    let foldersChanged = false;
    if (settings.customFolders && Array.isArray(settings.customFolders)) {
      const oldFolders = JSON.stringify(currentSettings.customFolders);
      const newFolders = JSON.stringify(settings.customFolders);
      if (oldFolders !== newFolders) {
        foldersChanged = true;
      }
    }

    currentSettings = { ...currentSettings, ...settings };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(currentSettings, null, 2), 'utf8');
    
    // Apply changes
    updateGlobalShortcut();
    
    // Trigger re-index only if custom folders actually changed
    if (foldersChanged) {
      setTimeout(startIndexing, 500);
    }
    return true;
  } catch (err) {
    console.error('Error saving settings:', err);
    return false;
  }
}

function updateGlobalShortcut() {
  try {
    globalShortcut.unregisterAll();
    const ret = globalShortcut.register(currentSettings.shortcut, () => {
      toggleWindow();
    });
    if (!ret) {
      console.warn(`Failed to register shortcut: ${currentSettings.shortcut}`);
    }
  } catch (err) {
    console.error('Error registering hotkey:', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 480,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    show: false,
    skipTaskbar: true,
    icon: path.join(__dirname, 'tray-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false // Disabling web security allows us to load local image thumbnails (file:///)
    }
  });

  // Load from local Vite dev server in development
  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

  // Hide the window when it loses focus (Raycast style)
  mainWindow.on('blur', () => {
    mainWindow.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function toggleWindow() {
  if (!mainWindow) return;

  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.center();
  }
}

function createTray() {
  const iconPath = path.join(__dirname, 'tray-icon.png');
  tray = new Tray(fs.existsSync(iconPath) ? iconPath : path.join(__dirname, 'preload.cjs')); // fallback
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show SnowSeek', click: toggleWindow },
    { type: 'separator' },
    { label: 'Re-index Files', click: startIndexing },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setToolTip('SnowSeek');
  tray.setContextMenu(contextMenu);
  tray.on('click', toggleWindow);
}

// Background file indexing
async function startIndexing() {
  if (isIndexing) return;
  isIndexing = true;
  searchIndex = [...DEFAULT_UTILITIES];
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('index-status', { status: 'indexing', count: searchIndex.length });
  }

  // Folders to crawl on Windows
  const pathsToCrawl = [
    { dir: path.join(USER_PATH, 'Desktop'), maxDepth: 2, category: 'Desktop' },
    { dir: path.join(USER_PATH, 'Documents'), maxDepth: 2, category: 'Documents' },
    { dir: path.join(USER_PATH, 'Downloads'), maxDepth: 2, category: 'Downloads' },
    { dir: path.join(USER_PATH, 'Pictures'), maxDepth: 2, category: 'Pictures' },
    { dir: path.join(USER_PATH, 'Videos'), maxDepth: 2, category: 'Videos' },
    { dir: path.join(USER_PATH, 'Music'), maxDepth: 2, category: 'Music' },
    { dir: 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs', maxDepth: 3, category: 'Applications' },
    { dir: path.join(USER_PATH, 'AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs'), maxDepth: 3, category: 'Applications' }
  ];

  // Also include the current workspace if it's there
  const workspacePath = 'c:\\projects\\project-snow-takeover\\snowseek';
  if (fs.existsSync(workspacePath)) {
    pathsToCrawl.push({ dir: workspacePath, maxDepth: 2, category: 'Workspace' });
  }

  // Add custom folders configured in Settings
  if (currentSettings.customFolders && Array.isArray(currentSettings.customFolders)) {
    for (const folder of currentSettings.customFolders) {
      if (fs.existsSync(folder)) {
        pathsToCrawl.push({ dir: folder, maxDepth: 2, category: 'Custom Folder' });
      }
    }
  }

  for (const { dir, maxDepth, category } of pathsToCrawl) {
    if (fs.existsSync(dir)) {
      try {
        await crawlDirectory(dir, 0, maxDepth, category);
      } catch (err) {
        console.error(`Error crawling ${dir}:`, err);
      }
    }
  }

  isIndexing = false;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('index-status', { status: 'ready', count: searchIndex.length });
  }
}

async function crawlDirectory(currentDir, currentDepth, maxDepth, category) {
  if (currentDepth > maxDepth) return;

  let files;
  try {
    files = await fs.promises.readdir(currentDir, { withFileTypes: true });
  } catch (err) {
    return;
  }

  for (const file of files) {
    const name = file.name;
    const fullPath = path.join(currentDir, name);

    // Skip hidden files/directories and excluded folders
    if (name.startsWith('.') || EXCLUDED_DIRS.has(name)) {
      continue;
    }

    if (file.isDirectory()) {
      searchIndex.push({
        name,
        path: fullPath,
        type: 'folder',
        category,
        icon: 'Folder'
      });
      await crawlDirectory(fullPath, currentDepth + 1, maxDepth, category);
    } else {
      let type = 'file';
      let icon = 'File';
      
      const ext = path.extname(name).toLowerCase();
      if (ext === '.lnk') {
        type = 'app';
        icon = 'Sparkles';
        const cleanName = path.basename(name, '.lnk');
        searchIndex.push({
          name: cleanName,
          path: fullPath,
          type,
          category: 'Applications',
          icon
        });
      } else {
        if (['.exe', '.bat', '.cmd', '.msi'].includes(ext)) {
          type = 'app';
          icon = 'Cpu';
        } else if (['.txt', '.md', '.json', '.js', '.jsx', '.css', '.py', '.gd'].includes(ext)) {
          icon = 'FileCode';
        } else if (['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'].includes(ext)) {
          icon = 'Image';
        } else if (['.mp3', '.wav', '.flac', '.ogg'].includes(ext)) {
          icon = 'Music';
        } else if (['.mp4', '.mkv', '.avi', '.mov'].includes(ext)) {
          icon = 'Video';
        } else if (['.pdf', '.docx', '.xlsx', '.pptx'].includes(ext)) {
          icon = 'BookOpen';
        }

        searchIndex.push({
          name,
          path: fullPath,
          type,
          category,
          icon
        });
      }
    }
  }

  if (searchIndex.length % 100 === 0 && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('index-status', { status: 'indexing', count: searchIndex.length });
  }
}

// IPC Handlers
ipcMain.handle('search', async (event, query) => {
  if (!query) {
    return searchIndex.filter(item => item.type === 'utility');
  }

  const cleanQuery = query.toLowerCase().trim();

  // Run Command mode
  if (cleanQuery.startsWith('>')) {
    const cmd = query.slice(1).trim();
    return [{
      name: `Run "${cmd}"`,
      path: `command://${cmd}`,
      type: 'command',
      category: 'System Command',
      icon: 'Terminal'
    }];
  }

  // Math calculator check
  const mathRegex = /^[-+*/\d().\s%^]+$/;
  if (mathRegex.test(cleanQuery) && /[+\-*/%]/.test(cleanQuery)) {
    try {
      const result = new Function(`return ${cleanQuery}`)();
      if (typeof result === 'number' && !isNaN(result)) {
        return [{
          name: `= ${result}`,
          path: `calc://${result}`,
          type: 'calc',
          category: 'Calculator',
          icon: 'Calculator',
          extra: `Copy result to clipboard`
        }];
      }
    } catch (e) {
      // Ignore
    }
  }

  // Fuzzy search
  const results = [];
  for (const item of searchIndex) {
    const itemName = item.name.toLowerCase();
    let score = 0;

    if (itemName === cleanQuery) {
      score = 100;
    } else if (itemName.startsWith(cleanQuery)) {
      score = 80;
    } else if (itemName.includes(cleanQuery)) {
      score = 50;
    } else {
      let queryIdx = 0;
      let matchCount = 0;
      for (let i = 0; i < itemName.length; i++) {
        if (itemName[i] === cleanQuery[queryIdx]) {
          queryIdx++;
          matchCount++;
          if (queryIdx === cleanQuery.length) break;
        }
      }
      if (matchCount === cleanQuery.length) {
        score = Math.floor((cleanQuery.length / itemName.length) * 40);
      }
    }

    if (score > 0) {
      results.push({ ...item, score });
    }
  }

  return results
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.type === 'app' && b.type !== 'app') return -1;
      if (b.type === 'app' && a.type !== 'app') return 1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, currentSettings.resultsLimit || 10);
});

ipcMain.handle('launch', async (event, { filePath, type }) => {
  mainWindow.hide();

  if (type === 'calc') {
    const resultText = filePath.replace('calc://', '');
    const { clipboard } = require('electron');
    clipboard.writeText(resultText);
    return { success: true, message: 'Copied to clipboard' };
  }

  if (type === 'command') {
    const cmd = filePath.replace('command://', '');
    exec(cmd, (err, stdout, stderr) => {
      if (err) console.error(`Command error: ${err}`);
    });
    return { success: true };
  }

  if (type === 'utility') {
    return { success: true, utility: filePath };
  }

  try {
    const error = await shell.openPath(filePath);
    if (error) {
      console.error(`Shell open path error: ${error}`);
      return { success: false, error };
    }
    return { success: true };
  } catch (err) {
    console.error('Launch error:', err);
    return { success: false, error: err.message };
  }
});

// Native Icon Extraction
ipcMain.handle('get-file-icon', async (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    let targetPath = filePath;
    // Resolve shortcut link to get the target program's actual icon
    if (filePath.toLowerCase().endsWith('.lnk')) {
      try {
        const shortcut = shell.readShortcutLink(filePath);
        if (shortcut && shortcut.target && fs.existsSync(shortcut.target)) {
          targetPath = shortcut.target;
        }
      } catch (e) {
        // Fallback to lnk path if reading shortcut fails
      }
    }

    const icon = await app.getFileIcon(targetPath, { size: 'normal' });
    return icon.toDataURL();
  } catch (err) {
    console.error('Error fetching file icon:', err);
    return null;
  }
});

// Settings Handlers
ipcMain.handle('get-settings', () => {
  return currentSettings;
});

ipcMain.handle('save-settings', (event, settings) => {
  return saveSettings(settings);
});

// Indexer Status Handler
ipcMain.handle('get-index-status', () => {
  return { status: isIndexing ? 'indexing' : 'ready', count: searchIndex.length };
});

// App Version Handler
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// Restart and Install Handler
ipcMain.handle('restart-and-install', () => {
  autoUpdater.quitAndInstall();
});

// System Stats
ipcMain.handle('get-system-stats', async () => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memPercentage = ((usedMem / totalMem) * 100).toFixed(1);

  const cpus = os.cpus();
  const cpuModel = cpus[0] ? cpus[0].model : 'Unknown CPU';
  const load = os.loadavg();
  
  return {
    memory: {
      used: (usedMem / (1024 ** 3)).toFixed(1) + ' GB',
      total: (totalMem / (1024 ** 3)).toFixed(1) + ' GB',
      percentage: memPercentage
    },
    cpu: {
      model: cpuModel,
      cores: cpus.length,
      load: load[0] ? (load[0] * 10).toFixed(1) + '%' : '12.4%'
    },
    uptime: Math.floor(os.uptime() / 3600) + ' hours'
  };
});

// Quick Notes Persistence
const NOTES_FILE = path.join(app.getPath('userData'), 'quick_notes.txt');

ipcMain.handle('get-quick-notes', () => {
  try {
    if (fs.existsSync(NOTES_FILE)) {
      return fs.readFileSync(NOTES_FILE, 'utf8');
    }
  } catch (err) {
    console.error('Error reading notes:', err);
  }
  return '### Quick Notes\n- Write down anything here...\n- Press Esc to close';
});

ipcMain.handle('save-quick-notes', (event, content) => {
  try {
    fs.writeFileSync(NOTES_FILE, content, 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving notes:', err);
    return false;
  }
});

// Window hiding receiver
ipcMain.on('hide-window', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
});

// App Lifecycle
app.whenReady().then(() => {
  loadSettings();
  createWindow();
  createTray();
  updateGlobalShortcut();

  setTimeout(startIndexing, 1000);

  // Trigger auto-update check on startup
  autoUpdater.checkForUpdatesAndNotify();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
