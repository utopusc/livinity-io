// docker/local-uat/uat-driver/lib/chrome-cdp.mjs
// Phase 104 plan 104-07 — Chrome DevTools Protocol helpers + container-side
// curl + screenshot helpers. No third-party deps (D-NO-NEW-DEPS); uses Node 22
// globals (fetch, AbortController) and node:child_process only.
//
// Why no npm `puppeteer`/`chromedp`/`ws`? Phase 104 charters a single repo with
// fixed dep surface. The cost-vs-coverage tradeoff: we lose the ability to drive
// arbitrary CDP RPC (Page.captureScreenshot etc.) but we GAIN the ability to
// run this walk against any LivOS container without installing 200MB of
// chromium-related node_modules in the host repo. Trade made consciously per
// 104-07-PLAN.md `<context>` D-NO-NEW-DEPS lock.
//
// Coverage:
//   - AC-104-13: CDP /json/version probe (HTTP only, no WS needed)
//   - AC-104-10 (partial): curlInContainer for cert-chain + HTTP-code assertions
//   - AC-104-7/9:           navigateAndScreenshot via `docker exec google-chrome
//                           --headless --screenshot`; no WS, no driver client
import {exec} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as sleep} from 'node:timers/promises';

const execAsync = promisify(exec);

/**
 * AC-104-13: probe CDP /json/version endpoint.
 * Returns the Chrome version metadata, or throws.
 */
export async function probeCdpVersion(cdpUrl = 'http://localhost:9223') {
    const r = await fetch(`${cdpUrl}/json/version`);
    if (!r.ok) throw new Error(`CDP /json/version: HTTP ${r.status}`);
    return await r.json();
}

/**
 * Quote a shell argv element for single-quote bash. Used to defang
 * docker exec argv before joining with ' '. Internal helper.
 */
function shq(s) {
    return `'${String(s).replace(/'/g, "'\\''")}'`;
}

/**
 * AC-104-9 + AC-104-10: navigate Chrome (inside the container) to a URL and
 * capture a screenshot. Uses container-side `google-chrome --headless` via
 * `docker exec` to avoid implementing a full WS-based CDP client.
 *
 * Returns {exitCode, stdout, stderr, screenshotPath} — screenshotPath is the
 * IN-CONTAINER path; copy out via `docker cp` if needed.
 */
export async function navigateAndScreenshot(
    {containerName, url, outputPath},
) {
    // --headless=new for clean capture; --user-data-dir different from the
    // entrypoint's Chrome so we don't fight over the SingletonLock.
    // --ignore-certificate-errors lets us screenshot the Caddy self-signed
    // cert path; the visual trust assertion is the manual Apple step.
    const argv = [
        'docker', 'exec', containerName,
        'google-chrome',
        '--headless=new',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--user-data-dir=/tmp/uat-walk-chrome',
        '--ignore-certificate-errors',
        `--screenshot=${outputPath}`,
        '--window-size=1280,720',
        '--virtual-time-budget=10000',
        url,
    ];
    const cmd = argv.map(shq).join(' ');

    try {
        const {stdout, stderr} = await execAsync(cmd, {timeout: 30000});
        return {exitCode: 0, stdout, stderr, screenshotPath: outputPath};
    } catch (err) {
        return {
            exitCode: err.code ?? 1,
            stdout: err.stdout ?? '',
            stderr: err.stderr ?? String(err),
            screenshotPath: null,
        };
    }
}

/**
 * AC-104-10 + AC-104-7: probe a URL via curl from inside the container and
 * capture the HTTP response code + any TLS error. Pure container-side — no
 * host DNS dependency.
 *
 * Returns {httpCode, sslResult, errMsg, ok}. httpCode === 0 indicates curl
 * itself errored (connection refused, dns failure, etc.).
 */
export async function curlInContainer(
    {containerName, url, cacertPath = null, extraArgs = []},
) {
    const argv = [
        'docker', 'exec', containerName,
        'curl', '-sSL', '-o', '/dev/null',
        '-w', '%{http_code}\\n%{ssl_verify_result}\\n%{errormsg}',
        '--max-time', '15',
    ];
    if (cacertPath) argv.push('--cacert', cacertPath);
    for (const a of extraArgs) argv.push(a);
    argv.push(url);
    const cmd = argv.map(shq).join(' ');
    try {
        const {stdout} = await execAsync(cmd, {timeout: 20000});
        const [httpCode, sslResult, errMsg] = stdout.split('\n');
        return {
            httpCode: Number(httpCode),
            sslResult: sslResult ?? '',
            errMsg: errMsg ?? '',
            ok: stdout,
        };
    } catch (err) {
        return {
            httpCode: 0,
            sslResult: 'error',
            errMsg: String(err.stderr ?? err),
            ok: '',
        };
    }
}

/**
 * Helper: poll a TCP host:port via curl-inside-container until reachable
 * (or timeout). Used by AC-104-11 reboot-recovery test + AC-104-7 first
 * call (Caddy may need a few seconds to bind 443 after install).
 *
 * Returns the final curl result on success; throws on timeout.
 */
export async function waitForServiceUp(
    {containerName, port = 443, timeoutMs = 60_000},
) {
    const start = Date.now();
    let last = null;
    while (Date.now() - start < timeoutMs) {
        last = await curlInContainer({
            containerName,
            url: `https://localhost:${port}/`,
            extraArgs: ['--insecure', '--max-time', '2'],
        });
        if (last.httpCode > 0) return last;
        await sleep(2000);
    }
    throw new Error(
        `Service did not come up on :${port} within ${timeoutMs}ms (last=${JSON.stringify(last)})`,
    );
}
