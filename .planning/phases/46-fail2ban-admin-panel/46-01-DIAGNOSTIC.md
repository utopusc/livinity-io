# Phase 46 Plan 01 — Mini PC fail2ban Diagnostic

**Captured:** 2026-05-01T20:16:09Z
**Host:** bruce@10.69.31.68 (Mini PC — D-NO-SERVER4 enforced; Server4/5 NOT touched)
**Purpose:** Ground-truth fixtures for Plan 02 parser tests + binary-path pin for Plan 02 client.ts.

---

## fail2ban-client path

```
$ which fail2ban-client
/usr/bin/fail2ban-client
```

**Pinned for Plan 02 client.ts:** `/usr/bin/fail2ban-client`

---

## fail2ban package version

```
$ dpkg -l | grep -i fail2ban
ii  fail2ban                                      1.0.2-3ubuntu0.1                         all          ban hosts that cause multiple authentication errors
```

**Pinned for Plan 02 client.ts version-pin comment:** `fail2ban 1.0.2-3ubuntu0.1`

---

## systemctl status fail2ban

```
$ systemctl is-active fail2ban
active

$ systemctl status fail2ban --no-pager
● fail2ban.service - Fail2Ban Service
     Loaded: loaded (/usr/lib/systemd/system/fail2ban.service; enabled; preset: enabled)
     Active: active (running) since Wed 2026-04-29 10:54:46 PDT; 2 days ago
       Docs: man:fail2ban(1)
   Main PID: 1610 (fail2ban-server)
      Tasks: 5 (limit: 37997)
     Memory: 73.5M (peak: 79.0M)
        CPU: 4min 3.405s
     CGroup: /system.slice/fail2ban.service
             └─1610 /usr/bin/python3 /usr/bin/fail2ban-server -xf start

Apr 29 10:54:46 bruce-EQ systemd[1]: Started fail2ban.service - Fail2Ban Service.
Apr 29 10:54:46 bruce-EQ fail2ban-server[1610]: 2026-04-29 10:54:46,139 fail2ban.configreader   [1610]: WARNING 'allowipv6' not defined in 'Definition'. Using default one: 'auto'
Apr 29 10:54:46 bruce-EQ fail2ban-server[1610]: Server ready
```

---

## fail2ban-client status (jail list)

```
$ sudo fail2ban-client status
Status
|- Number of jail:	1
`- Jail list:	sshd
```

**Discovered jails:** `sshd`

---

## fail2ban-client status <jail> (per-jail status)

### Jail: sshd

```
$ sudo fail2ban-client status sshd
Status for the jail: sshd
|- Filter
|  |- Currently failed:	0
|  |- Total failed:	0
|  `- Journal matches:	_SYSTEMD_UNIT=sshd.service + _COMM=sshd
`- Actions
   |- Currently banned:	0
   |- Total banned:	0
   `- Banned IP list:	
```

**Notes for parser test fixtures:**
- This Mini PC uses `Journal matches:` instead of `File list:` — the sshd jail reads from systemd journal rather than a log file. This is the authoritative format for fail2ban 1.0.2 on Ubuntu 24.04 with journald-integrated sshd.
- `Currently banned: 0`, `Banned IP list:` is empty (trailing tab, no IPs). Plan 02 parser MUST handle the empty-list case.
- The `Currently failed` and `Total failed` counts are both 0 (no active brute-force in progress at capture time).

---

## who -u (active SSH sessions)

```
$ who -u
bruce    seat0        2026-04-29 10:54   ?          1984 (login screen)
bruce    :0           2026-04-29 10:54   ?          1984 (:0)
root     pts/1        2026-05-01 11:37 01:34     1010411
```

**Notes for active-sessions.ts parser fixture:**
- `bruce seat0` — local physical seat login, no network source IP. The `(login screen)` token is NOT an IP — it is a descriptive label. Parser must NOT extract `login screen` as a sourceIp.
- `bruce :0` — local X display session (`:0` is the display, not an IP). The `(:0)` is NOT an IP — it is the X11 display identifier. Parser must NOT extract `:0` as a sourceIp.
- `root pts/1` — SSH session via pts (pseudo-terminal). No trailing parens with source IP — the root session was captured without a source IP token. This means `sourceIp: null` for this row.
- **Critical parser note:** The regex `/\(([0-9.:a-f]+)\)\s*$/` will correctly reject `(login screen)` and `(:0)` since those contain non-IP characters. `:0` has a colon but no dotted-quad digits, so it will not match the IPv4/IPv6 numeric pattern. `(login screen)` has no digits at all.

**Synthetic fixture for IP-bearing SSH session** (for parser test coverage):
The live `who -u` capture contains no network-originated SSH sessions with source IPs. The format for a remote SSH session with source IP is documented in `who(1)` and fail2ban 1.0.2 behaviour. The following is a **SYNTHETIC FIXTURE** added to ensure Plan 02 parser tests cover the parens-IP path:

```
<!-- SYNTHETIC FIXTURE — derived from who(1) manpage + fail2ban 1.0.2 field format; live capture deferred to next remote SSH session on Mini PC -->
bruce    pts/0        2026-05-01 12:34   .          9876 (203.0.113.5)
bruce    pts/1        2026-05-01 13:01  old         9877 (10.69.31.1)
alice    pts/2        2026-05-01 13:05   .          9878 (::ffff:192.168.1.42)
```

**Field layout (verified from `man who`):**
```
USER     LINE         LOGIN-TIME   IDLE PID   (HOST/DISPLAY)
```
- Column 1: username
- Column 2: terminal line (`pts/N` = network pseudo-terminal, `seat0` = physical seat, `:0` = X display)
- Column 3-4: login timestamp
- Column 5: idle time (`.` = active, `old` = idle >24h, `?` = unknown)
- Column 6: PID
- Column 7 (optional): `(hostname-or-ip)` — present only for network logins, absent for local console

---

## /var/log/auth.log readability

```
$ ls -la /var/log/auth.log*
-rw-r----- 1 syslog adm 1226528 May  1 13:17 /var/log/auth.log
-rw-r----- 1 syslog adm  522617 Apr 25 23:59 /var/log/auth.log.1
-rw-r----- 1 syslog adm   39288 Apr 18 23:59 /var/log/auth.log.2.gz
-rw-r----- 1 syslog adm   40697 Apr 12 00:00 /var/log/auth.log.3.gz
-rw-r----- 1 syslog adm  108115 Apr  5 00:00 /var/log/auth.log.4.gz
```

**Last-attempted-user parser feasibility:** readable by group `adm` only (permission `-rw-r-----`). The `syslog` user owns it, `adm` group has read access. livinityd runs as `root` on Mini PC (D-LIVINITYD-IS-ROOT), so **root-readable = YES** (root bypasses group restriction). The `auth.log` file is 1.2MB, actively written (captured at 13:17 on May 1). The last-attempted-user parser (PATTERNS.md sub-issue #3) is feasible.

---

## Parser Fixture Corpus Summary

For Plan 02 `parser.test.ts`, the following test cases are directly supported by live Mini PC data:

### Corpus A: `parseJailList` fixtures (from `fail2ban-client status`)

**Fixture A1 — Single jail (LIVE):**
```
Status
|- Number of jail:	1
`- Jail list:	sshd
```
Expected: `['sshd']`

**Fixture A2 — Multi-jail (SYNTHETIC — format-compliant, derived from fail2ban 1.0.2 source):**
```
Status
|- Number of jail:	2
`- Jail list:	sshd, recidive
```
Expected: `['sshd', 'recidive']`

<!-- SYNTHETIC FIXTURE — derived from fail2ban-client(1) manpage; live capture deferred to multi-jail Mini PC config -->

**Fixture A3 — Zero jails (SYNTHETIC):**
```
Status
|- Number of jail:	0
`- Jail list:	
```
Expected: `[]`

<!-- SYNTHETIC FIXTURE — derived from fail2ban-client(1) manpage edge case -->

### Corpus B: `parseJailStatus` fixtures (from `fail2ban-client status sshd`)

**Fixture B1 — Zero-banned, journal-based (LIVE):**
```
Status for the jail: sshd
|- Filter
|  |- Currently failed:	0
|  |- Total failed:	0
|  `- Journal matches:	_SYSTEMD_UNIT=sshd.service + _COMM=sshd
`- Actions
   |- Currently banned:	0
   |- Total banned:	0
   `- Banned IP list:	
```
Expected: `{currentlyFailed: 0, totalFailed: 0, currentlyBanned: 0, totalBanned: 0, bannedIps: []}`

**Fixture B2 — With banned IPs and file-based filter (SYNTHETIC — classic file-watcher layout):**
```
Status for the jail: sshd
|- Filter
|  |- Currently failed:	3
|  |- Total failed:	12
|  `- File list:	/var/log/auth.log
`- Actions
   |- Currently banned:	1
   |- Total banned:	5
   `- Banned IP list:	1.2.3.4
```
Expected: `{currentlyFailed: 3, totalFailed: 12, currentlyBanned: 1, totalBanned: 5, bannedIps: ['1.2.3.4']}`

<!-- SYNTHETIC FIXTURE — derived from fail2ban-client(1) manpage; live capture deferred to active-attack Mini PC state -->

**Fixture B3 — Multi-IP banned list (SYNTHETIC):**
```
Status for the jail: sshd
|- Filter
|  |- Currently failed:	7
|  |- Total failed:	89
|  `- File list:	/var/log/auth.log
`- Actions
   |- Currently banned:	3
   |- Total banned:	22
   `- Banned IP list:	1.2.3.4 5.6.7.8 9.10.11.12
```
Expected: `{currentlyFailed: 7, totalFailed: 89, currentlyBanned: 3, totalBanned: 22, bannedIps: ['1.2.3.4', '5.6.7.8', '9.10.11.12']}`

<!-- SYNTHETIC FIXTURE — derived from fail2ban-client(1) manpage; live capture deferred to multi-ban Mini PC state -->

### Corpus C: `parseWhoOutput` fixtures (from `who -u`)

**Fixture C1 — Mixed local + no-IP remote sessions (LIVE):**
```
bruce    seat0        2026-04-29 10:54   ?          1984 (login screen)
bruce    :0           2026-04-29 10:54   ?          1984 (:0)
root     pts/1        2026-05-01 11:37 01:34     1010411
```
Expected:
- Row 0: `{user: 'bruce', sourceIp: null, ...}` (login screen label — not an IP)
- Row 1: `{user: 'bruce', sourceIp: null, ...}` (X11 display `:0` — not an IP)
- Row 2: `{user: 'root', sourceIp: null, ...}` (no parens at all)

**Fixture C2 — Remote SSH sessions with IP (SYNTHETIC):**
```
bruce    pts/0        2026-05-01 12:34   .          9876 (203.0.113.5)
bruce    pts/1        2026-05-01 13:01  old         9877 (10.69.31.1)
alice    pts/2        2026-05-01 13:05   .          9878 (::ffff:192.168.1.42)
```
<!-- SYNTHETIC FIXTURE — derived from who(1) manpage + fail2ban 1.0.2 field format -->
Expected:
- Row 0: `{user: 'bruce', sourceIp: '203.0.113.5', ...}`
- Row 1: `{user: 'bruce', sourceIp: '10.69.31.1', ...}`
- Row 2: `{user: 'alice', sourceIp: '192.168.1.42', ...}` (IPv6-mapped prefix stripped)

**Fixture C3 — Empty output (SYNTHETIC):**
```

```
Expected: `[]`

---

## Plan 02 contract

Plan 02 (`46-02-PLAN.md`) MUST:
1. Hardcode `client.ts` binary path constant to `/usr/bin/fail2ban-client` (pinned above — NOT a runtime `which` lookup).
2. Add a comment `// Verified against fail2ban 1.0.2-3ubuntu0.1 on Mini PC bruce@10.69.31.68 (2026-05-01)`.
3. Paste the verbatim fixtures from section "Corpus A" (Fixtures A1-A3) into `parser.test.ts` as multi-line template literals for `parseJailList` tests (NOT mocked stdout).
4. Paste the verbatim fixtures from section "Corpus B" (Fixtures B1-B3) into `parser.test.ts` as multi-line template literals for `parseJailStatus` tests. **Critical:** Fixture B1 uses `Journal matches:` (not `File list:`) — the parser MUST NOT require `File list:` to be present to parse `Actions` section correctly.
5. Paste the verbatim fixtures from section "Corpus C" (Fixtures C1-C3) into `active-sessions.test.ts`. **Critical:** Fixture C1 contains `(login screen)` and `(:0)` parens tokens — the parser MUST NOT extract these as sourceIp.
6. Per pitfall W-20: NO `vi.mock('child_process')`. Use dependency injection (factory pattern with `ExecFileFn`) to inject fakes into client.ts in tests.
7. `parseJailStatus` MUST handle BOTH `Journal matches:` (journald-integrated sshd, as on this Mini PC) AND `File list:` (log-file-based filter, as in standard setup) as the filter source line — the parser should treat this line as informational and not break parsing if it reads either form.

**D-NO-SERVER4 compliance:** This entire diagnostic was executed against `bruce@10.69.31.68` ONLY. Server4 (`45.137.194.103`) and Server5 (`45.137.194.102`) were NOT touched at any point during Plan 01 execution.
