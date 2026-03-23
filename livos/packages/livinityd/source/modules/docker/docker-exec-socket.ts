import type http from 'node:http'

import Dockerode from 'dockerode'
import {type WebSocket} from 'ws'

import type createLogger from '../utilities/logger.js'

const docker = new Dockerode()

const ALLOWED_SHELLS = ['bash', 'sh', 'ash'] as const

export default function createDockerExecHandler({logger}: {logger: ReturnType<typeof createLogger>}) {
	return async function (ws: WebSocket, request: http.IncomingMessage) {
		try {
			const params = new URL(`https://localhost${request.url}`).searchParams
			const containerName = params.get('container')
			const shell = params.get('shell') || 'bash'
			const user = params.get('user') || ''

			// Validate required container parameter
			if (!containerName) {
				ws.close(1008, 'Missing container')
				return
			}

			// Validate shell is one of the allowed options
			if (!ALLOWED_SHELLS.includes(shell as any)) {
				ws.close(1008, 'Invalid shell. Must be one of: bash, sh, ash')
				return
			}

			logger.log(`Exec into ${containerName} with shell=${shell}${user ? ` user=${user}` : ''}`)

			const container = docker.getContainer(containerName)
			const exec = await container.exec({
				Cmd: [shell],
				AttachStdin: true,
				AttachStdout: true,
				AttachStderr: true,
				Tty: true,
				User: user || undefined,
			})

			const stream = await exec.start({hijack: true, stdin: true, Tty: true})

			// Stream output from exec to WebSocket
			stream.on('data', (chunk: Buffer) => {
				if (ws.readyState === ws.OPEN) {
					ws.send(chunk)
				}
			})

			// Stream input from WebSocket to exec
			ws.on('message', (data: Buffer | string) => {
				// Try to parse as JSON for resize messages
				try {
					const msg = JSON.parse(typeof data === 'string' ? data : data.toString())
					if (msg && msg.type === 'resize' && typeof msg.cols === 'number' && typeof msg.rows === 'number') {
						exec.resize({h: msg.rows, w: msg.cols}).catch((err) => {
							logger.error(`Exec resize error for ${containerName}`, err)
						})
						return
					}
				} catch {
					// Not JSON -- treat as terminal input
				}

				stream.write(data)
			})

			// Cleanup: WebSocket closed -> destroy stream
			ws.on('close', () => {
				logger.verbose(`Exec session closed for ${containerName}`)
				stream.destroy()
			})

			// Cleanup: Stream ended -> close WebSocket
			stream.on('end', () => {
				if (ws.readyState === ws.OPEN) {
					ws.close()
				}
			})

			stream.on('error', (err) => {
				logger.error(`Exec stream error for ${containerName}`, err)
				if (ws.readyState === ws.OPEN) {
					ws.close(1011, 'Stream error')
				}
			})
		} catch (error: any) {
			logger.error(`Docker exec handler error`, error)
			if (ws.readyState === ws.OPEN) {
				ws.close(1011, error?.message || 'Internal error')
			}
		}
	}
}
