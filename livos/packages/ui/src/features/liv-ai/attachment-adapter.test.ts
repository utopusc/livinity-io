// @vitest-environment jsdom
//
// Phase 198-06 Task 3 — attachment-adapter.ts tests.
//
// Locks the image-only acceptance contract:
//
//   - image/png within size limit → accepted
//   - image/jpeg / image/webp / image/gif → accepted
//   - text/plain or application/pdf → rejected (PDF deferred to P199)
//   - oversize image (> MAX_IMAGE_SIZE_BYTES) → rejected
//   - attachFile() throws for rejected files
//   - createImageAttachmentAdapter() returns a usable
//     CompositeAttachmentAdapter (smoke check — no AuiProvider needed)

import {describe, expect, it} from 'vitest'

import {
	acceptsFile,
	ACCEPTED_MIME_TYPES,
	attachFile,
	createImageAttachmentAdapter,
	MAX_IMAGE_SIZE_BYTES,
} from './attachment-adapter'

describe('ACCEPTED_MIME_TYPES', () => {
	it('contains exactly the 4 locked image MIME types', () => {
		expect(ACCEPTED_MIME_TYPES.size).toBe(4)
		expect(ACCEPTED_MIME_TYPES.has('image/png')).toBe(true)
		expect(ACCEPTED_MIME_TYPES.has('image/jpeg')).toBe(true)
		expect(ACCEPTED_MIME_TYPES.has('image/webp')).toBe(true)
		expect(ACCEPTED_MIME_TYPES.has('image/gif')).toBe(true)
	})
})

describe('acceptsFile', () => {
	it('accepts image/png within the size limit', () => {
		const file = new File([new Uint8Array(1024)], 'shot.png', {type: 'image/png'})
		expect(acceptsFile(file)).toBe(true)
	})

	it('accepts image/jpeg, image/webp, image/gif', () => {
		for (const type of ['image/jpeg', 'image/webp', 'image/gif']) {
			const f = new File([new Uint8Array(8)], `x.${type.split('/')[1]}`, {type})
			expect(acceptsFile(f)).toBe(true)
		}
	})

	it('rejects text/plain (non-image MIME type)', () => {
		const file = new File(['hello'], 'note.txt', {type: 'text/plain'})
		expect(acceptsFile(file)).toBe(false)
	})

	it('rejects application/pdf (deferred to Phase 199)', () => {
		const file = new File([new Uint8Array(100)], 'doc.pdf', {
			type: 'application/pdf',
		})
		expect(acceptsFile(file)).toBe(false)
	})

	it('rejects empty MIME type (browser failed to sniff)', () => {
		const file = new File([new Uint8Array(8)], 'unknown', {type: ''})
		expect(acceptsFile(file)).toBe(false)
	})

	it('rejects oversize image > MAX_IMAGE_SIZE_BYTES', () => {
		// Need a real File whose .size > 10MB without allocating 10MB of
		// jsdom memory. File.size reads the underlying blob length, so we
		// fabricate a blob with the right reported byte-length by combining
		// many small typed arrays. Cheap enough.
		const chunk = new Uint8Array(1024 * 1024) // 1 MB
		const parts = Array.from({length: 11}, () => chunk) // 11 MB
		const file = new File(parts, 'huge.png', {type: 'image/png'})
		expect(file.size).toBeGreaterThan(MAX_IMAGE_SIZE_BYTES)
		expect(acceptsFile(file)).toBe(false)
	})
})

describe('attachFile', () => {
	it('throws a descriptive error when the file is rejected', async () => {
		const file = new File(['x'], 'note.txt', {type: 'text/plain'})
		await expect(attachFile(file)).rejects.toThrow(/Unsupported file/)
	})
})

describe('createImageAttachmentAdapter', () => {
	it('returns a CompositeAttachmentAdapter instance', () => {
		const adapter = createImageAttachmentAdapter()
		expect(adapter).toBeDefined()
		// CompositeAttachmentAdapter exposes accept + add at minimum. The
		// constructor surface is part of the public @assistant-ui/react API.
		expect(typeof (adapter as {add?: unknown}).add).toBe('function')
	})
})
