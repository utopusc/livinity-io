import {FadeInImg} from '@/components/ui/fade-in-img'
import {trpcReact} from '@/trpc/trpc'

const FROM_RASPBERRY_PI_URL = '/figma-exports/migrate-raspberrypi-livinity-home.png'
const FROM_LIVINITY_URL = '/figma-exports/migrate-livinity-home-livinity-home.png'

export function MigrateImage() {
	const isMigrationFromLivinityQ = trpcReact.migration.isMigratingFromLivinityHome.useQuery()

	const url = isMigrationFromLivinityQ.data ? FROM_LIVINITY_URL : FROM_RASPBERRY_PI_URL

	return <FadeInImg src={url} width={111} height={104} alt='' />
}
