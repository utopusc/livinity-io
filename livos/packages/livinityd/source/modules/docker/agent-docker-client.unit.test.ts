// Phase 22 MH-04 — AgentDockerClient unit tests.
//
// Mocks ./agent-registry.js so the test asserts the precise method/args
// each AgentDockerClient call sends, without needing real WS / dockerode.

import {beforeEach, describe, expect, test, vi} from 'vitest'

vi.mock('./agent-registry.js', () => {
	const sendRequest = vi.fn()
	return {
		agentRegistry: {sendRequest},
		__mocked: {sendRequest},
	}
})

import {agentRegistry} from './agent-registry.js'
import {AgentDockerClient} from './agent-docker-client.js'

const sendRequest = vi.mocked(agentRegistry.sendRequest)
const AGENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

beforeEach(() => {
	sendRequest.mockReset()
})

describe('AgentDockerClient — top-level methods', () => {
	test('listContainers passes opts through', async () => {
		sendRequest.mockResolvedValue([])
		const client = new AgentDockerClient(AGENT_ID)
		await client.listContainers({all: true})

		expect(sendRequest).toHaveBeenCalledWith(AGENT_ID, 'listContainers', [{all: true}])
	})

	test('listImages / listVolumes / listNetworks / info / version / pruneImages map to their method names', async () => {
		sendRequest.mockResolvedValue(undefined)
		const client = new AgentDockerClient(AGENT_ID)

		await client.listImages({})
		await client.listVolumes()
		await client.listNetworks()
		await client.info()
		await client.version()
		await client.pruneImages()

		const methods = sendRequest.mock.calls.map((c) => c[1])
		expect(methods).toEqual([
			'listImages',
			'listVolumes',
			'listNetworks',
			'info',
			'version',
			'pruneImages',
		])
	})

	test('createVolume passes opts through', async () => {
		sendRequest.mockResolvedValue({success: true})
		const client = new AgentDockerClient(AGENT_ID)
		await client.createVolume({Name: 'v1'})

		expect(sendRequest).toHaveBeenCalledWith(AGENT_ID, 'createVolume', [{Name: 'v1'}])
	})
})

describe('AgentDockerClient — container handles', () => {
	test('getContainer(id).start() issues container.start with id', async () => {
		sendRequest.mockResolvedValue({success: true})
		const client = new AgentDockerClient(AGENT_ID)
		await client.getContainer('c1').start()

		expect(sendRequest).toHaveBeenCalledWith(AGENT_ID, 'container.start', ['c1', undefined])
	})

	test('getContainer(id).stop / restart / kill / pause / unpause map to their method names', async () => {
		sendRequest.mockResolvedValue({success: true})
		const client = new AgentDockerClient(AGENT_ID)
		const c = client.getContainer('c1')

		await c.stop()
		await c.restart()
		await c.kill()
		await c.pause()
		await c.unpause()

		const methods = sendRequest.mock.calls.map((c) => c[1])
		expect(methods).toEqual([
			'container.stop',
			'container.restart',
			'container.kill',
			'container.pause',
			'container.unpause',
		])
	})

	test('container.remove passes opts (e.g. {force: true})', async () => {
		sendRequest.mockResolvedValue({success: true})
		const client = new AgentDockerClient(AGENT_ID)
		await client.getContainer('c1').remove({force: true})

		expect(sendRequest).toHaveBeenCalledWith(AGENT_ID, 'container.remove', [
			'c1',
			{force: true},
		])
	})

	test('container.inspect issues inspect with id', async () => {
		sendRequest.mockResolvedValue({Id: 'c1', State: {Status: 'running'}})
		const client = new AgentDockerClient(AGENT_ID)
		await client.getContainer('c1').inspect()

		expect(sendRequest).toHaveBeenCalledWith(AGENT_ID, 'container.inspect', ['c1'])
	})

	test('container.stats with stream:true throws [agent-streaming-unsupported]', () => {
		const client = new AgentDockerClient(AGENT_ID)
		expect(() => client.getContainer('c1').stats({stream: true})).toThrow(
			/\[agent-streaming-unsupported\]/,
		)
	})

	test('container.stats without stream issues stats({stream:false})', async () => {
		sendRequest.mockResolvedValue({cpu_stats: {}})
		const client = new AgentDockerClient(AGENT_ID)
		await client.getContainer('c1').stats()

		expect(sendRequest).toHaveBeenCalledWith(AGENT_ID, 'container.stats', [
			'c1',
			{stream: false},
		])
	})

	test('container.logs with follow:true throws [agent-streaming-unsupported]', async () => {
		const client = new AgentDockerClient(AGENT_ID)
		await expect(client.getContainer('c1').logs({follow: true})).rejects.toThrow(
			/\[agent-streaming-unsupported\]/,
		)
	})

	test('container.logs without follow base64-decodes the response into a Buffer', async () => {
		// Agent encodes the buffer as base64 over JSON; client decodes back to Buffer
		const original = Buffer.from('hello\n')
		const b64 = original.toString('base64')
		sendRequest.mockResolvedValue(b64)

		const client = new AgentDockerClient(AGENT_ID)
		const result = await client.getContainer('c1').logs({tail: 100})

		expect(Buffer.isBuffer(result)).toBe(true)
		expect((result as Buffer).toString('utf-8')).toBe('hello\n')
	})

	test('container.exec / putArchive / getArchive / attach all throw [agent-streaming-unsupported]', () => {
		const client = new AgentDockerClient(AGENT_ID)
		const c = client.getContainer('c1')
		expect(() => c.exec()).toThrow(/\[agent-streaming-unsupported\]/)
		expect(() => c.putArchive()).toThrow(/\[agent-streaming-unsupported\]/)
		expect(() => c.getArchive()).toThrow(/\[agent-streaming-unsupported\]/)
		expect(() => c.attach()).toThrow(/\[agent-streaming-unsupported\]/)
	})
})

describe('AgentDockerClient — image / network / volume handles', () => {
	test('getImage(id).tag / remove / history map correctly', async () => {
		sendRequest.mockResolvedValue(undefined)
		const client = new AgentDockerClient(AGENT_ID)
		const img = client.getImage('img1')

		await img.tag({repo: 'r', tag: 't'})
		await img.remove({force: true})
		await img.history()

		expect(sendRequest.mock.calls.map((c) => c[1])).toEqual([
			'image.tag',
			'image.remove',
			'image.history',
		])
	})

	test('getNetwork(id).inspect / remove / disconnect map correctly', async () => {
		sendRequest.mockResolvedValue(undefined)
		const client = new AgentDockerClient(AGENT_ID)
		const net = client.getNetwork('n1')

		await net.inspect()
		await net.remove()
		await net.disconnect({Container: 'c1'})

		expect(sendRequest.mock.calls.map((c) => c[1])).toEqual([
			'network.inspect',
			'network.remove',
			'network.disconnect',
		])
	})

	test('getVolume(name).remove maps correctly', async () => {
		sendRequest.mockResolvedValue(undefined)
		const client = new AgentDockerClient(AGENT_ID)
		await client.getVolume('v1').remove()

		expect(sendRequest).toHaveBeenCalledWith(AGENT_ID, 'volume.remove', ['v1'])
	})
})

describe('AgentDockerClient — pull / modem.followProgress synthesis', () => {
	test('pull() awaits the agent and invokes callback with a synthetic stream', async () => {
		sendRequest.mockResolvedValue({success: true})
		const client = new AgentDockerClient(AGENT_ID)

		await new Promise<void>((resolve, reject) => {
			client.pull('alpine:latest', (err, stream) => {
				try {
					expect(err).toBeNull()
					expect(stream).toBeTruthy()
					expect(typeof stream.on).toBe('function')

					// followProgress invokes onFinished when stream emits 'end'
					client.modem.followProgress(stream, (followErr) => {
						expect(followErr).toBeNull()
						resolve()
					})
				} catch (e) {
					reject(e)
				}
			})
		})

		expect(sendRequest).toHaveBeenCalledWith(AGENT_ID, 'pull', ['alpine:latest'])
	})

	test('pull() forwards agent error via callback(err, null)', async () => {
		sendRequest.mockRejectedValue(new Error('image not found'))
		const client = new AgentDockerClient(AGENT_ID)

		await new Promise<void>((resolve) => {
			client.pull('bogus:latest', (err, stream) => {
				expect(err).toBeInstanceOf(Error)
				expect((err as Error).message).toMatch(/image not found/)
				expect(stream).toBeNull()
				resolve()
			})
		})
	})
})
