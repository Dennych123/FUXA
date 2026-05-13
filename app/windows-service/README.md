# FUXA Windows Service

Run FUXA as a Windows background service (auto-start on boot, no login required).

## Requirements

- Windows 10/11 or Windows Server 2016+
- [Node.js LTS](https://nodejs.org) installed
- [NSSM](https://nssm.cc/download) — place `nssm.exe` in `tools\nssm.exe`
  or install via: `winget install NSSM.NSSM`

## Folder structure

```
app/windows-service/
├── install-service.bat     ← run once to install
├── uninstall-service.bat   ← remove service
├── service-manager.bat     ← start/stop/restart/log viewer
└── tools/
    └── nssm.exe            ← put NSSM here (optional, or use system PATH)
```

## Install

1. Download `nssm.exe` (64-bit) from https://nssm.cc/download
2. Place it in `tools\nssm.exe`
3. Right-click `install-service.bat` → **Run as Administrator**
4. Open browser: http://localhost:1881

## Manage

Run `service-manager.bat` for a simple menu to start/stop/restart and view logs.

Or use Windows Services (`services.msc`) — service name: **FUXA**.

## Logs

```
server\_logs\service-stdout.log
server\_logs\service-stderr.log
```

Log files rotate at 5 MB.

## Change port

Edit `install-service.bat`, change `set FUXA_PORT=1881` before installing.

## Uninstall

Right-click `uninstall-service.bat` → **Run as Administrator**
