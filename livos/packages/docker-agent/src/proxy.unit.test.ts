// Phase 22 MH-04 — proxy.dispatch unit tests.
//
// Mocks dockerode so tests run without a local Docker daemon. We verify the
// AgentRequest → handler dispatch wiring (right method called with right args)
// and the AgentResponse shape for success / error / unknown-method paths.

import {beforeEach, describe, expect, test, vi} from 'vitest'

// Build the dockerode mock — vi.hoisted so the mocks are available inside
// vi.mock's factory (which is hoisted to BEFORE all imports).
const {
	mockListContainers,
	mockListImages,
	mockInfo,
	mockVersion,
	mockCreateContainer,
	mockGetContainer,
	mockGetImage,
} = vi.hoisted(() => ({
	mockListContainers: vi.fn(),
	mockListImages: vi.fn(),
	mockInfo: vi.fn(),
	mockVersion: vi.fn(),
	mockCreateContainer: vi.fn(),
	mockGetContainer: vi.fn(),
	mockGetImage: vi.fn(),
}))

vi.mock('dockerode', () => {
	return {
		default: vi.fn().mockImplementation(() => ({
			listContainers: mockListContainers,
			listImages: mockListImages,
			listVolumes: vi.fn().mockResolvedValue({Volumes: []}),
			listNetworks: vi.fn().mockResolvedValue([]),
			info: mockInfo,
			version: mockVersion,
			pruneImages: vi.fn().mockResolvedValue({SpaceReclaimed: 0}),
			pruneContainers: vi.fn().mockResolvedValue({SpaceReclaimed: 0}),
			pruneVolumes: vi.fn().mockResolvedValue({SpaceReclaimed: 0}),
			pruneNetworks: vi.fn().mockResolvedValue({NetworksDeleted: []}),
			createContainer: mockCreateContainer,
			getContainer: mockGetContainer,
			getImage: mockGetImage,
			getNetwork: vi.fn(),
			getVolume: vi.fn(),
			modem: {
				followProgress: vi.fn(),
			},
		})),
	}
})

import {dispatch, getDockerVersion} from './proxy.js'

beforeEach(() => {
	mockListContainers.mockReset()
	mockListImages.mockReset()
	mockInfo.mockReset()
	mockVersion.mockReset()
	mockCreateContainer.mockReset()
	mockGetContainer.mockReset()
	mockGetImage.mockReset()
})

describe('dispatch — happy paths', () => {
	test('listContainers passes opts and returns result', async () => {
		mockListContainers.mockResolvedValue([{Id: 'c1'}])

		const resp = await dispatch({
			type: 'request',
			requestId: 'r1',
			method: 'listContainers',
			args: [{all: true}],
		})

		expect(mockListContainers).toHaveBeenCalledWith({all: true})
		expect(resp).toEqual({
			type: 'response',
			requestId: 'r1',
			result: [{Id: 'c1'}],
		})
	})

	test('info returns daemon info', async () => {
		mockInfo.mockResolvedValue({Containers: 5, Images: 10})

		const resp = await dispatch({type: 'request', requestId: 'r2', method: 'info', args: []})

		expect(resp.result).toEqual({Containers: 5, Images: 10})
		expect(resp.error).toBeUndefined()
	})

	test('container.start: getContainer(id).start() invoked, success returned', async () => {
		const startMock = vi.fn().mockResolvedValue(undefined)
		mockGetContainer.mockReturnValue({start: startMock})

		const resp = await dispatch({
			type: 'request',
			requestId: 'r3',
			method: 'container.start',
			args: ['c1'],
		})

		expect(mockGetContainer).toHaveBeenCalledWith('c1')
		expect(startMock).toHaveBeenCalled()
		expect(resp.result).toEqual({success: true})
	})

	test('createContainer returns the new container id', async () => {
		mockCreateContainer.mockResolvedValue({id: 'newid'})

		const resp = await dispatch({
			type: 'request',
			requestId: 'r4',
			method: 'createContainer',
			args: [{Image: 'alpine'}],
		})

		expect(mockCreateContainer).toHaveBeenCalledWith({Image: 'alpine'})
		expect(resp.result).toEqual({id: 'newid'})
	})

	test('container.logs base64-encodes the buffer', async () => {
		const logsMock = vi.fn().mockResolvedValue(Buffer.from('hello\n'))
		mockGetContainer.mockReturnValue({logs: logsMock})

		const resp = await dispatch({
			type: 'request',
			requestId: 'r5',
			method: 'container.logs',
			args: ['c1', {tail: 100}],
		})

		expect(typeof resp.result).toBe('string')
		expect(Buffer.from(resp.result as string, 'base64').toString('utf-8')).toBe('hello\n')
	})

	test('container.stats forces stream:false even if caller asks for true', async () => {
		const statsMock = vi.fn().mockResolvedValue({cpu_stats: {}})
		mockGetContainer.mockReturnValue({stats: statsMock})

		await dispatch({
			type: 'request',
			requestId: 'r6',
			method: 'container.stats',
			args: ['c1', {stream: true}],
		})

		expect(statsMock).toHaveBeenCalledWith({stream: false})
	})
})

describe('dispatch — error paths', () => {
	test('unknown method returns METHOD_NOT_FOUND', async () => {
		const resp = await dispatch({
			type: 'request',
			requestId: 'r7',
			method: 'this-does-not-exist',
			args: [],
		})

		expect(resp.error).toBeDefined()
		expect(resp.error?.code).toBe('METHOD_NOT_FOUND')
		expect(resp.error?.message).toMatch(/unknown-method: this-does-not-exist/)
		expect(resp.result).toBeUndefined()
	})

	test('dockerode error preserves message + statusCode + code', async () => {
		const err: any = new Error('container not found')
		err.statusCode = 404
		err.code = 'CONTAINER_NOT_FOUND'
		const inspectMock = vi.fn().mockRejectedValue(err)
		mockGetContainer.mockReturnValue({inspect: inspectMock})

		const resp = await dispatch({
			type: 'request',
			requestId: 'r8',
			method: 'container.inspect',
			args: ['nope'],
		})

		expect(resp.result).toBeUndefined()
		expect(resp.error?.message).toBe('container not found')
		expect(resp.error?.statusCode).toBe(404)
		expect(resp.error?.code).toBe('CONTAINER_NOT_FOUND')
	})

	test('non-Error thrown values are stringified into the message', async () => {
		const inspectMock = vi.fn().mockRejectedValue('plain string error')
		mockGetContainer.mockReturnValue({inspect: inspectMock})

		const resp = await dispatch({
			type: 'request',
			requestId: 'r9',
			method: 'container.inspect',
			args: ['x'],
		})

		expect(resp.error?.message).toBe('plain string error')
	})
})

describe('getDockerVersion', () => {
	test('returns Version field on success', async () => {
		mockVersion.mockResolvedValue({Version: '24.0.5'})
		const v = await getDockerVersion()
		expect(v).toBe('24.0.5')
	})

	test('returns undefined if dockerode throws', async () => {
		mockVersion.mockRejectedValue(new Error('cannot reach daemon'))
		const v = await getDockerVersion()
		expect(v).toBeUndefined()
	})
})
