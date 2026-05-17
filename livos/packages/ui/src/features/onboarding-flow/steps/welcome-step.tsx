import {Icon} from '../icon'

const SYS_INFO = {
	model: 'Livinity One',
	cpu: 'Apple M2 · 8 cores',
	ram: '16 GB',
	storage: '4 TB SSD',
	network: 'Wi-Fi · gigabit',
	region: 'Istanbul · UTC+3',
}
// TODO 135-E: replace SYS_INFO constants with a tRPC system.info query once
// livinityd exposes hardware detection. For now hard-coded matches reference.

type Props = {
	onStart: () => void
	lang: string
	setLang: (next: string) => void
}

export function WelcomeStep({onStart, lang, setLang}: Props) {
	return (
		<div
			className='welcome'
			style={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				gap: 22,
				padding: '20px 0',
			}}
		>
			<div className='welcome-brand fade-up'>
				<span className='welcome-brand-mark' aria-hidden='true'></span>
				<span className='welcome-brand-word'>Livinity</span>
			</div>

			<div
				className='fade-up d1'
				style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10}}
			>
				<div className='onb-eyebrow'>A new kind of computer</div>
				<h1 className='onb-title'>
					Welcome to <em>Livinity</em>
				</h1>
				<p className='onb-sub'>
					Your home cloud server is ready to set up. A few minutes to make it yours.
				</p>
			</div>

			<div className='sysinfo-card fade-up d2'>
				<div className='sysinfo-grid'>
					<div className='sysinfo-row'>
						<Icon name='cpu' size={13} /> <span>{SYS_INFO.cpu}</span>
					</div>
					<div className='sysinfo-row'>
						<Icon name='disk' size={13} />{' '}
						<span>
							{SYS_INFO.ram} · {SYS_INFO.storage}
						</span>
					</div>
					<div className='sysinfo-row'>
						<Icon name='wifi' size={13} /> <span>{SYS_INFO.network}</span>
					</div>
					<div className='sysinfo-row'>
						<Icon name='globe' size={13} /> <span>{SYS_INFO.region}</span>
					</div>
				</div>
			</div>

			<div
				className='fade-up d3'
				style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 4}}
			>
				<select
					className='lang-pick'
					value={lang}
					onChange={(e) => setLang(e.target.value)}
					style={{
						appearance: 'none',
						paddingRight: 36,
						backgroundImage:
							"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236e6e73' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
						backgroundRepeat: 'no-repeat',
						backgroundPosition: 'right 14px center',
					}}
				>
					<option value='en'>🌐 English</option>
					<option value='tr'>🌐 Türkçe</option>
					<option value='de'>🌐 Deutsch</option>
					<option value='fr'>🌐 Français</option>
					<option value='es'>🌐 Español</option>
				</select>
				<button className='btn btn-primary btn-lg' onClick={onStart}>
					Start <Icon name='arrow-right' size={14} />
				</button>
			</div>
		</div>
	)
}
