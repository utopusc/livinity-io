import {BrowserRouter} from 'react-router-dom'

import {init} from '../../src/init'
import LoginWithLivinity from './login-with-livinity'

init(
	// NOTE: not putting `GlobalSystemStateProvider` here because we don't care.
	// It doesn't matter for the auth page
	<BrowserRouter>
		<LoginWithLivinity />
	</BrowserRouter>,
)
