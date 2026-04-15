# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Auto-update support via electron-updater (requires GitHub repository configuration)
- Version bump scripts (`npm run version:patch/minor/major`)
- MIT License file

### Changed
- Updated package.json with publish configuration placeholder
- Added update-related IPC handlers and tray menu item

## [0.1.0] - 2026-04-15

### Added
- Initial release of Tokscale Floating Monitor
- Floating always-on-top window with draggable title bar
- System tray resident mode with context menu
- Six dashboard panels: Overview, Models, Daily, Hourly, Stats, Agents
- 24-hour line chart (SVG implementation, no external dependencies)
- Background polling of tokscale CLI commands with configurable intervals (5s to 300s)
- Auto-detection of local proxy (port 7890) for LiteLLM network requests
- NSIS installer with custom installation path support
- Automatic tokscale.exe deployment and PATH configuration
- Chinese/Unicode path compatibility

### Fixed
- tokscale execution timeout increased from 12s to 90s (initial runs take 30-50s)
- Proxy environment variable passing to tokscale subprocess
- Correct binary search path for npm-global tokscale installation
- Vite base path issue causing black screen in packaged app
- Window draggable area when frame is disabled
- CMD wrapper script quoting issues with Chinese/special character paths
- Electron-builder proxy interference during NSIS binary download

### Technical Details
- Electron + React + TypeScript + Vite
- Context isolation enabled, nodeIntegration disabled
- Custom scrollbar for right-side content
- Logo integration (window, tray, installer)
- Unicode NSIS script for PATH updates
- Portable build option available