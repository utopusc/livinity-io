import type {OnboardingData} from '../constants'
import {FooterBar} from '../footer-bar'
import {Icon} from '../icon'

const ROLES = ['Developer', 'Student', 'Designer', 'Business', 'Creative', 'General'] as const

const STYLES = [
	{id: 'concise' as const, name: 'Concise', desc: 'Short and to the point'},
	{id: 'direct' as const, name: 'Direct', desc: 'Clear with enough detail'},
	{id: 'detailed' as const, name: 'Detailed', desc: 'Thorough explanations'},
]

const USE_CASES = [
	'Coding',
	'Research',
	'Writing',
	'Automation',
	'Data Analysis',
	'Email',
	'Learning',
	'Planning',
	'Creative Projects',
	'System Admin',
] as const

const ROLE_DEFAULTS: Record<string, readonly string[]> = {
	Developer: ['Coding', 'Automation', 'System Admin'],
	Student: ['Research', 'Learning', 'Writing'],
	Designer: ['Creative Projects', 'Writing', 'Planning'],
	Business: ['Email', 'Planning', 'Data Analysis'],
	Creative: ['Creative Projects', 'Writing', 'Research'],
	General: [],
}

const MEMORY_OPTS = [
	{id: 'off' as const, name: 'Off', desc: 'No memory between sessions'},
	{id: 'session' as const, name: 'Session', desc: 'Remember within one chat'},
	{id: 'persistent' as const, name: 'Persistent', desc: 'Long-term memory'},
]

function toneLabel(t: number): string {
	if (t < 25) return 'Casual'
	if (t < 55) return 'Friendly'
	if (t < 80) return 'Direct'
	return 'Formal'
}

type Props = {
	data: OnboardingData
	setData: (next: OnboardingData) => void
	onContinue: () => void
	onSkip: () => void
	onBack: () => void
}

export function PersonalizeStep({data, setData, onContinue, onSkip, onBack}: Props) {
	const setRole = (r: string) => {
		const defaults = ROLE_DEFAULTS[r] ?? []
		setData({
			...data,
			role: r,
			useCases: data.useCasesTouched ? data.useCases : [...defaults],
		})
	}
	const toggleCase = (uc: string) => {
		const next = data.useCases.includes(uc)
			? data.useCases.filter((x) => x !== uc)
			: [...data.useCases, uc]
		setData({...data, useCases: next, useCasesTouched: true})
	}
	return (
		<div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
			<div className='fade-up'>
				<div className='onb-eyebrow'>04 · Personalize</div>
				<h1 className='onb-title' style={{marginTop: 8}}>
					Help Liv <em>understand</em> you
				</h1>
				<p className='onb-sub' style={{marginTop: 10}}>
					A few hints so the assistant matches how you actually work.
				</p>
			</div>

			<div className='personalize-body'>
				<div className='fade-up d1'>
					<div className='section-label'>Your role</div>
					<div className='role-group'>
						{ROLES.map((r) => (
							<button
								key={r}
								className={`role-chip ${data.role === r ? 'on' : ''}`}
								onClick={() => setRole(r)}
							>
								{r}
							</button>
						))}
					</div>
				</div>

				<div className='fade-up d2'>
					<div className='section-label'>AI style</div>
					<div className='style-cards'>
						{STYLES.map((s) => (
							<button
								key={s.id}
								className={`style-card ${data.style === s.id ? 'on' : ''}`}
								onClick={() => setData({...data, style: s.id})}
							>
								<span className='name'>{s.name}</span>
								<span className='desc'>{s.desc}</span>
							</button>
						))}
					</div>
				</div>

				<div className='fade-up d3'>
					<div className='section-label'>
						Tone <span style={{color: 'var(--fg-faint)', marginLeft: 4}}>· {toneLabel(data.tone)}</span>
					</div>
					<div className='tone-slider'>
						<input
							type='range'
							min='0'
							max='100'
							step='1'
							value={data.tone}
							onChange={(e) => setData({...data, tone: parseInt(e.target.value, 10)})}
							style={{['--val' as never]: `${data.tone}%`}}
							aria-label='Tone slider'
						/>
						<div className='tone-marks'>
							<span>Casual</span>
							<span>Friendly</span>
							<span>Direct</span>
							<span>Formal</span>
						</div>
					</div>
				</div>

				<div className='fade-up d3'>
					<div className='section-label'>Memory</div>
					<div className='memory-group'>
						{MEMORY_OPTS.map((m) => (
							<button
								key={m.id}
								className={`memory-opt ${data.memory === m.id ? 'on' : ''}`}
								onClick={() => setData({...data, memory: m.id})}
							>
								<div className='memory-name'>{m.name}</div>
								<div className='memory-desc'>{m.desc}</div>
							</button>
						))}
					</div>
				</div>

				<div className='fade-up d4'>
					<div className='section-label'>
						Use cases <span style={{color: 'var(--fg-faint)', marginLeft: 4}}>· pick any</span>
						{data.role && !data.useCasesTouched && (ROLE_DEFAULTS[data.role]?.length ?? 0) > 0 && (
							<span style={{color: 'var(--fg-faint)', marginLeft: 8, fontSize: 10}}>
								auto-suggested from role
							</span>
						)}
					</div>
					<div className='usecase-chips'>
						{USE_CASES.map((uc) => (
							<button
								key={uc}
								className={`usecase-chip ${data.useCases.includes(uc) ? 'on' : ''}`}
								onClick={() => toggleCase(uc)}
							>
								{uc}
								{data.useCases.includes(uc) && (
									<span className='x'>
										<Icon name='check' size={10} />
									</span>
								)}
							</button>
						))}
					</div>
				</div>
			</div>

			<FooterBar
				onBack={onBack}
				onContinue={onContinue}
				onSkip={onSkip}
				continueLabel='Continue'
				hint='↵ to continue · esc for back'
			/>
		</div>
	)
}
