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
		// Phase 367 (VMENC-03) — RFB input events (vncclient.js :789 / :817). sendKeyEvent
		// writeUInt32BE's the keysym; sendPointerEvent writeUInt16BE's x/y and rebuilds the
		// button mask from the 8 booleans (b1=left … b4=scroll-up, b5=scroll-down).
		sendKeyEvent(key: number, down?: boolean): void
		sendPointerEvent(
			x: number,
			y: number,
			button1?: boolean,
			button2?: boolean,
			button3?: boolean,
			button4?: boolean,
			button5?: boolean,
			button6?: boolean,
			button7?: boolean,
			button8?: boolean,
		): void
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		on(event: string, listener: (...args: any[]) => void): this
	}
	export = VncClient
}
