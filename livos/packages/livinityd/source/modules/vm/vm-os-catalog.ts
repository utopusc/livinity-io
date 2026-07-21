/**
 * Phase 351 (VMCREATE-01) — VM guest-OS catalog. PURE DATA: zero I/O, no
 * compose/device/cap knowledge (that stays in the 349 vm-template.ts — the
 * single source of image + elevated-set truth). This file only models the
 * SELECTABLE guest-OS surface: the Windows edition (`VERSION` env) + Linux
 * distro (`BOOT` env) enums, their display labels, and sensible per-OS resource
 * defaults, so 352's create UI + the `vm.createOptions` query (plan 03) have a
 * validated, data-driven catalog and the create schema (trpc-router.ts) can
 * reject everything it should by construction.
 *
 * Modeled after `system/gpu.ts`'s narrow-string-literal-union + typed-interface
 * style, and `vm-template.ts`'s "verified against upstream on DATE" provenance
 * discipline. macOS is ABSENT by construction (never a key) — an unlisted
 * VERSION/BOOT value is a zod parse failure downstream, so macOS can never reach
 * the env merge (Apple EULA — excluded from v49).
 *
 * OS/edition selection is an ENVIRONMENT-value concern layered onto the existing
 * 2-kind template (`kind: 'windows' | 'linux'`), NEVER a third VmTemplateKind —
 * the exhaustive `never`-guarded switch in vm-template.ts is the VMSEC-02
 * backstop and stays untouched.
 */

// verified against dockur/windows readme.md, fetched 2026-07-20
// (https://raw.githubusercontent.com/dockur/windows/master/readme.md — "How do I
//  select the Windows version?" VERSION value table). 18 values: 3× Win-11, 3×
//  Win-10, 5× legacy desktop (8.1/7/Vista/XP/2000), 7× Server. NOTE: 351-RESEARCH
//  reported 17 — the live re-fetch adds `2k` (Windows 2000 Professional);
//  encoded here + flagged as a drift in 351-01-SUMMARY.
export type WindowsEdition =
	| '11'
	| '11l'
	| '11e'
	| '10'
	| '10l'
	| '10e'
	| '8e'
	| '7u'
	| 'vu'
	| 'xp'
	| '2k'
	| '2025'
	| '2022'
	| '2019'
	| '2016'
	| '2012'
	| '2008'
	| '2003'

// verified against qemus/qemu readme.md, fetched 2026-07-20
// (https://raw.githubusercontent.com/qemus/qemu/master/readme.md — "How do I
//  select the version of Linux?" BOOT value table). 23 values (count matches
//  351-RESEARCH; the specific names drift from the research doc's illustrative
//  list — live upstream has NO `opensuse` [it is `suse`] and NO `cirros`, and
//  adds alma/cachy/gentoo/kubuntu/manjaro/mx/nixos/slack/tails/xubuntu/zima/zorin;
//  encoded verbatim from the live table + flagged in 351-01-SUMMARY).
export type LinuxDistro =
	| 'alma'
	| 'alpine'
	| 'arch'
	| 'cachy'
	| 'centos'
	| 'debian'
	| 'fedora'
	| 'gentoo'
	| 'kali'
	| 'kubuntu'
	| 'mint'
	| 'manjaro'
	| 'mx'
	| 'nixos'
	| 'suse'
	| 'rocky'
	| 'slack'
	| 'tails'
	| 'ubuntu'
	| 'ubuntus'
	| 'xubuntu'
	| 'zima'
	| 'zorin'

/** Per-OS create-time resource defaults (same units 352's create form uses). */
export interface OsDefaults {
	readonly cpus: number
	readonly ramMiB: number
	readonly diskGiB: number
}

interface OsCatalogEntry {
	readonly label: string
	readonly defaults: OsDefaults
}

// Windows resource defaults — heavier than Linux (dockur/windows README requires
// ≥4 GB RAM / ≥64 GB disk for modern Windows). Legacy desktop editions (XP/2000/
// Vista/2003) are far lighter (0.4–0.6 GB images) and get proportionally smaller
// defaults; the Server family tracks its desktop-era sibling.
const WIN_MODERN: OsDefaults = {cpus: 2, ramMiB: 4096, diskGiB: 64}
const WIN_MID: OsDefaults = {cpus: 2, ramMiB: 2048, diskGiB: 32}
const WIN_LEGACY: OsDefaults = {cpus: 1, ramMiB: 1024, diskGiB: 16}

export const WINDOWS_EDITIONS: Record<WindowsEdition, OsCatalogEntry> = {
	'11': {label: 'Windows 11 Pro', defaults: WIN_MODERN},
	'11l': {label: 'Windows 11 LTSC', defaults: WIN_MODERN},
	'11e': {label: 'Windows 11 Enterprise', defaults: WIN_MODERN},
	'10': {label: 'Windows 10 Pro', defaults: WIN_MODERN},
	'10l': {label: 'Windows 10 LTSC', defaults: WIN_MODERN},
	'10e': {label: 'Windows 10 Enterprise', defaults: WIN_MODERN},
	'8e': {label: 'Windows 8.1 Enterprise', defaults: WIN_MID},
	'7u': {label: 'Windows 7 Ultimate', defaults: WIN_MID},
	vu: {label: 'Windows Vista Ultimate', defaults: WIN_MID},
	xp: {label: 'Windows XP Professional', defaults: WIN_LEGACY},
	'2k': {label: 'Windows 2000 Professional', defaults: WIN_LEGACY},
	'2025': {label: 'Windows Server 2025', defaults: WIN_MODERN},
	'2022': {label: 'Windows Server 2022', defaults: WIN_MODERN},
	'2019': {label: 'Windows Server 2019', defaults: WIN_MODERN},
	'2016': {label: 'Windows Server 2016', defaults: WIN_MODERN},
	'2012': {label: 'Windows Server 2012', defaults: WIN_MID},
	'2008': {label: 'Windows Server 2008', defaults: WIN_MID},
	'2003': {label: 'Windows Server 2003', defaults: WIN_LEGACY},
}

// Linux resource defaults. 351-RESEARCH A3: the 349 LINUX_VM_TEMPLATE ships a
// deliberately lighter 16 GiB disk default (vs upstream qemus' 64 GiB) as the
// general-purpose LivOS Linux default — KEEP that intentional choice. Alpine is
// tiny (60 MB image) so it gets a leaner RAM default; everything else uses the
// same 2 GiB / 2 cpu / 16 GiB baseline the template already established.
const LINUX_DEFAULT: OsDefaults = {cpus: 2, ramMiB: 2048, diskGiB: 16}
const LINUX_LIGHT: OsDefaults = {cpus: 1, ramMiB: 1024, diskGiB: 16}

export const LINUX_DISTROS: Record<LinuxDistro, OsCatalogEntry> = {
	alma: {label: 'AlmaLinux', defaults: LINUX_DEFAULT},
	alpine: {label: 'Alpine Linux', defaults: LINUX_LIGHT},
	arch: {label: 'Arch Linux', defaults: LINUX_DEFAULT},
	cachy: {label: 'CachyOS', defaults: LINUX_DEFAULT},
	centos: {label: 'CentOS', defaults: LINUX_DEFAULT},
	debian: {label: 'Debian', defaults: LINUX_DEFAULT},
	fedora: {label: 'Fedora', defaults: LINUX_DEFAULT},
	gentoo: {label: 'Gentoo', defaults: LINUX_DEFAULT},
	kali: {label: 'Kali Linux', defaults: LINUX_DEFAULT},
	kubuntu: {label: 'Kubuntu', defaults: LINUX_DEFAULT},
	mint: {label: 'Linux Mint', defaults: LINUX_DEFAULT},
	manjaro: {label: 'Manjaro', defaults: LINUX_DEFAULT},
	mx: {label: 'MX Linux', defaults: LINUX_DEFAULT},
	nixos: {label: 'NixOS', defaults: LINUX_DEFAULT},
	suse: {label: 'openSUSE', defaults: LINUX_DEFAULT},
	rocky: {label: 'Rocky Linux', defaults: LINUX_DEFAULT},
	slack: {label: 'Slackware', defaults: LINUX_DEFAULT},
	tails: {label: 'Tails', defaults: LINUX_DEFAULT},
	ubuntu: {label: 'Ubuntu Desktop', defaults: LINUX_DEFAULT},
	ubuntus: {label: 'Ubuntu Server', defaults: LINUX_DEFAULT},
	xubuntu: {label: 'Xubuntu', defaults: LINUX_DEFAULT},
	zima: {label: 'ZimaOS', defaults: LINUX_DEFAULT},
	zorin: {label: 'Zorin OS', defaults: LINUX_DEFAULT},
}

/**
 * Phase 351 (VMCREATE-01 gap closure): the local custom-image file extensions
 * qemus/qemu accepts as a DIRECT bind-mount (`/boot.<ext>`). Verified against
 * qemus/qemu-docker `src/install.sh` `findBootFile()` (fetched 2026-07-20): it
 * scans EXACTLY `/boot.img`, `/boot.raw`, `/boot.iso`, `/boot.qcow2` (plus
 * `/custom.iso` for dockur compat). NOTE: `vmdk`/`vhd`/`vhdx`/`vdi` are
 * recognized ONLY on the URL-download + archive-extraction path (`findArchiveImage`),
 * NEVER as a local bind target — so they are DELIBERATELY EXCLUDED here to avoid
 * shipping a bind qemus would silently ignore (the "silently wrong, not loudly
 * broken" pitfall class). URL custom images keep their broader upstream format
 * support; a LOCAL file must be one qemus can actually boot from a bind.
 */
export const LOCAL_IMAGE_EXTENSIONS = ['iso', 'img', 'raw', 'qcow2'] as const
export type LocalImageExtension = (typeof LOCAL_IMAGE_EXTENSIONS)[number]

/** Tuple of every Windows edition key (for `z.enum(...)` at the schema boundary). */
export const WINDOWS_EDITION_KEYS = Object.keys(WINDOWS_EDITIONS) as [WindowsEdition, ...WindowsEdition[]]

/** Tuple of every Linux distro key (for `z.enum(...)` at the schema boundary). */
export const LINUX_DISTRO_KEYS = Object.keys(LINUX_DISTROS) as [LinuxDistro, ...LinuxDistro[]]

// The catalog is the ONE OS-metadata surface plan 03 reads — re-export the
// single-sourced BYO-license notice so callers never reach past it into the
// template (the drift-guard test asserts it stays a substring of the description).
export {WINDOWS_BYO_LICENSE_NOTICE} from './vm-template.js'
