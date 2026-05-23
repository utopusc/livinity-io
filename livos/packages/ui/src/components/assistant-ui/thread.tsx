/**
 * Phase 198-02 Task 3 — assistant-ui Thread scaffold.
 *
 * This is the MANUAL-COPY FALLBACK per Plan 198-02 Task 3 step 2:
 * the assistant-ui CLI (`npx assistant-ui@latest add thread`) and the
 * suggested shadcn fallback (`npx shadcn add https://r.assistant-ui.com/
 * thread.json`) both fail on Windows hosts because pnpm postinstall runs
 * `cp -r ./node_modules/@tabler/icons/icons/. ./public/generated-tabler-
 * icons` which is POSIX-only — ELIFECYCLE kills the CLI BEFORE files are
 * written and rolls back package.json + pnpm-lock.yaml changes.
 *
 * Linux Mini PC deploys (`bash /opt/livos/update.sh`) re-run install
 * cleanly; this scaffold compiles on both platforms.
 *
 * SUBSET STRATEGY: The canonical Thread from r.assistant-ui.com depends
 * on 6 sibling assistant-ui shadcn components (attachment, markdown-text,
 * reasoning, tool-group, tool-fallback, tooltip-icon-button) plus a
 * project-level `@/components/ui/button` (shadcn Button) and `@/lib/utils`
 * (cn helper). None of these exist in this codebase — this UI package
 * uses a different design system (livinity-design-tokens + custom button
 * components like icon-button.tsx, NOT shadcn-style button.tsx).
 *
 * Rather than scope-creep this plan into porting all 6 sibling components
 * + a shadcn shim, we ship a MINIMAL Thread that uses ONLY primitives
 * from `@assistant-ui/react` itself. Plan 198-03 (tool-ui primitives wave)
 * + Plan 198-05 (ThreadList) + Plan 198-07 (theming/empty-state) WILL
 * expand this scaffold with the missing pieces under a proper migration
 * pass — see CONTEXT.md decisions §198-03 for the tool-ui copy-paste plan
 * which lays the groundwork for shadcn-compatible primitives in this dir.
 *
 * Acceptance criteria satisfied:
 *   - File EXISTS at expected path
 *   - `grep -c "ThreadPrimitive" thread.tsx` >= 1  ✓
 *   - pnpm --filter ui build exits 0              (verified in Task 4)
 */

import {
	ComposerPrimitive,
	MessagePrimitive,
	ThreadPrimitive,
} from '@assistant-ui/react'
import type {FC} from 'react'

export const Thread: FC = () => {
	return (
		<ThreadPrimitive.Root className="aui-root aui-thread-root flex h-full flex-col bg-background">
			<ThreadPrimitive.Viewport className="relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth">
				<div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-4">
					<ThreadPrimitive.Empty>
						<ThreadWelcome />
					</ThreadPrimitive.Empty>

					<ThreadPrimitive.Messages
						components={{
							UserMessage,
							AssistantMessage,
						}}
					/>

					<ThreadPrimitive.ViewportFooter className="sticky bottom-0 mt-auto flex flex-col gap-4 bg-background pb-4">
						<Composer />
					</ThreadPrimitive.ViewportFooter>
				</div>
			</ThreadPrimitive.Viewport>
		</ThreadPrimitive.Root>
	)
}

const ThreadWelcome: FC = () => {
	return (
		<div className="my-auto flex grow flex-col items-center justify-center">
			<h1 className="font-semibold text-2xl">Hello there!</h1>
			<p className="text-muted-foreground text-xl">
				How can I help you today?
			</p>
		</div>
	)
}

const Composer: FC = () => {
	return (
		<ComposerPrimitive.Root className="relative flex w-full flex-col rounded-2xl border bg-background p-2 focus-within:ring-2 focus-within:ring-ring/20">
			<ComposerPrimitive.Input
				placeholder="Send a message..."
				className="max-h-32 min-h-10 w-full resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground/80"
				rows={1}
				autoFocus
				aria-label="Message input"
			/>
			<div className="flex items-center justify-end">
				<ComposerPrimitive.Send
					className="rounded-full bg-primary px-3 py-1 text-primary-foreground text-sm disabled:opacity-50"
					aria-label="Send message"
				>
					Send
				</ComposerPrimitive.Send>
			</div>
		</ComposerPrimitive.Root>
	)
}

const UserMessage: FC = () => {
	return (
		<MessagePrimitive.Root
			data-role="user"
			className="flex justify-end px-2"
		>
			<div className="rounded-2xl bg-muted px-4 py-2 text-foreground">
				<MessagePrimitive.Content />
			</div>
		</MessagePrimitive.Root>
	)
}

const AssistantMessage: FC = () => {
	return (
		<MessagePrimitive.Root
			data-role="assistant"
			className="relative px-2 text-foreground leading-relaxed"
		>
			<MessagePrimitive.Content />
		</MessagePrimitive.Root>
	)
}

export default Thread
