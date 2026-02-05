import fse from 'fs-extra'
import systeminfo from 'systeminformation'

export default async function isLivinityHome() {
	// This file exists in old versions of amd64 Livinity OS builds due to the Docker build system.
	// It confuses the systeminfo library and makes it return the model as 'Docker Container'.
	await fse.remove('/.dockerenv')

	const {manufacturer, model} = await systeminfo.system()

	return manufacturer === 'Livinity, Inc.' && model === 'Livinity Home'
}
