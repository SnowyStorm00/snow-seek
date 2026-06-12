import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Sparkles, Cpu, File, Folder, Terminal, 
  Calculator, Activity, FileText, FileCode2, Image, 
  Music, Video, BookOpen, AlertCircle, Play, ChevronRight,
  Settings, X, Plus, Trash2, Copy, ArrowLeft, RotateCcw,
  Sun, Moon, ChevronDown, Globe, Check, Shield, Clipboard
} from 'lucide-react';

const IconMap = {
  Search, Sparkles, Cpu, File, Folder, Terminal, 
  Calculator, Activity, FileText, FileCode: FileCode2, 
  Image, Music, Video, BookOpen, Settings, Globe, Clipboard
};

// ResultIcon component queries native shell icons asynchronously or displays local thumbnails
function ResultIcon({ item }) {
  const [iconUrl, setIconUrl] = useState(null);
  
  useEffect(() => {
    if (item.type === 'utility') return;
    if (item.icon === 'Image') return; // rendered directly as thumbnail

    let active = true;
    if (window.api && window.api.getFileIcon) {
      window.api.getFileIcon(item.path).then(dataUrl => {
        if (active && dataUrl) {
          setIconUrl(dataUrl);
        }
      });
    }
    return () => { active = false; };
  }, [item.path]);

  if (item.type === 'utility') {
    const IconComponent = IconMap[item.icon] || File;
    return <IconComponent size={18} />;
  }

  if (item.icon === 'Image') {
    // webSecurity is disabled, so we can load file:/// protocol directly
    return (
      <img 
        src={`file:///${item.path}`} 
        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} 
        alt="" 
      />
    );
  }

  if (iconUrl) {
    return <img src={iconUrl} style={{ width: 22, height: 22, objectFit: 'contain' }} alt="" />;
  }

  const FallbackIcon = IconMap[item.icon] || File;
  return <FallbackIcon size={18} />;
}

// ToastIcon component for unique feedback overlay
function ToastIcon({ type }) {
  if (type === 'copy') return <Copy size={13} />;
  if (type === 'folder') return <Folder size={13} />;
  if (type === 'admin') return <Shield size={13} />;
  if (type === 'error') return <AlertCircle size={13} />;
  return <Check size={13} />;
}

// Custom Select component for styled dropdowns
function CustomSelect({ value, options, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value) || options[0];

  return (
    <div className="custom-select-container" ref={dropdownRef}>
      <button className="custom-select-trigger" onClick={() => setIsOpen(!isOpen)}>
        <span>{selectedOption?.label}</span>
        <ChevronDown size={14} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>
      {isOpen && (
        <div className="custom-select-dropdown">
          {options.map(o => (
            <button 
              key={o.value} 
              className={`custom-select-option ${o.value === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(o.value);
                setIsOpen(false);
              }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span>{o.label}</span>
              {o.value === value && (
                <span style={{ color: 'var(--text-accent)', fontWeight: 'bold' }}>✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [indexStatus, setIndexStatus] = useState({ status: 'initializing', count: 0 });
  
  // Custom utilities states
  const [activeUtility, setActiveUtility] = useState(null); // 'notes' | 'stats' | 'calculator' | 'settings'
  const [stats, setStats] = useState(null);
  const [notes, setNotes] = useState('');

  // Settings states
  const [settings, setSettings] = useState({
    shortcut: 'Alt+Space',
    resultsLimit: 10,
    theme: 'indigo',
    opacity: 85,
    isLightMode: false,
    searchEngine: 'google',
    customFolders: []
  });
  const [newFolderInput, setNewFolderInput] = useState('');
  const [appVersion, setAppVersion] = useState('1.0.0');
  const [updateInfo, setUpdateInfo] = useState(null);

  // Calculator states
  const [calcExpression, setCalcExpression] = useState('');
  const [calcResult, setCalcResult] = useState('0');
  const [calcHistory, setCalcHistory] = useState([]);
  
  const [toast, setToast] = useState(null); // { message, type }
  const [clipHistory, setClipHistory] = useState([]);

  // Relative time formatter helper
  const formatRelativeTime = (timestamp) => {
    const diff = Date.now() - timestamp;
    if (diff < 2000) return 'Just now';
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  // Load and poll clipboard history
  useEffect(() => {
    if (activeUtility !== 'clip') return;
    
    const fetchHistory = async () => {
      if (window.api && window.api.getClipboardHistory) {
        const history = await window.api.getClipboardHistory();
        setClipHistory(history);
      }
    };

    fetchHistory();
    const interval = setInterval(fetchHistory, 1000);
    return () => clearInterval(interval);
  }, [activeUtility]);
  const toastTimeoutRef = useRef(null);

  const showToast = (message, type = 'success') => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 2500);
  };

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);
  
  const inputRef = useRef(null);
  const resultsContainerRef = useRef(null);
  const isKeyboardNav = useRef(false);

  // Load Settings and apply Theme on load
  useEffect(() => {
    const loadApp = async () => {
      if (window.api && window.api.getSettings) {
        const loadedSettings = await window.api.getSettings();
        setSettings(loadedSettings);
        const lightClass = loadedSettings.isLightMode ? 'theme-light' : '';
        document.documentElement.className = `theme-${loadedSettings.theme} ${lightClass}`.trim();
        document.documentElement.style.setProperty('--app-opacity', (loadedSettings.opacity ?? 85) / 100);
      }
      if (window.api && window.api.getAppVersion) {
        const ver = await window.api.getAppVersion();
        setAppVersion(ver);
      }
    };
    loadApp();
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Update theme class and opacity on HTML element immediately when settings change
  useEffect(() => {
    const lightClass = settings.isLightMode ? 'theme-light' : '';
    document.documentElement.className = `theme-${settings.theme} ${lightClass}`.trim();
    document.documentElement.style.setProperty('--app-opacity', (settings.opacity ?? 85) / 100);
  }, [settings.theme, settings.opacity, settings.isLightMode]);

  // Listen for indexer status and auto-updates from Electron main process
  useEffect(() => {
    const fetchInitialIndex = async () => {
      if (window.api && window.api.getIndexStatus) {
        const initialStatus = await window.api.getIndexStatus();
        setIndexStatus(initialStatus);
      }
    };
    fetchInitialIndex();

    if (window.api && window.api.onIndexStatus) {
      window.api.onIndexStatus((status) => {
        setIndexStatus(status);
      });
    }

    if (window.api && window.api.onUpdateDownloaded) {
      window.api.onUpdateDownloaded((info) => {
        setUpdateInfo(info);
      });
    }
  }, []);

  // Search query effect
  useEffect(() => {
    if (activeUtility && query === '') return;

    if (activeUtility && query !== '') {
      // Typing exits the widget view
      setActiveUtility(null);
    }

    const performSearch = async () => {
      if (window.api && window.api.search) {
        const list = await window.api.search(query);
        setResults(list);
        setSelectedIndex(0);
      }
    };

    const delayDebounce = setTimeout(performSearch, 50);
    return () => clearTimeout(delayDebounce);
  }, [query, indexStatus.status, activeUtility]);

  // Load stats when stats utility becomes active
  useEffect(() => {
    if (activeUtility !== 'stats') return;

    const fetchStats = async () => {
      if (window.api && window.api.getSystemStats) {
        const currentStats = await window.api.getSystemStats();
        setStats(currentStats);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, [activeUtility]);

  // Load quick notes
  useEffect(() => {
    if (activeUtility !== 'notes') return;

    const loadNotes = async () => {
      if (window.api && window.api.getQuickNotes) {
        const savedNotes = await window.api.getQuickNotes();
        setNotes(savedNotes);
      }
    };
    loadNotes();
  }, [activeUtility]);

  // Notes autosave debounce
  useEffect(() => {
    if (activeUtility !== 'notes' || !notes) return;

    const saveTimeout = setTimeout(() => {
      if (window.api && window.api.saveQuickNotes) {
        window.api.saveQuickNotes(notes);
      }
    }, 500);

    return () => clearTimeout(saveTimeout);
  }, [notes]);

  // Scroll active item into view
  useEffect(() => {
    if (resultsContainerRef.current) {
      const selectedElement = resultsContainerRef.current.children[selectedIndex];
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // Save Settings helper
  const handleSaveSettings = async (updatedSettings) => {
    setSettings(updatedSettings);
    if (window.api && window.api.saveSettings) {
      await window.api.saveSettings(updatedSettings);
    }
  };

  // Folders management
  const addFolder = () => {
    if (!newFolderInput.trim()) return;
    const folders = [...settings.customFolders, newFolderInput.trim()];
    handleSaveSettings({ ...settings, customFolders: folders });
    setNewFolderInput('');
  };

  const removeFolder = (indexToRemove) => {
    const folders = settings.customFolders.filter((_, idx) => idx !== indexToRemove);
    handleSaveSettings({ ...settings, customFolders: folders });
  };

  // Calculator helper
  const evaluateCalc = (expression) => {
    try {
      // Limit to numbers, brackets, decimal, operators, spaces
      const cleanExpr = expression.replace(/[^0-9+\-*/().\s]/g, '');
      if (!cleanExpr) return '0';
      const res = new Function(`return ${cleanExpr}`)();
      if (typeof res === 'number' && !isNaN(res)) {
        return Number(res.toFixed(8)).toString(); // Avoid floating point decimals overflow
      }
    } catch (e) {
      return 'Error';
    }
    return '0';
  };

  const handleCalcKeyPress = (key) => {
    if (key === 'C') {
      setCalcExpression('');
      setCalcResult('0');
    } else if (key === 'Back') {
      if (calcExpression === '') {
        setActiveUtility(null);
        if (inputRef.current) inputRef.current.focus();
      } else {
        setCalcExpression(prev => prev.slice(0, -1));
      }
    } else if (key === '=') {
      const result = evaluateCalc(calcExpression);
      setCalcResult(result);
      if (result !== 'Error' && calcExpression.trim() !== '') {
        setCalcHistory(prev => [
          { expression: calcExpression, result },
          ...prev
        ].slice(0, 10));
      }
    } else if (key === 'Copy') {
      navigator.clipboard.writeText(calcResult);
    } else {
      // Prevent operators at start
      if (['+', '*', '/'].includes(key) && calcExpression === '') return;
      setCalcExpression(prev => prev + key);
    }
  };

  // Handle launches
  const handleCopyClipItem = async (item) => {
    if (window.api && window.api.writeToClipboard) {
      const success = await window.api.writeToClipboard(item.content, item.type);
      if (success) {
        showToast(`Copied item back to clipboard!`, 'success');
        if (window.api && window.api.hideWindow) {
          window.api.hideWindow();
        }
      } else {
        showToast(`Failed to copy item`, 'error');
      }
    }
  };

  const handleDeleteClipItem = async (item) => {
    if (window.api && window.api.deleteClipboardItem) {
      await window.api.deleteClipboardItem(item.id);
      setClipHistory(prev => prev.filter(i => i.id !== item.id));
      showToast(`Deleted clipboard item`, 'success');
    }
  };

  const handleClearClipHistory = async () => {
    if (window.api && window.api.clearClipboardHistory) {
      await window.api.clearClipboardHistory();
      setClipHistory([]);
      showToast(`Cleared clipboard history`, 'success');
    }
  };

  const handleLaunch = async (item) => {
    if (!item) return;

    if (item.type === 'utility') {
      if (item.path === 'utility://notes') {
        setActiveUtility('notes');
        setQuery('');
      } else if (item.path === 'utility://stats') {
        setActiveUtility('stats');
        setQuery('');
      } else if (item.path === 'utility://calculator') {
        setActiveUtility('calculator');
        setQuery('');
      } else if (item.path === 'utility://clip') {
        setActiveUtility('clip');
        setQuery('');
      } else if (item.path === 'utility://settings') {
        setActiveUtility('settings');
        setQuery('');
      } else if (item.path === 'utility://terminal') {
        setQuery('>');
        if (inputRef.current) inputRef.current.focus();
      }
      return;
    }

    if (window.api && window.api.launch) {
      await window.api.launch(item.path, item.type);
    }
  };

  // Keyboard navigation & inputs
  const filteredClipHistory = clipHistory.filter(item => {
    if (!query) return true;
    const q = query.toLowerCase().trim();
    if (q === 'image' || q === 'img') return item.type === 'image';
    if (q === 'code' || q === 'snippet') return item.type === 'code';
    if (q === 'text') return item.type === 'text';
    if (item.type === 'image') return false;
    return item.content.toLowerCase().includes(q);
  });

  // Clamp selection index for clipboard list on search query change
  useEffect(() => {
    if (activeUtility === 'clip') {
      setSelectedIndex(prev => {
        const max = Math.max(0, filteredClipHistory.length - 1);
        return Math.min(prev, max);
      });
    }
  }, [query, clipHistory, activeUtility]);

  const handleKeyDown = (e) => {
    // If Clipboard Monitor is active, handle lists navigation
    if (activeUtility === 'clip') {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filteredClipHistory.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selectedItem = filteredClipHistory[selectedIndex];
        if (selectedItem) {
          handleCopyClipItem(selectedItem);
        }
      } else if (e.key === 'Delete') {
        e.preventDefault();
        const selectedItem = filteredClipHistory[selectedIndex];
        if (selectedItem) {
          handleDeleteClipItem(selectedItem);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setActiveUtility(null);
        setQuery('');
        if (inputRef.current) inputRef.current.focus();
      }
      return;
    }

    // If Calculator is focused, feed characters to calculator
    if (activeUtility === 'calculator') {
      const calcKeys = '0123456789+-*/.()';
      if (calcKeys.includes(e.key)) {
        e.preventDefault();
        handleCalcKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleCalcKeyPress('Back');
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        handleCalcKeyPress('=');
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        handleCalcKeyPress('C');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setActiveUtility(null);
        if (inputRef.current) inputRef.current.focus();
      }
      return;
    }

    // Default keyboard navigation for other screens
    const isGridMode = !query && results.every(r => r.type === 'utility');
    const GRID_COLS = 3;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      isKeyboardNav.current = true;
      if (isGridMode) {
        setSelectedIndex((prev) => Math.min(prev + GRID_COLS, results.length - 1));
      } else {
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      isKeyboardNav.current = true;
      if (isGridMode) {
        setSelectedIndex((prev) => Math.max(prev - GRID_COLS, 0));
      } else {
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      }
    } else if (e.key === 'ArrowRight' && isGridMode) {
      e.preventDefault();
      isKeyboardNav.current = true;
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowLeft' && isGridMode) {
      e.preventDefault();
      isKeyboardNav.current = true;
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selectedItem = results[selectedIndex];
      if (selectedItem) {
        if (e.shiftKey) {
          if (window.api && window.api.openParentFolder) {
            window.api.openParentFolder(selectedItem.path).then(res => {
              if (res && res.success) {
                showToast(`Opened folder containing "${selectedItem.name}"`, 'folder');
              } else {
                showToast(res?.error || 'Could not open folder', 'error');
              }
            });
          }
        } else if (e.ctrlKey) {
          if (window.api && window.api.runAsAdmin) {
            window.api.runAsAdmin(selectedItem.path).then(res => {
              if (res && res.success) {
                showToast(`Launching "${selectedItem.name}" as Administrator`, 'admin');
              } else {
                showToast(res?.error || 'Could not run as admin', 'error');
              }
            });
          }
        } else {
          handleLaunch(selectedItem);
        }
      }
    } else if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
      const isTextInputFocused = document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');
      const hasSelection = isTextInputFocused && (document.activeElement.selectionStart !== document.activeElement.selectionEnd);

      if (!hasSelection && results[selectedIndex]) {
        e.preventDefault();
        const selectedItem = results[selectedIndex];
        if (window.api && window.api.copyFile) {
          window.api.copyFile(selectedItem.path).then(res => {
            if (res && res.success) {
              showToast(`Copied "${selectedItem.name}" to clipboard`, 'copy');
            } else {
              showToast(res?.error || 'Could not copy file', 'error');
            }
          });
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (activeUtility) {
        setActiveUtility(null);
        setQuery('');
        if (inputRef.current) inputRef.current.focus();
      } else if (query !== '') {
        setQuery('');
        if (inputRef.current) inputRef.current.focus();
      } else {
        if (window.api && window.api.hideWindow) {
          window.api.hideWindow();
        }
      }
    }
  };

  const handleKeyDownRef = useRef(handleKeyDown);
  useEffect(() => {
    handleKeyDownRef.current = handleKeyDown;
  });

  useEffect(() => {
    const listener = (e) => {
      handleKeyDownRef.current(e);
    };
    document.addEventListener('keydown', listener);
    return () => {
      document.removeEventListener('keydown', listener);
    };
  }, []);

  return (
    <div className="app-container">
      {/* Search Bar */}
      <header className="search-header">
        <div className="search-icon-wrapper">
          <Search size={22} />
        </div>
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder={
            activeUtility === 'notes' ? "Type to search notes..." : 
            activeUtility === 'stats' ? "System Monitor Active" : 
            activeUtility === 'calculator' ? "Type numbers & operators (+, -, *, /) directly..." : 
            activeUtility === 'settings' ? "Settings Panel Active" :
            "Search files, apps, calculations, or type '>' for shell..."
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {activeUtility && (
          <span className="search-badge">
            {activeUtility === 'notes' ? 'Notes' : 
             activeUtility === 'stats' ? 'Monitor' :
             activeUtility === 'calculator' ? 'Calculator' : 'Settings'}
          </span>
        )}
      </header>

      {/* Main Content Pane */}
      <main className="content-area">
        {updateInfo && (
          <div className="update-banner">
            <div className="update-banner-content">
              <Sparkles className="update-banner-icon animate-pulse-slow" size={16} />
              <span className="update-banner-text">
                Version <strong>v{updateInfo.version}</strong> is ready to install.
              </span>
            </div>
            <div className="update-banner-actions">
              <button className="btn-update-restart" onClick={() => window.api.restartAndInstall()}>
                Restart Now
              </button>
              <button className="btn-update-later" onClick={() => setUpdateInfo(null)}>
                Later
              </button>
            </div>
          </div>
        )}
        {activeUtility === 'notes' ? (
          <div className="notes-container">
            <div className="notes-header">
              <span>Quick Scratchpad</span>
              <kbd>Esc to Close</kbd>
            </div>
            <textarea
              className="notes-textarea"
              placeholder="Write some notes here... Auto-saves instantly."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              autoFocus
            />
          </div>
        ) : activeUtility === 'stats' ? (
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-header">
                <span>CPU Load</span>
                <Cpu size={16} className="stat-icon" />
              </div>
              <div className="stat-value-large">{stats?.cpu?.load || '0.0%'}</div>
              <div className="stat-label-small">{stats?.cpu?.model || 'Detecting Processor...'}</div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <span>Memory Usage</span>
                <Activity size={16} className="stat-icon" />
              </div>
              <div className="stat-value-large">{stats?.memory?.percentage || '0'}%</div>
              <div className="stat-progress-bar-bg">
                <div 
                  className="stat-progress-bar-fill" 
                  style={{ width: `${stats?.memory?.percentage || 0}%` }}
                />
              </div>
              <div className="stat-label-small">{stats?.memory?.used} / {stats?.memory?.total}</div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <span>System Uptime</span>
                <Sparkles size={16} className="stat-icon" />
              </div>
              <div className="stat-value-large">{stats?.uptime || '0 hours'}</div>
              <div className="stat-label-small">Running smoothly in background</div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <span>Indexed Files</span>
                <FileText size={16} className="stat-icon" />
              </div>
              <div className="stat-value-large">{indexStatus.count}</div>
              <div className="stat-label-small">Indexing status: {indexStatus.status}</div>
            </div>
          </div>
        ) : activeUtility === 'calculator' ? (
          /* Dedicated Calculator UI */
          <div className="calc-container">
            <div className="calc-workspace">
              <div className="calc-screen">
                <div className="calc-expression">{calcExpression || '0'}</div>
                <div className="calc-value">{calcResult}</div>
              </div>
              <div className="calc-keys">
                {['C', '(', ')', '/'].map(k => (
                  <button key={k} className="calc-key op" onClick={() => handleCalcKeyPress(k)}>{k}</button>
                ))}
                {['7', '8', '9', '*'].map(k => (
                  <button key={k} className={`calc-key ${isNaN(k) ? 'op' : ''}`} onClick={() => handleCalcKeyPress(k)}>{k}</button>
                ))}
                {['4', '5', '6', '-'].map(k => (
                  <button key={k} className={`calc-key ${isNaN(k) ? 'op' : ''}`} onClick={() => handleCalcKeyPress(k)}>{k}</button>
                ))}
                {['1', '2', '3', '+'].map(k => (
                  <button key={k} className={`calc-key ${isNaN(k) ? 'op' : ''}`} onClick={() => handleCalcKeyPress(k)}>{k}</button>
                ))}
                {['Back', '0', '.', '='].map(k => (
                  <button key={k} className={`calc-key ${k === '=' ? 'equals' : k === 'Back' ? 'action' : ''}`} onClick={() => handleCalcKeyPress(k)}>{k}</button>
                ))}
              </div>
            </div>
            <div className="calc-history">
              <div className="calc-history-title">Calculation History</div>
              <div className="calc-history-list">
                {calcHistory.map((h, i) => (
                  <div 
                    key={i} 
                    className="calc-history-item" 
                    onClick={() => {
                      setCalcExpression(h.expression);
                      setCalcResult(h.result);
                    }}
                  >
                    <div className="calc-hist-expr">{h.expression}</div>
                    <div className="calc-hist-val">= {h.result}</div>
                  </div>
                ))}
                {calcHistory.length === 0 && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '20px' }}>
                    No calculations run yet
                  </div>
                )}
              </div>
              {calcResult !== '0' && calcResult !== 'Error' && (
                <button 
                  className="btn-add" 
                  style={{ width: '100%', display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center', marginTop: '12px' }}
                  onClick={() => handleCalcKeyPress('Copy')}
                >
                  <Copy size={14} /> Copy Answer
                </button>
              )}
            </div>
          </div>
        ) : activeUtility === 'clip' ? (
          /* Dedicated Clipboard UI */
          <div className="clip-container">
            <div className="clip-header">
              <span>Clipboard History Monitor</span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button className="btn-clear-all" onClick={handleClearClipHistory}>
                  <Trash2 size={12} /> Clear All
                </button>
                <kbd>Esc to Close</kbd>
              </div>
            </div>
            <div className="clip-list" ref={resultsContainerRef}>
              {filteredClipHistory.map((item, idx) => (
                <div 
                  key={item.id} 
                  className={`clip-item ${selectedIndex === idx ? 'selected' : ''}`}
                  onClick={() => handleCopyClipItem(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div className="clip-icon-col">
                    {item.type === 'image' ? <Image size={16} /> : 
                     item.type === 'code' ? <FileCode2 size={16} /> : <FileText size={16} />}
                  </div>
                  <div className="clip-content-col">
                    {item.type === 'image' ? (
                      <div className="clip-image-preview">
                        <img src={`file:///${item.content}`} alt="clipboard img" />
                      </div>
                    ) : item.type === 'code' ? (
                      <pre className="clip-code-preview">
                        <code>{item.content}</code>
                      </pre>
                    ) : (
                      <div className="clip-text-preview">
                        {item.content}
                      </div>
                    )}
                  </div>
                  <div className="clip-meta-col">
                    <span className="clip-time">{formatRelativeTime(item.timestamp)}</span>
                    <button 
                      className="btn-item-delete" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClipItem(item);
                      }}
                      title="Delete clip"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
              {filteredClipHistory.length === 0 && (
                <div className="empty-state" style={{ padding: '60px 20px' }}>
                  <AlertCircle size={32} className="empty-icon" />
                  <h3 className="empty-title">No clips found</h3>
                  <p className="empty-subtitle">
                    Copied items will automatically appear here.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : activeUtility === 'settings' ? (
          /* Settings UI */
          <div className="settings-container">
            <div className="settings-header">
              <span className="settings-title">
                Launch settings
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'normal', marginLeft: '8px', opacity: 0.8 }}>v{appVersion}</span>
              </span>
              <kbd>Esc to Close</kbd>
            </div>
            
            {/* Keybindings */}
            <div className="settings-section">
              <div className="settings-section-title">System hotkey</div>
              <div className="settings-row">
                <div className="settings-label">
                  <span className="settings-name">Summon Shortcut</span>
                  <span className="settings-description">Global keyboard shortcut to show or hide the launcher window.</span>
                </div>
                <CustomSelect
                  value={settings.shortcut}
                  options={[
                    { value: 'Alt+Space', label: 'Alt + Space' },
                    { value: 'Ctrl+Space', label: 'Ctrl + Space' },
                    { value: 'Ctrl+Shift+Space', label: 'Ctrl + Shift + Space' }
                  ]}
                  onChange={(val) => handleSaveSettings({ ...settings, shortcut: val })}
                />
              </div>
            </div>

            {/* General Settings */}
             <div className="settings-section">
              <div className="settings-section-title">General settings</div>

              <div className="settings-row" style={{ marginBottom: '12px' }}>
                <div className="settings-label">
                  <span className="settings-name">Interface Theme Mode</span>
                  <span className="settings-description">Switch between light glass and deep cyber-dark modes.</span>
                </div>
                <button 
                  className="btn-add" 
                  style={{ minWidth: '170px', justifyContent: 'center' }}
                  onClick={() => handleSaveSettings({ ...settings, isLightMode: !settings.isLightMode })}
                >
                  {settings.isLightMode ? (
                    <>
                      <Sun size={14} /> Light Mode
                    </>
                  ) : (
                    <>
                      <Moon size={14} /> Dark Mode
                    </>
                  )}
                </button>
              </div>

              <div className="settings-row" style={{ marginBottom: '12px' }}>
                <div className="settings-label">
                  <span className="settings-name">Active Theme Preset</span>
                  <span className="settings-description">Visual highlights, card overlays, and accent colors.</span>
                </div>
                <div className="theme-grid">
                  {['indigo', 'emerald', 'amber', 'crimson', 'rose'].map(t => (
                    <div 
                      key={t} 
                      className={`theme-option ${t} ${settings.theme === t ? 'active' : ''}`}
                      onClick={() => handleSaveSettings({ ...settings, theme: t })}
                      title={t.charAt(0).toUpperCase() + t.slice(1)}
                    />
                  ))}
                </div>
              </div>

              <div className="settings-row" style={{ marginBottom: '12px' }}>
                <div className="settings-label">
                  <span className="settings-name">Window Opacity</span>
                  <span className="settings-description">Adjust the transparency of the launcher window glass ({settings.opacity ?? 85}%).</span>
                </div>
                <input 
                  type="range" 
                  min="50" 
                  max="100" 
                  className="settings-input" 
                  style={{ minWidth: '140px', padding: 0 }}
                  value={settings.opacity ?? 85}
                  onChange={(e) => handleSaveSettings({ ...settings, opacity: parseInt(e.target.value) })}
                />
              </div>
              
              <div className="settings-row" style={{ marginBottom: '12px' }}>
                <div className="settings-label">
                  <span className="settings-name">Search Results Limit</span>
                  <span className="settings-description">Maximum number of results to display in the dropdown.</span>
                </div>
                <CustomSelect
                  value={String(settings.resultsLimit)}
                  options={[
                    { value: '5', label: '5 Results' },
                    { value: '10', label: '10 Results' },
                    { value: '15', label: '15 Results' },
                    { value: '20', label: '20 Results' }
                  ]}
                  onChange={(val) => handleSaveSettings({ ...settings, resultsLimit: parseInt(val) })}
                />
              </div>

              <div className="settings-row">
                <div className="settings-label">
                  <span className="settings-name">Default Search Engine</span>
                  <span className="settings-description">Preferred search engine for shortcuts and general web queries.</span>
                </div>
                <CustomSelect
                  value={settings.searchEngine || 'google'}
                  options={[
                    { value: 'google', label: 'Google' },
                    { value: 'duckduckgo', label: 'DuckDuckGo' },
                    { value: 'bing', label: 'Bing' },
                    { value: 'yahoo', label: 'Yahoo' }
                  ]}
                  onChange={(val) => handleSaveSettings({ ...settings, searchEngine: val })}
                />
              </div>
            </div>

            {/* Folders scanning settings */}
            <div className="settings-section">
              <div className="settings-section-title">Custom Search Folders</div>
              <p className="settings-description" style={{ marginBottom: '8px' }}>
                Directories indexed in the background alongside standard User Desktop, Downloads, and Documents folders.
              </p>
              <div className="folder-list">
                {settings.customFolders.map((f, i) => (
                  <div key={i} className="folder-item">
                    <span>{f}</span>
                    <button className="btn-remove" onClick={() => removeFolder(i)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {settings.customFolders.length === 0 && (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px 0' }}>
                    No custom directories indexed.
                  </div>
                )}
              </div>
              <div className="folder-add-row">
                <input 
                  type="text" 
                  className="settings-input" 
                  style={{ flex: 1 }}
                  placeholder="e.g. C:\projects"
                  value={newFolderInput}
                  onChange={(e) => setNewFolderInput(e.target.value)}
                />
                <button className="btn-add" onClick={addFolder}>
                  <Plus size={16} /> Add Folder
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Normal Search Results List */
          <div ref={resultsContainerRef} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {/* Empty state: compact utility grid */}
            {!query && results.every(r => r.type === 'utility') ? (
              <div className="utility-grid">
                {results.map((item, idx) => {
                  const IconComponent = IconMap[item.icon] || File;
                  return (
                    <button
                      key={item.path}
                      className={`utility-tile ${selectedIndex === idx ? 'selected' : ''}`}
                      onClick={() => handleLaunch(item)}
                      onMouseEnter={() => {
                        if (!isKeyboardNav.current) setSelectedIndex(idx);
                      }}
                    >
                      <div className="utility-tile-icon">
                        <IconComponent size={20} />
                      </div>
                      <span className="utility-tile-name">{item.name}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              /* Query mode: tall result list */
              <>
                {results.map((item, idx) => (
                  <div
                    key={item.path}
                    className={`result-item ${selectedIndex === idx ? 'selected' : ''}`}
                    onClick={() => handleLaunch(item)}
                    onMouseMove={() => { isKeyboardNav.current = false; }}
                    onMouseEnter={() => {
                      if (!isKeyboardNav.current) setSelectedIndex(idx);
                    }}
                  >
                    <div className="result-icon">
                      <ResultIcon item={item} />
                    </div>
                    <div className="result-details">
                      <div className="result-name">{item.name}</div>
                      <div className="result-path">
                        {item.extra ? item.extra : item.path}
                      </div>
                    </div>
                    {item.category && (
                      <span className="result-category">{item.category}</span>
                    )}
                  </div>
                ))}

                {results.length === 0 && (
                  <div className="empty-state">
                    <AlertCircle size={40} className="empty-icon" />
                    <h3 className="empty-title">No items found</h3>
                    <p className="empty-subtitle">
                      We couldn't find matches for "{query}". Try checking your spelling or typing a system command.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {/* Footer Status Bar */}
      <footer className="status-bar">
        <div className="indexing-indicator">
          {indexStatus.status === 'indexing' ? (
            <>
              <div className="spinner" />
              <span>Indexing local files ({indexStatus.count})...</span>
            </>
          ) : (
            <span>Search index ready: {indexStatus.count} items loaded</span>
          )}
        </div>
        <div className="keyboard-hints">
          <div className="hint-item">
            <kbd>↑↓</kbd> <span>Navigate</span>
          </div>
          <div className="hint-item">
            <kbd>↵</kbd> <span>Launch</span>
          </div>
          <div className="hint-item">
            <kbd>Shift+↵</kbd> <span>Folder</span>
          </div>
          <div className="hint-item">
            <kbd>Ctrl+↵</kbd> <span>Admin</span>
          </div>
          <div className="hint-item">
            <kbd>Ctrl+C</kbd> <span>Copy</span>
          </div>
        </div>
      </footer>

      {toast && (
        <div className={`toast-notification toast-${toast.type}`}>
          <div className="toast-shimmer" />
          <div className="toast-icon-wrapper">
            <ToastIcon type={toast.type} />
          </div>
          <span className="toast-message">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
