import type http from 'node:http'

import Dockerode from 'dockerode'
import {type WebSocket} from 'ws'

import type createLogger from '../utilities/logger.js'
import {stripDockerStreamHeaders} from './docker.js'

const docker = new Dockerode()

/**
 * WebSocket handler for real-time container log streaming.
 *
 * URL: `/ws/docker/logs?container=<name>&tail=<n>&token=<jwt>`
 *
 * Streams `container.logs({follow:true})` with Docker multiplexed stream-header stripping.
 * Does NOT strip ANSI — xterm.js in the browser renders color escapes natively (QW-01).
 *
 * Heartbeat: ping every 30s; terminate if no pong within the next interval.
 */
export default function createDockerLogsHandler({logger}: {logger: ReturnType<typeof createLogger>}) {
	return async function (ws: WebSocket, request: http.IncomingMessage) {
		try {
			const params = new URL(`https://localhost${request.url}`).searchParams
			const containerName = params.get('container')
			const tailStr = params.get('tail') ?? '500'
			const tail = Math.max(0, Math.min(5000, parseInt(tailStr, 10) || 500))

			if (!containerName) {
				ws.close(1008, 'Missing container')
				return
			}

			logger.log(`Logs follow for ${containerName} (tail=${tail})`)

			const container = docker.getContainer(containerName)
			// dockerode returns a NodeJS.ReadableStream when follow:true
			const stream = (await container.logs({
				stdout: true,
				stderr: true,
				tail,
				timestamps: false,
				follow: true,
			})) as unknown as NodeJS.ReadableStream

			// Strip Docker 8-byte frame headers per chunk before sending; DO NOT stripAnsi
			// (we want ANSI colors to reach xterm in the browser).
			stream.on('data', (chunk: Buffer) => {
				if (ws.readyState !== ws.OPEN) return
				const text = stripDockerStreamHeaders(chunk)
				ws.send(text)
			})

			stream.on('end', () => {
				if (ws.readyState === ws.OPEN) ws.close(1000, 'stream-end')
			})

			stream.on('error', (err) => {
				logger.error(`Logs stream error for ${containerName}`, err)
				if (ws.readyState === ws.OPEN) ws.close(1011, 'Stream error')
			})

			// Heartbeat: ping every 30s; terminate if no pong within the next interval
			let isAlive = true
			ws.on('pong', () => {
				isAlive = true
			})
			const heartbeat = setInterval(() => {
				if (!isAlive) {
					ws.terminate()
					return
				}
				isAlive = false
				try {
					ws.ping()
				} catch {
					/* ignore */
				}
			}, 30_000)

			ws.on('close', () => {
				clearInterval(heartbeat)
				logger.verbose(`Logs session closed for ${containerName}`)
				// dockerode log streams expose .destroy()
				;(stream as any).destroy?.()
			})
		} catch (error: any) {
			logger.error(`Docker logs handler error`, error)
			if (ws.readyState === ws.OPEN) ws.close(1011, error?.message || 'Internal error')
		}
	}
}
