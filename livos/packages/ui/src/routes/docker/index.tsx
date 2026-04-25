// Phase 24-01 — default export for React.lazy(() => import('@/routes/docker'))
// in modules/window/app-contents/docker-content.tsx.
//
// No ThemeProvider wrapper needed: theme state is owned by useDockerTheme()
// inside DockerApp itself (scoped to the docker-app root).

import {DockerApp} from './docker-app'

export default DockerApp
