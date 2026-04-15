# Tokscale Floating Monitor

Electron + React desktop app for live tokscale metrics.

## Features

- Floating always-on-top window
- System tray resident mode
- Background polling of `tokscale --json --today --no-spinner`
- Refresh interval control (5s to 300s / 5 minutes)
- Auto‑detection of local proxy (port 7890) to fix LiteLLM network failures
- Scrollable right-side content (works on reduced height)
- Multi-tab dashboards: Overview / Models / Daily / Hourly / Stats / Agents
- 24-hour line chart at top (hourly cost curve)
- Uses `dist/logo.png` as app/tray/UI logo
- NSIS installer supports custom install path (Windows 10/11)
- Installer deploys bundled `tokscale.exe`, creates `tokscale.cmd`, and appends install directory to user PATH

## Development

```bash
npm install
npm run dev
```

## Build Installer (recommended)

```bash
npm run build
```

Generated app exe path:

`release/Tokscale Floating Monitor-0.1.0-setup.exe`

Optional single-file portable exe build:

```bash
npm run build:portable
```

Optional unpacked app build:

```bash
npm run pack
```

Generated unpacked app path:

`release/win-unpacked/Tokscale Floating Monitor.exe`

## Optional command override

If your tokscale command is not in PATH, set environment variable:

`TOKSCALE_PATH=C:\\Users\\<user>\\AppData\\Roaming\\npm\\tokscale.cmd`

## Path compatibility

- Renderer build uses relative asset paths (`base: './'`), so packaged app works under Chinese and space-containing directories.
- Polling priority: bundled `resources/tokscale.exe` -> npm global binary path -> npm wrapper script -> PATH fallback.
- Auto-proxy detection: if local proxy port 7890 is available, `HTTPS_PROXY` and `HTTP_PROXY` are passed to tokscale subprocess (fixes "LiteLLM JSON parse failed" errors).
- Extended timeout: each tokscale command gets 90 seconds (initial runs can take 30‑50s due to LiteLLM price table fetching).
- Installer PATH updates use Unicode NSIS script and support Chinese/space paths.

## Changelog (v0.1.0 → current)

**Fix: tokscale execution timeout & network errors**

- Increased command timeout from 12s to 90s (tokscale can take 30‑50s on first run)
- Auto‑detects local proxy on port 7890 and passes `HTTPS_PROXY`/`HTTP_PROXY` to subprocess
- Fixed binary search path: correctly finds `tokscale.exe` under npm global install
- Extended refresh intervals: 5s‑300s (was 2s‑60s) to avoid excessive polling
- Improved error logging: stderr included in timeout messages

**All 6 dashboards now load reliably** (Overview, Models, Daily, Hourly, Stats, Agents)

## Release & Version Management

### Version Bumping

```bash
# Increment patch version (0.1.0 → 0.1.1)
npm run version:patch

# Increment minor version (0.1.0 → 0.2.0)
npm run version:minor

# Increment major version (0.1.0 → 1.0.0)
npm run version:major
```

The version bump script updates:
1. `package.json` version field
2. README.md references to the installer executable
3. Remember to update CHANGELOG.md manually

### Auto‑Update Configuration

The app includes electron‑updater support. To enable automatic updates:

1. Create a GitHub repository for the project
2. Update `package.json` → `build.publish` section:
   ```json
   "publish": [
     {
       "provider": "github",
       "owner": "your-github-username",
       "repo": "your-repo-name"
     }
   ]
   ```
3. Set `GH_TOKEN` environment variable with a GitHub personal access token
4. Build with `npm run build` – electron‑builder will upload releases to GitHub

### Code Signing (Optional)

For production distribution on Windows, code signing is recommended:

1. Obtain a code signing certificate (e.g., from DigiCert, Sectigo)
2. Set environment variables:
   ```
   set CSC_LINK=file:///path/to/certificate.pfx
   set CSC_KEY_PASSWORD=your_password
   ```
3. Set `"signAndEditExecutable": true` in `package.json` → `build.win`

### Publishing Workflow

1. Update CHANGELOG.md with new version notes
2. Run `npm run version:patch` (or minor/major)
3. Run `npm run build` to create installer
4. If configured, electron‑builder will automatically upload to GitHub Releases
5. Distribute `release/Tokscale Floating Monitor-{version}-setup.exe`

## Installation & Verification

### Standard Installation

1. Run `Tokscale Floating Monitor-0.1.0-setup.exe`
2. **Choose installation directory** – the installer allows custom path selection
3. Follow the installation wizard
4. Optional: Create desktop and start menu shortcuts (enabled by default)
5. Launch the application from shortcuts or Start Menu

### What the Installer Does

- **Installs application** to selected directory
- **Deploys bundled tokscale.exe** in `resources/` subdirectory
- **Creates `tokscale.cmd` wrapper** in installation root for command-line use
- **Appends installation directory to user PATH** – you can run `tokscale` from any terminal
- **Sets up auto‑start** – app launches on Windows startup (tray‑resident mode)

### Post‑Install Verification

After installation, verify:

1. **Application runs**: Launch "Tokscale Floating Monitor" from Start Menu
2. **Tray icon appears**: Right‑click for menu (Show/Hide, Refresh, Check updates, Quit)
3. **All 6 dashboards load**: Overview, Models, Daily, Hourly, Stats, Agents panels
4. **Toskcale CLI works**: Open a new Command Prompt or PowerShell and run:
   ```bash
   tokscale --json --today --no-spinner
   ```
   Should return JSON data of today's token usage.

### Silent / Unattended Installation

For automated deployment:
```bash
# Silent install to default location
Tokscale Floating Monitor-0.1.0-setup.exe /S

# Silent install to custom directory
Tokscale Floating Monitor-0.1.0-setup.exe /S /D=C:\Program Files\TokscaleMonitor
```

### Uninstallation

1. Use Windows "Add or remove programs"
2. Or run `uninstall.exe` from the installation directory
3. Uninstaller removes:
   - Application files
   - `tokscale.cmd` wrapper
   - Start Menu and Desktop shortcuts
   - **Does NOT remove** tokscale usage data (stored in `%APPDATA%\tokscale\`)

## Troubleshooting

### Proxy Detection Issues

If tokscale commands fail due to network:
- The app auto‑detects proxy on port 7890 (`127.0.0.1:7890`)
- Manually set environment variables if using different proxy:
  ```
  set HTTPS_PROXY=http://your-proxy:port
  set HTTP_PROXY=http://your-proxy:port
  ```

### PATH Not Updated

If `tokscale` command is not recognized after install:
1. Restart terminal or log out/in to refresh PATH
2. Or manually add installation directory to PATH

### Installation Directory with Spaces/Chinese Characters

The installer supports Unicode paths. If issues occur:
1. Install to a simple path (e.g., `C:\TokscaleMonitor`)
2. Ensure user account has write permissions to the chosen directory

## Testing & Quality Assurance

For comprehensive installation testing, see [INSTALL_TEST.md](INSTALL_TEST.md). This document includes:

- Step‑by‑step installation verification
- Functional testing of all 6 dashboard panels
- Uninstallation testing
- Silent installation parameters (`/S`, `/D=`)
- Automated PowerShell test script
- Known issues and solutions

## License

MIT – see [LICENSE](LICENSE) file.
