// docker/local-uat/uat-driver/lib/tcpdump-check.mjs
// Phase 104 plan 104-07 — assert AC-104-15: hybrid mode page load produces
// ZERO Server5 traffic. Runs tcpdump inside the container, generates a single
// trigger event (page load), then asserts captured packet count == 0.
//
// D-104-RELAY-ZERO-DATA-PLANE invariant proof at runtime, complement to the
// 104-04 static negative-grep assertions on the Caddyfile generator output.
//
// Why spawn + watch stdout rather than read pcap? `tcpdump -c 100` already
// counts packets for us via line-per-packet stdout; reading a pcap requires
// pcap parsing or shelling tcpdump again. Simpler.
//
// No third-party deps — uses only node:child_process + node:timers/promises.
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';

const SERVER5_IP = '45.137.194.102';   // Hard-coded Server5 IP (per memory)

/**
 * Run `tcpdump host SERVER5_IP` inside the container for durationMs, while
 * calling triggerFn() ~1s after tcpdump starts capturing. Returns the
 * captured packet count + raw output for debugging.
 *
 * @param {Object} opts
 * @param {string} opts.containerName  - `docker exec <name>` target
 * @param {number} opts.durationMs     - total capture window (ms)
 * @param {Function} opts.triggerFn    - async function that generates traffic
 *                                       to test (called inside the window)
 * @returns {Promise<{packetCount: number, rawOutput: string, stderr: string}>}
 */
export async function countServer5PacketsDuring(
    {containerName, durationMs, triggerFn},
) {
    // `timeout <s>` inside the container caps tcpdump duration to durationMs.
    // `-c 100` is a safety stop in case packets DO flow (we want fast fail not
    // a flood of output).
    // `--immediate-mode` flushes per-packet so we don't miss bursts that the
    // tcpdump buffer would batch past our duration window.
    const tcpdumpArgs = [
        'exec', containerName,
        'timeout', String(Math.ceil(durationMs / 1000)),
        'tcpdump', '-i', 'any', '-nn', '-c', '100',
        '--immediate-mode',
        'host', SERVER5_IP,
    ];

    return new Promise((resolve, reject) => {
        const proc = spawn('docker', tcpdumpArgs, {
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let captured = '';
        let errors = '';
        proc.stdout.on('data', (d) => { captured += d.toString(); });
        proc.stderr.on('data', (d) => { errors += d.toString(); });

        // Trigger function AFTER tcpdump has started capturing.
        sleep(1000).then(() => {
            triggerFn().catch((e) => {
                errors += `\nTRIGGER ERROR: ${e}`;
            });
        });

        proc.on('close', (code) => {
            // tcpdump exit codes:
            //   0   - natural end (e.g., -c limit hit, or end-of-capture)
            //   124 - GNU `timeout` killed it (expected on full-window run)
            // Anything else means tcpdump itself errored (no cap_net_raw,
            // interface missing, container not privileged, etc.)
            if (code !== 0 && code !== 124) {
                return reject(new Error(
                    `tcpdump exited with code ${code}. stderr:\n${errors}`,
                ));
            }
            // Count captured packets: each tcpdump line starts with a
            // timestamp like "12:34:56.789012". Stderr lines like "X
            // packets captured" are NOT counted (would double-count).
            const lines = captured.split('\n').filter((l) =>
                /^\d{2}:\d{2}:\d{2}\./.test(l),
            );
            resolve({
                packetCount: lines.length,
                rawOutput: captured,
                stderr: errors,
            });
        });
        proc.on('error', (err) => {
            reject(new Error(
                `tcpdump spawn failed: ${err.message}\nstderr:\n${errors}`,
            ));
        });
    });
}
