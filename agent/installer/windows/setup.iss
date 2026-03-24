; Livinity Agent — Inno Setup 6 Installer Script
; Produces LivinityAgentSetup.exe from the SEA binary and native dependencies
;
; Build: iscc installer\windows\setup.iss  (from agent/ root)
; Or:    npm run build:installer:win       (runs build-sea.mjs first)

#define MyAppName "Livinity Agent"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "Livinity"
#define MyAppURL "https://livinity.io"
#define MyAppExeName "livinity-agent.exe"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
DefaultDirName={autopf}\Livinity Agent
DefaultGroupName=Livinity
OutputDir=..\..\dist\installer
OutputBaseFilename=LivinityAgentSetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName={#MyAppName}
DisableProgramGroupPage=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Files]
; Main SEA binary
Source: "..\..\dist\livinity-agent.exe"; DestDir: "{app}"; Flags: ignoreversion

; systray2 traybin — Go binary for system tray (bundled JS, but needs Go binary alongside .exe)
Source: "..\..\dist\traybin\*"; DestDir: "{app}\traybin"; Flags: ignoreversion recursesubdirs createallsubdirs

; node-screenshots — JS wrapper + index (external from bundle, loaded via require)
Source: "..\..\dist\node_modules\node-screenshots\*"; DestDir: "{app}\node_modules\node-screenshots"; Flags: ignoreversion recursesubdirs createallsubdirs

; node-screenshots — Windows x64 native binary (.node addon)
Source: "..\..\dist\node_modules\node-screenshots-win32-x64-msvc\*"; DestDir: "{app}\node_modules\node-screenshots-win32-x64-msvc"; Flags: ignoreversion recursesubdirs createallsubdirs

; setup-ui — web-based setup wizard assets
Source: "..\..\dist\setup-ui\*"; DestDir: "{app}\setup-ui"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
; Start Menu shortcut
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Parameters: "start"
; Start Menu uninstall shortcut
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
; Optional Desktop shortcut
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Parameters: "start"; Tasks: desktopicon

[Registry]
; Auto-start on boot — runs agent with --background flag for silent operation
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "LivinityAgent"; ValueData: """{app}\{#MyAppExeName}"" start --background"; Flags: uninsdeletevalue

[Run]
; Post-install: launch the agent
Filename: "{app}\{#MyAppExeName}"; Parameters: "start"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Stop the running agent before removing files
Filename: "{app}\{#MyAppExeName}"; Parameters: "stop"; Flags: runhidden waituntilterminated

[UninstallDelete]
; Clean up PID file
Type: files; Name: "{userappdata}\.livinity\agent.pid"
; Clean up state file
Type: files; Name: "{userappdata}\.livinity\state.json"
; Clean up log file
Type: files; Name: "{userappdata}\.livinity\agent.log"

[Code]
// --- Optional credential removal during uninstall ---
// Asks the user whether to remove ~/.livinity/ (credentials, config) on uninstall.
// If user confirms, recursively deletes {userprofile}\.livinity\

var ShouldRemoveCredentials: Boolean;

function InitializeUninstall(): Boolean;
begin
  Result := True;
  ShouldRemoveCredentials := False;

  if MsgBox('Do you also want to remove your Livinity credentials and configuration?' + #13#10 +
            '(Located in ' + ExpandConstant('{userprofile}') + '\.livinity\)' + #13#10 + #13#10 +
            'Click Yes to remove everything, or No to keep credentials for future use.',
            mbConfirmation, MB_YESNO) = IDYES then
  begin
    ShouldRemoveCredentials := True;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  LivinityDir: String;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    if ShouldRemoveCredentials then
    begin
      LivinityDir := ExpandConstant('{userprofile}') + '\.livinity';
      if DirExists(LivinityDir) then
      begin
        DelTree(LivinityDir, True, True, True);
        Log('Removed credentials directory: ' + LivinityDir);
      end;
    end;
  end;
end;
