# LoBeats

![Version badge](https://img.shields.io/badge/version-1.1.0-2ea44f) ![Platform Windows](https://img.shields.io/badge/platform-Windows-0078d7) ![Platform Linux](https://img.shields.io/badge/platform-Linux-4DB33D) ![Electron badge](https://img.shields.io/badge/Electron-41.0.3-47848f?logo=electron&logoColor=white) ![License badge](https://img.shields.io/badge/license-GNU_GPL_v3-429e00)

LoBeats is a desktop internet radio player built with Electron. It focuses on a Lo-Fi first experience with curated stations, distraction-free playback, and expressive visuals.

Version 1.1.0 includes updates to branding and cross-platform packaging for Windows and Linux.

## Quick Start

- Downloads:
  - Windows: https://github.com/alnyxcs/LoBeats/releases/latest/download/LoBeats-windows.exe
  - Linux (ZIP): https://github.com/alnyxcs/LoBeats/releases/latest/download/LoBeats-linux.zip

- From Source
  - Install dependencies: `npm ci`
  - Build Windows: `npm run build`
  - Build Linux ZIP: `npm run build:linux`
  - Run: `npm start`

## Producing a Release
- Production build (Windows): `npm run build`  // creates LoBeats-windows.exe in dist
- Linux ZIP: `npm run build:linux`  // creates LoBeats-linux.zip in dist

## Features
- Internet radio streaming (HTTP/HTTPS)
- Real-time audio visualizer
- System tray support (show/hide, play/pause, exit)
- Persistent settings and station data via localStorage
- Theme system with multiple visual styles
- In-app update flow (check latest release + direct download)

## Project Structure
- src/          Electron main + preload + renderer
- dist/         Build outputs
- Assets/       Icons and images
- package.json  Scripts and electron-builder config

## Tech Stack
- Electron
- HTML/CSS/Vanilla JavaScript
- Web Audio API
- electron-builder
- electron-log

## Build & Run
- Prerequisites: Node.js and npm
- From Release:
  - Windows and Linux binaries are available via the links above
- From Source:
  - `npm ci`
  - Windows: `npm run build`
  - Linux: `npm run build:linux`
  - Run: `npm start`

## License
GNU GENERAL PUBLIC LICENSE

## Authors
Alnyx <alnyxcs@gmail.com>

## Contributing
- Fork the repository, create a feature branch, and open a pull request.
- Ensure tests pass and follow the project’s coding conventions.

## Support
- If you report issues, please include steps to reproduce and your environment details.
