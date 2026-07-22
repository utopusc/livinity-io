/**
 * Phase 364 (VMENC-01) — ambient typings for `vnc-rfb-client`.
 *
 * The package ships pure untyped CommonJS (`module.exports = VncClient`, no bundled .d.ts).
 * This is a STANDALONE ambient module declaration (this file is a SCRIPT — no top-level
 * import/export — so it declares, rather than augments, the module and can override the
 * untyped JS resolution without TS2665). It types ONLY the subset VmVncFrameSource uses;
 * the full RFC 6143 surface is intentionally not modeled. `Buffer` is the Node global.
 */
declare module 'vnc-rfb-client' {
	interface VncClientInitOptions {
		debug?: boolean
		fps?: number
		encodings?: number[]
		debugLevel?: number
	}
	interface VncClientConnectOptions {
		host?: string
		port?: number
		password?: string
		set8BitColor?: boolean
	}
	class VncClient {
		static readonly consts: {encodings: Record<string, number>; [key: string]: unknown}
		clientWidth: number
		clientHeight: number
		fb: Buffer | null
		constructor(options?: VncClientInitOptions)
		connect(options: VncClientConnectOptions): void
		disconnect(): void
		getFb(): Buffer | null
		changeFps(fps: number): void
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		on(event: string, listener: (...args: any[]) => void): this
	}
	export = VncClient
}
