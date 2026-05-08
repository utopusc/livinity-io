// Phase 95-02 placeholder. The full integration lands in 95-08 (root window
// content composing the VNC pane + AI panel + mode selector). This stub
// keeps the lazy import in window-content.tsx resolvable while the rest of
// the phase tasks (95-03..95-07) ship the supporting deps + hooks.
//
// 95-08 overwrites this file with the real component.

type WebAppStreamWindowProps = {
	webappId: string
}

export default function WebAppStreamWindow(_props: WebAppStreamWindowProps) {
	return (
		<div className='flex h-full items-center justify-center text-text-tertiary'>
			<p>Loading WebApp stream…</p>
		</div>
	)
}
