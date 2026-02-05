import nodePath from 'node:path'
import crypto from 'node:crypto'

import {expect, test, beforeEach, beforeAll, afterAll} from 'vitest'
import fse from 'fs-extra'
import {$} from 'execa'

import createTestLivinityd from '../test-utilities/create-test-livinityd.js'

// Create a new livinityd instance for each test
let livinityd: Awaited<ReturnType<typeof createTestLivinityd>>
beforeAll(async () => {
	livinityd = await createTestLivinityd()
	await livinityd.registerAndLogin()
})

afterAll(async () => {
	await livinityd.cleanup()
})

beforeEach(async () => {
	// Clean up thumbnails directory
	await fse.emptyDir(`${livinityd.instance.dataDirectory}/thumbnails`)
})

test('GET /api/files/thumbnail/:thumbnail throws unauthorized error without cookie', async () => {
	const error = await livinityd.unauthenticatedApi.get('files/thumbnail/12345.webp').catch((error) => error)
	expect(error).toBeInstanceOf(Error)
	expect(error.response.statusCode).toBe(401)
	expect(error.response.body).toMatchObject({error: 'unauthorized'})
})

test('GET /api/files/thumbnail/:thumbnail throws 404 error without a thumbnail path', async () => {
	const error = await livinityd.api.get('files/thumbnail/').catch((error) => error)
	expect(error).toBeInstanceOf(Error)
	expect(error.response.statusCode).toBe(404)
})

test('GET /api/files/thumbnail/:thumbnail throws 404 error when thumbnail does not exist', async () => {
	// Generate a valid sha256 hash that doesn't exist in the system
	const validHash = crypto.createHash('sha256').update('nonexistent-file').digest('hex')
	const error = await livinityd.api.get(`files/thumbnail/${validHash}.webp`).catch((error) => error)
	expect(error).toBeInstanceOf(Error)
	// When using express.static, we get a 404 HTML page
	expect(error.response.statusCode).toBe(404)
})

test('GET /api/files/thumbnail/:thumbnail serves a thumbnail with valid hash and correct cache headers', async () => {
	// Create a mock thumbnail file with a valid hex hash
	const hash = crypto.createHash('sha256').update('test-thumbnail-data').digest('hex')
	const thumbnailDir = `${livinityd.instance.dataDirectory}/thumbnails`
	const thumbnailPath = nodePath.join(thumbnailDir, `${hash}.webp`)

	// Create a simple image file (1x1 pixel webp)
	// const thumbnailData = Buffer.from('RIFF\x1A\0\0\0WEBPVP8 \x0E\0\0\0\x10\0\0\0\0\0\0\0', 'binary')
	// await fse.writeFile(thumbnailPath, thumbnailData)

	// Create a small test webp image with ImageMagick
	await $`convert -size 1x1 canvas:red ${thumbnailPath}`

	// Verify the thumbnail file was created
	expect(await fse.pathExists(thumbnailPath)).toBe(true)

	// Request the thumbnail through the API
	// Use responseType: 'buffer' to override the default behaviour and get binary data instead of trying to parse as JSON
	// This allows us to compare the response body to the original thumbnail file
	const response = await livinityd.api.get(`files/thumbnail/${hash}.webp`, {responseType: 'buffer'})

	// Assert the response is correct
	expect(response.statusCode).toBe(200)

	// Check that we get cache headers
	expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable')

	// Check content type header is for webp images
	expect(response.headers['content-type']).toBe('image/webp')

	// Check that we got some binary data
	expect(response.body.length).toBeGreaterThan(0)

	// Verify that the response body is the same as the original thumbnail file
	const originalThumbnailData = await fse.readFile(thumbnailPath)
	const responseThumbnailData = response.body
	expect(originalThumbnailData).toEqual(responseThumbnailData)
})
