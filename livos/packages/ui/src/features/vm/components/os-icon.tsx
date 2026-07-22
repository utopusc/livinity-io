// Phase 352-02 (VMAPP-02) — guest-OS → brand-icon map for the VM list.
//
// A flat keyed lookup (the DOCK_ICONS shape from dock-item.tsx), NOT a heavy new
// dependency: every glyph comes from react-icons/si (already installed) with a
// SiLinux fallback for any unmapped Linux distro and a lucide Monitor fallback
// for an unknown kind (e.g. a future custom-image VM). macOS is DELIBERATELY
// absent — no SiApple on any selectable path (Apple EULA, excluded from v49).
//
// VmView only carries `kind` today (windows | linux), so the list passes just
// that; `edition`/`distro` are part of the API for the create-flow (352-03) and
// refine the icon where present without breaking the kind-only call.
import {Monitor} from 'lucide-react'
import type {ComponentType} from 'react'
import {
	SiAlpinelinux,
	SiArchlinux,
	SiCentos,
	SiDebian,
	SiFedora,
	SiGentoo,
	SiKalilinux,
	SiLinux,
	SiLinuxmint,
	SiManjaro,
	SiNixos,
	SiOpensuse,
	SiRockylinux,
	SiSlackware,
	SiUbuntu,
	SiWindows,
	SiWindows10,
	SiWindows11,
	SiZorin,
} from 'react-icons/si'

type IconComponent = ComponentType<{className?: string}>

// Distro key (vm-os-catalog.ts LinuxDistro) → its brand icon. Ubuntu flavours
// share the Ubuntu mark; any distro absent here (alma/cachy/mx/tails/zima) falls
// back to the generic SiLinux below — never a wrong-brand icon.
const DISTRO_ICONS: Record<string, IconComponent> = {
	ubuntu: SiUbuntu,
	ubuntus: SiUbuntu,
	kubuntu: SiUbuntu,
	xubuntu: SiUbuntu,
	debian: SiDebian,
	arch: SiArchlinux,
	alpine: SiAlpinelinux,
	centos: SiCentos,
	fedora: SiFedora,
	mint: SiLinuxmint,
	manjaro: SiManjaro,
	nixos: SiNixos,
	suse: SiOpensuse,
	kali: SiKalilinux,
	rocky: SiRockylinux,
	gentoo: SiGentoo,
	zorin: SiZorin,
	slack: SiSlackware,
}

export function pickIcon(kind: 'windows' | 'linux', edition?: string, distro?: string): IconComponent {
	if (kind === 'windows') {
		if (edition?.startsWith('11')) return SiWindows11
		if (edition?.startsWith('10')) return SiWindows10
		return SiWindows
	}
	if (kind === 'linux') {
		if (distro && DISTRO_ICONS[distro]) return DISTRO_ICONS[distro]
		return SiLinux
	}
	// Unknown/unrepresentable kind — a neutral monitor rather than a Linux/Windows lie.
	return Monitor
}

export function OsIcon({
	kind,
	edition,
	distro,
	className,
}: {
	kind: 'windows' | 'linux'
	edition?: string
	distro?: string
	className?: string
}) {
	const Icon = pickIcon(kind, edition, distro)
	return <Icon className={className} aria-hidden='true' />
}
