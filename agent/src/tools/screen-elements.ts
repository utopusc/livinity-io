/**
 * Screen Elements tool — Windows UI Automation (UIA) accessibility tree.
 *
 * Spawns a persistent PowerShell subprocess that loads System.Windows.Automation
 * and enters a REPL loop. On each query, returns interactive UI elements with
 * center coordinates in logical screen pixels (matching robotjs space).
 *
 * Non-Windows: returns graceful error.
 */

import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';

type ToolResult = {
  success: boolean;
  output: string;
  error?: string;
  data?: unknown;
};

// ── DPI Awareness ──────────────────────────────────────────────────────────

let dpiInitialized = false;

export function initDpiAwareness(): void {
  if (dpiInitialized || process.platform !== 'win32') return;
  dpiInitialized = true;
  try {
    execSync(
      `powershell -NoProfile -Command "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class DpiHelper { [DllImport(\\\"user32.dll\\\")] public static extern IntPtr SetProcessDpiAwarenessContext(IntPtr value); }'; [DpiHelper]::SetProcessDpiAwarenessContext([IntPtr]::new(-4))"`,
      { timeout: 5000, stdio: 'ignore' },
    );
  } catch {
    // Non-fatal — DPI awareness is best-effort
  }
}

// ── PowerShell UIA Subprocess ──────────────────────────────────────────────

const UIA_SCRIPT = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$root = [System.Windows.Automation.AutomationElement]::RootElement

$interactiveTypes = @(
  [System.Windows.Automation.ControlType]::Button,
  [System.Windows.Automation.ControlType]::Edit,
  [System.Windows.Automation.ControlType]::ComboBox,
  [System.Windows.Automation.ControlType]::CheckBox,
  [System.Windows.Automation.ControlType]::RadioButton,
  [System.Windows.Automation.ControlType]::MenuItem,
  [System.Windows.Automation.ControlType]::Hyperlink,
  [System.Windows.Automation.ControlType]::ListItem,
  [System.Windows.Automation.ControlType]::TabItem,
  [System.Windows.Automation.ControlType]::Slider,
  [System.Windows.Automation.ControlType]::Custom
)

function Get-InteractiveElements {
  $elements = @()
  $id = 0
  $fgWin = $null
  try {
    $fgWin = [System.Windows.Automation.AutomationElement]::FocusedElement
    while ($fgWin -ne $null -and $fgWin -ne $root) {
      $parent = [System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($fgWin)
      if ($parent -eq $root) { break }
      $fgWin = $parent
    }
  } catch { $fgWin = $null }

  $windowsToScan = @()
  if ($fgWin -ne $null -and $fgWin -ne $root) {
    $windowsToScan += $fgWin
  }
  $child = $walker.GetFirstChild($root)
  while ($child -ne $null) {
    if ($child -ne $fgWin) { $windowsToScan += $child }
    $child = $walker.GetNextSibling($child)
  }

  foreach ($win in $windowsToScan) {
    if ($id -ge 100) { break }
    $winName = ""
    try { $winName = $win.Current.Name } catch {}
    if ([string]::IsNullOrWhiteSpace($winName)) { $winName = "Unknown" }
    if ($winName.Length -gt 30) { $winName = $winName.Substring(0, 30) }

    $stack = New-Object System.Collections.Stack
    $stack.Push($win)
    while ($stack.Count -gt 0 -and $id -lt 100) {
      $el = $stack.Pop()
      try {
        $ct = $el.Current.ControlType
        $isInteractive = $false
        foreach ($t in $interactiveTypes) { if ($ct.Id -eq $t.Id) { $isInteractive = $true; break } }
        if (-not $isInteractive) {
          $c = $walker.GetFirstChild($el)
          $children = @()
          while ($c -ne $null) { $children += $c; $c = $walker.GetNextSibling($c) }
          for ($i = $children.Count - 1; $i -ge 0; $i--) { $stack.Push($children[$i]) }
          continue
        }

        $name = $el.Current.Name
        if ([string]::IsNullOrWhiteSpace($name)) { continue }
        if (-not $el.Current.IsEnabled) { continue }

        $rect = $el.Current.BoundingRectangle
        if ($rect.Width -le 0 -or $rect.Height -le 0) { continue }
        if ($rect.X -lt -1000 -or $rect.Y -lt -1000) { continue }

        $cx = [math]::Round($rect.X + $rect.Width / 2)
        $cy = [math]::Round($rect.Y + $rect.Height / 2)
        $ctName = $ct.ProgrammaticName -replace 'ControlType.', ''

        $id++
        $elements += "$id|$winName|$ctName|$name|($cx,$cy)"

        $c = $walker.GetFirstChild($el)
        $children = @()
        while ($c -ne $null) { $children += $c; $c = $walker.GetNextSibling($c) }
        for ($i = $children.Count - 1; $i -ge 0; $i--) { $stack.Push($children[$i]) }
      } catch { continue }
    }
  }
  return $elements
}

Write-Output "READY"

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  try {
    $parsed = $line | ConvertFrom-Json
    if ($parsed.action -eq "query") {
      $elements = Get-InteractiveElements
      $fgTitle = ""
      try {
        $fg = [System.Windows.Automation.AutomationElement]::FocusedElement
        while ($fg -ne $null -and $fg -ne $root) {
          $p = [System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($fg)
          if ($p -eq $root) { $fgTitle = $fg.Current.Name; break }
          $fg = $p
        }
      } catch {}
      $result = @{ elements = $elements; window = $fgTitle; count = $elements.Count } | ConvertTo-Json -Compress
      Write-Output $result
    } else {
      Write-Output '{"error":"unknown action"}'
    }
  } catch {
    Write-Output ('{"error":"' + ($_.Exception.Message -replace '"', "'") + '"}')
  }
}
`;

let uiaProcess: ChildProcess | null = null;
let uiaReady = false;
let uiaPending: { resolve: (v: any) => void; reject: (e: any) => void; timer: NodeJS.Timeout } | null = null;

function spawnUiaProcess(): void {
  if (process.platform !== 'win32') return;

  uiaReady = false;
  uiaProcess = spawn('powershell', ['-NoProfile', '-NoLogo', '-Command', '-'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  uiaProcess.stdin!.write(UIA_SCRIPT + '\n');

  let buffer = '';
  uiaProcess.stdout!.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed === 'READY') {
        uiaReady = true;
        continue;
      }

      if (uiaPending) {
        try {
          const parsed = JSON.parse(trimmed);
          clearTimeout(uiaPending.timer);
          uiaPending.resolve(parsed);
        } catch {
          clearTimeout(uiaPending.timer);
          uiaPending.resolve({ error: 'Invalid JSON from UIA subprocess' });
        }
        uiaPending = null;
      }
    }
  });

  uiaProcess.on('exit', () => {
    uiaProcess = null;
    uiaReady = false;
    if (uiaPending) {
      clearTimeout(uiaPending.timer);
      uiaPending.resolve({ error: 'UIA subprocess exited' });
      uiaPending = null;
    }
  });
}

function queryUia(): Promise<any> {
  if (process.platform !== 'win32') {
    return Promise.resolve({ error: `Not available on ${process.platform}` });
  }

  // Auto-restart if crashed
  if (!uiaProcess) {
    spawnUiaProcess();
  }

  // Wait for ready (up to 5s)
  return new Promise((resolve) => {
    const waitForReady = (attempts: number) => {
      if (uiaReady || attempts <= 0) {
        sendUiaQuery(resolve);
      } else {
        setTimeout(() => waitForReady(attempts - 1), 100);
      }
    };
    waitForReady(50);
  });
}

function sendUiaQuery(resolve: (v: any) => void): void {
  if (!uiaProcess || !uiaProcess.stdin) {
    resolve({ error: 'UIA subprocess not available' });
    return;
  }

  const timer = setTimeout(() => {
    if (uiaPending) {
      uiaPending = null;
      resolve({ error: 'UIA query timeout (3s)' });
    }
  }, 3000);

  uiaPending = { resolve, reject: () => {}, timer };
  uiaProcess.stdin.write('{"action":"query"}\n');
}

// ── Screenshot Caching State ───────────────────────────────────────────────

let lastElementHash = '';
let lastScreenshotBase64 = '';
let lastScreenshotOutput = '';
let lastScreenshotData: any = null;

export function getLastElementHash(): string { return lastElementHash; }
export function getScreenshotCache(): { base64: string; output: string; data: any } | null {
  if (lastScreenshotBase64 && lastScreenshotData) {
    return { base64: lastScreenshotBase64, output: lastScreenshotOutput, data: lastScreenshotData };
  }
  return null;
}
export function setScreenshotCache(base64: string, output: string, data: any): void {
  lastScreenshotBase64 = base64;
  lastScreenshotOutput = output;
  lastScreenshotData = data;
}
export { queryUia };

// ── Initialize (call once at startup) ──────────────────────────────────────

export function initScreenElements(): void {
  initDpiAwareness();
  if (process.platform === 'win32') {
    spawnUiaProcess();
  }
}

// ── Tool Implementation ────────────────────────────────────────────────────

const ELEMENT_HEADER = 'id|window|control_type|name|(cx,cy)';

export async function executeScreenElements(
  _params: Record<string, unknown>,
): Promise<ToolResult> {
  const result = await queryUia();

  if (result.error) {
    lastElementHash = '';
    return { success: false, output: '', error: `screen_elements: ${result.error}` };
  }

  const elements = result.elements as string[];
  if (!elements || elements.length === 0) {
    lastElementHash = '';
    return {
      success: true,
      output: 'No interactive elements found on screen.',
      data: { count: 0, window: result.window || '' },
    };
  }

  const text = `${ELEMENT_HEADER}\n${elements.join('\n')}`;

  // Compute hash for screenshot caching (AIP-03)
  lastElementHash = createHash('sha256').update(text).digest('hex');

  return {
    success: true,
    output: `Found ${elements.length} interactive elements in "${result.window || 'Desktop'}". Coordinates are in logical screen pixels. Pass to mouse_click with raw:true to use directly.\n\n${text}`,
    data: { count: elements.length, window: result.window || '' },
  };
}
