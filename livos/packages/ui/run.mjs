import {execSync, spawn} from 'child_process'
import process from 'process'

console.log('running...')

execSync('rm -rf data && mkdir data', {cwd: '../livinityd'})
// exec('npm run dev')

const child = spawn('npm', ['run', 'dev'], {cwd: '../livinityd'})

child.on('error', console.error)
child.stdout.on('data', (data) => {
	console.log(data.toString())
	if (data.toString().includes('Repositories initialised!')) {
		// resolve()
		console.log('Initialized')
		process.kill(child.pid, 'SIGINT')
		process.exit(0)
	}
})

// process.kill(child.pid, 'SIGINT')

// console.log('Livinity is running on http://localhost:3001')

// process.exit(0)
