# SnowSeek

A premium, keyboard-driven desktop utility and search launcher built with Electron, React, and Vite.

## How to Run

### Production Setup
To compile and run the standalone installer:
1. Open a terminal inside the `snowseek` directory and build the installer:
   ```bash
   npm run dist
   ```
2. Run the generated installer found in the output directory:
   `snowseek/dist-installer/SnowSeek Setup 1.0.0.exe`

### Development Mode
If running the dev environment manually:
1. Navigate to the `snowseek` subdirectory:
   ```bash
   cd snowseek
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server and Electron client:
   ```bash
   npm start
   ```

## Controls & Shortcuts

* **Summon/Hide Launcher:** `Alt + Space` (configurable in settings)
* **Navigate Results:** `Arrow Up / Down`
* **Launch/Open:** `Enter`
* **Clear Text / Close Widget / Hide Window:** `Escape`

## Smart Query Syntax

* **Math Calculations:** Type any arithmetic expression (e.g., `(12 + 8) * 5`) to view inline results. Press `Enter` to copy the result to your clipboard.
* **Shell Commands:** Prefix your query with `>` to run terminal commands directly (e.g., `> explorer .`).
* **Search Files & Folders:** Standard queries fuzzy search apps, folders, and indexed files dynamically.

## Built-in Utilities
Type the utility name (or select it from search) to access:
* **System Stats:** Monitor CPU load, memory usage, uptime, and indexed files count.
* **Quick Notes:** Auto-saving inline scratchpad for quick notes.
* **Settings:** Configure global shortcuts, theme presets, light/dark mode, transparency opacity, search limits, and custom folder scan paths.
