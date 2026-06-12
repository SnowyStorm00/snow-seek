const { app, BrowserWindow, globalShortcut, ipcMain, shell, Tray, Menu, clipboard } = require('electron');
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
  { name: 'Clipboard History', path: 'utility://clip', type: 'utility', category: 'System', icon: 'Clipboard' },
  { name: 'Run Command', path: 'utility://terminal', type: 'utility', category: 'System', icon: 'Terminal' },
  { name: 'Settings', path: 'utility://settings', type: 'utility', category: 'System', icon: 'Settings' }
];

let clipboardHistory = [];
let CLIPBOARD_HISTORY_FILE;
let CLIP_IMAGES_DIR;

function ensureDirectories() {
  if (!fs.existsSync(CLIP_IMAGES_DIR)) {
    fs.mkdirSync(CLIP_IMAGES_DIR, { recursive: true });
  }
}

function loadClipboardHistory() {
  try {
    if (fs.existsSync(CLIPBOARD_HISTORY_FILE)) {
      const data = fs.readFileSync(CLIPBOARD_HISTORY_FILE, 'utf8');
      clipboardHistory = JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading clipboard history:', err);
  }
}

function saveClipboardHistory() {
  try {
    fs.writeFileSync(CLIPBOARD_HISTORY_FILE, JSON.stringify(clipboardHistory, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving clipboard history:', err);
  }
}

function enforceHistoryLimit() {
  if (clipboardHistory.length > 50) {
    const removedItems = clipboardHistory.slice(50);
    clipboardHistory = clipboardHistory.slice(0, 50);
    
    // Clean up files for shifted images
    for (const item of removedItems) {
      if (item.type === 'image' && fs.existsSync(item.content)) {
        try {
          fs.unlinkSync(item.content);
        } catch (err) {
          console.error('Error deleting old image file:', err);
        }
      }
    }
  }
}

function addTextToHistory(text) {
  // Deduplicate
  clipboardHistory = clipboardHistory.filter(item => {
    if (item.type === 'text' || item.type === 'code') {
      return item.content !== text;
    }
    return true;
  });

  const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
  
  // Code snippet detection
  const lines = text.split('\n');
  const hasMultipleLines = lines.length > 1;
  const isCode = hasMultipleLines && (
    (text.includes('{') && text.includes('}')) ||
    text.includes('const ') ||
    text.includes('function ') ||
    (text.includes('import ') && text.includes('from ')) ||
    text.includes('class ') ||
    text.includes('<html>') ||
    text.includes('&&') ||
    text.includes('||') ||
    lines.some(line => line.startsWith('  ') || line.startsWith('\t'))
  );

  const item = {
    id,
    type: isCode ? 'code' : 'text',
    content: text,
    timestamp: Date.now()
  };

  clipboardHistory.unshift(item);
  enforceHistoryLimit();
  saveClipboardHistory();
}

function addImageToHistory(img) {
  const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
  const imgPath = path.join(CLIP_IMAGES_DIR, `${id}.png`);
  
  try {
    const buffer = img.toPNG();
    fs.writeFileSync(imgPath, buffer);
    
    const item = {
      id,
      type: 'image',
      content: imgPath,
      timestamp: Date.now()
    };

    clipboardHistory.unshift(item);
    enforceHistoryLimit();
    saveClipboardHistory();
  } catch (err) {
    console.error('Error saving clipboard image to disk:', err);
  }
}

let lastText = '';
let lastImageHash = '';

function checkClipboard() {
  try {
    const text = clipboard.readText();
    if (text && text.trim() !== '') {
      if (text !== lastText) {
        lastText = text;
        addTextToHistory(text);
        return;
      }
    } else {
      lastText = '';
    }

    const img = clipboard.readImage();
    if (!img.isEmpty()) {
      const size = img.getSize();
      const hash = `${size.width}x${size.height}`;
      if (hash !== lastImageHash) {
        lastImageHash = hash;
        addImageToHistory(img);
      }
    } else {
      lastImageHash = '';
    }
  } catch (err) {
    console.error('Error polling clipboard:', err);
  }
}

function startClipboardMonitor() {
  // Initialize paths here, after app is ready
  CLIPBOARD_HISTORY_FILE = path.join(app.getPath('userData'), 'clipboard_history.json');
  CLIP_IMAGES_DIR = path.join(app.getPath('userData'), 'clip_images');

  ensureDirectories();
  loadClipboardHistory();
  
  try {
    lastText = clipboard.readText();
    const img = clipboard.readImage();
    if (!img.isEmpty()) {
      const size = img.getSize();
      lastImageHash = `${size.width}x${size.height}`;
    }
  } catch (e) {}

  setInterval(checkClipboard, 1000);
}

function writeToSystemClipboard(content, type) {
  try {
    if (type === 'image') {
      if (fs.existsSync(content)) {
        const { nativeImage } = require('electron');
        const img = nativeImage.createFromPath(content);
        clipboard.writeImage(img);
        const size = img.getSize();
        lastImageHash = `${size.width}x${size.height}`;
      }
    } else {
      clipboard.writeText(content);
      lastText = content;
    }
    return true;
  } catch (err) {
    console.error('Error writing to clipboard:', err);
    return false;
  }
}

function deleteClipboardItem(id) {
  const item = clipboardHistory.find(i => i.id === id);
  if (item && item.type === 'image' && fs.existsSync(item.content)) {
    try {
      fs.unlinkSync(item.content);
    } catch (err) {
      console.error('Error deleting image file:', err);
    }
  }
  clipboardHistory = clipboardHistory.filter(i => i.id !== id);
  saveClipboardHistory();
}

function clearClipboardHistory() {
  for (const item of clipboardHistory) {
    if (item.type === 'image' && fs.existsSync(item.content)) {
      try {
        fs.unlinkSync(item.content);
      } catch (err) {
        console.error('Error deleting image file on clear:', err);
      }
    }
  }
  clipboardHistory = [];
  saveClipboardHistory();
}

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
  searchEngine: 'google',
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

const SEARCH_ENGINE_MAP = {
  google: {
    name: 'Google',
    url: 'https://www.google.com/search?q={query}',
    base: 'https://www.google.com'
  },
  duckduckgo: {
    name: 'DuckDuckGo',
    url: 'https://duckduckgo.com/?q={query}',
    base: 'https://duckduckgo.com'
  },
  bing: {
    name: 'Bing',
    url: 'https://www.bing.com/search?q={query}',
    base: 'https://www.bing.com'
  },
  yahoo: {
    name: 'Yahoo',
    url: 'https://search.yahoo.com/search?p={query}',
    base: 'https://search.yahoo.com'
  }
};

function getSearchEngineData(key) {
  return SEARCH_ENGINE_MAP[key] || SEARCH_ENGINE_MAP.google;
}

// IPC Handlers
ipcMain.handle('search', async (event, query) => {
  if (!query) {
    return searchIndex.filter(item => item.type === 'utility');
  }

  const cleanQuery = query.toLowerCase().trim();
  const engineKey = currentSettings.searchEngine || 'google';
  const engine = getSearchEngineData(engineKey);

  // Web search shortcut prefix modes
  if (cleanQuery.startsWith('@ ') || cleanQuery.startsWith('@')) {
    const searchTerm = query.replace(/^@\s*/, '');
    if (searchTerm.trim() !== '') {
      return [{
        name: `Search ${engine.name} for "${searchTerm}"`,
        path: engine.url.replace('{query}', encodeURIComponent(searchTerm)),
        type: 'web',
        category: 'Web Search',
        icon: 'Globe'
      }];
    } else {
      return [{
        name: `Search Web using ${engine.name}...`,
        path: engine.base,
        type: 'web',
        category: 'Web Search',
        icon: 'Globe'
      }];
    }
  }

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

  // Web search prefix modes
  if (cleanQuery.startsWith('/g ') || cleanQuery.startsWith('/google ')) {
    const searchTerm = query.replace(/^\/(g|google)\s+/, '');
    return [{
      name: `Search Google for "${searchTerm}"`,
      path: `https://www.google.com/search?q=${encodeURIComponent(searchTerm)}`,
      type: 'web',
      category: 'Web Search',
      icon: 'Globe'
    }];
  }

  if (cleanQuery.startsWith('/w ') || cleanQuery.startsWith('/wiki ') || cleanQuery.startsWith('/wikipedia ')) {
    const searchTerm = query.replace(/^\/(w|wiki|wikipedia)\s+/, '');
    return [{
      name: `Search Wikipedia for "${searchTerm}"`,
      path: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(searchTerm)}`,
      type: 'web',
      category: 'Wikipedia Search',
      icon: 'Globe'
    }];
  }

  if (cleanQuery.startsWith('/yt ') || cleanQuery.startsWith('/youtube ')) {
    const searchTerm = query.replace(/^\/(yt|youtube)\s+/, '');
    return [{
      name: `Search YouTube for "${searchTerm}"`,
      path: `https://www.youtube.com/results?search_query=${encodeURIComponent(searchTerm)}`,
      type: 'web',
      category: 'YouTube Search',
      icon: 'Globe'
    }];
  }

  // Exact shortcut help fallbacks
  if (cleanQuery === '/g' || cleanQuery === '/google') {
    return [{
      name: 'Search Google...',
      path: 'https://www.google.com',
      type: 'web',
      category: 'Web Search',
      icon: 'Globe'
    }];
  }
  if (cleanQuery === '/w' || cleanQuery === '/wiki' || cleanQuery === '/wikipedia') {
    return [{
      name: 'Search Wikipedia...',
      path: 'https://en.wikipedia.org',
      type: 'web',
      category: 'Wikipedia Search',
      icon: 'Globe'
    }];
  }
  if (cleanQuery === '/yt' || cleanQuery === '/youtube') {
    return [{
      name: 'Search YouTube...',
      path: 'https://www.youtube.com',
      type: 'web',
      category: 'YouTube Search',
      icon: 'Globe'
    }];
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

  const sortedResults = results
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.type === 'app' && b.type !== 'app') return -1;
      if (b.type === 'app' && a.type !== 'app') return 1;
      return a.name.localeCompare(b.name);
    });

  const limit = currentSettings.resultsLimit || 10;
  const finalResults = sortedResults.slice(0, limit - 1);
  finalResults.push({
    name: `Search ${engine.name} for "${query}"`,
    path: engine.url.replace('{query}', encodeURIComponent(query)),
    type: 'web',
    category: 'Web Search',
    icon: 'Globe'
  });

  return finalResults;
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

  if (type === 'web') {
    try {
      await shell.openExternal(filePath);
      return { success: true };
    } catch (err) {
      console.error('Web launch error:', err);
      return { success: false, error: err.message };
    }
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

ipcMain.handle('open-parent-folder', async (event, filePath) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }

  if (!filePath || filePath.startsWith('utility://') || filePath.startsWith('calc://') || filePath.startsWith('command://') || filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return { success: false, error: 'Not a local file' };
  }

  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File does not exist' };
    }
    shell.showItemInFolder(filePath);
    return { success: true };
  } catch (err) {
    console.error('Error opening parent folder:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('run-as-admin', async (event, filePath) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }

  if (!filePath || filePath.startsWith('utility://') || filePath.startsWith('calc://') || filePath.startsWith('command://') || filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return { success: false, error: 'Not an executable file' };
  }

  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File does not exist' };
    }

    let targetPath = filePath;
    if (filePath.toLowerCase().endsWith('.lnk')) {
      try {
        const shortcut = shell.readShortcutLink(filePath);
        if (shortcut && shortcut.target && fs.existsSync(shortcut.target)) {
          targetPath = shortcut.target;
        }
      } catch (e) {
        // Fallback to original shortcut path
      }
    }

    // Spawn PowerShell to run the process as administrator (UAC popup)
    const escapedPath = targetPath.replace(/'/g, "''");
    const { spawn } = require('child_process');
    spawn('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Start-Process -FilePath '${escapedPath}' -Verb RunAs`
    ]);

    return { success: true };
  } catch (err) {
    console.error('Error running as admin:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('copy-file', async (event, filePath) => {
  if (!filePath || filePath.startsWith('utility://') || filePath.startsWith('calc://') || filePath.startsWith('command://') || filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return { success: false, error: 'Not a copyable file' };
  }

  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File does not exist' };
    }

    const { clipboard } = require('electron');
    // Copy path as text
    clipboard.writeText(filePath);

    // On Windows, use PowerShell to copy file to clipboard as file object (CF_HDROP)
    if (process.platform === 'win32') {
      const escapedPath = filePath.replace(/'/g, "''");
      const { spawn } = require('child_process');
      const psScript = `
        Add-Type -AssemblyName System.Windows.Forms
        $files = New-Object System.Collections.Specialized.StringCollection
        $files.Add('${escapedPath}') | Out-Null
        [System.Windows.Forms.Clipboard]::SetFileDropList($files)
      `;
      spawn('powershell.exe', ['-NoProfile', '-Command', psScript]);
    }

    return { success: true };
  } catch (err) {
    console.error('Error copying file:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-clipboard-history', () => {
  return clipboardHistory;
});

ipcMain.handle('write-to-clipboard', (event, { content, type }) => {
  return writeToSystemClipboard(content, type);
});

ipcMain.handle('clear-clipboard-history', () => {
  clearClipboardHistory();
  return true;
});

ipcMain.handle('delete-clipboard-item', (event, id) => {
  deleteClipboardItem(id);
  return true;
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
  startClipboardMonitor();

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
