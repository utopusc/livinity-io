// Phase 29 Plan 29-02 — Registry section (DOC-16).
//
// Top-level surface mounted at /docker/registry. shadcn Tabs primitive
// switches between two child views:
//   - Credentials tab — list + add + delete saved registry credentials
//     (encrypted at rest via AES-256-GCM, mirroring git-credentials).
//   - Image Search tab — Docker Hub or private-registry search with a
//     per-row Pull button bound to docker.pullImage.

import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/shadcn-components/ui/tabs'

import {CredentialsTab} from './credentials-tab'
import {ImageSearchTab} from './image-search-tab'

export function RegistrySection() {
	return (
		<div className='flex h-full flex-col overflow-hidden'>
			<div className='border-b border-zinc-200 px-6 py-4 dark:border-zinc-800'>
				<h2 className='text-lg font-semibold text-zinc-900 dark:text-zinc-100'>Registry</h2>
				<p className='mt-1 text-sm text-zinc-500 dark:text-zinc-400'>
					Docker Hub and private registry credentials + image search.
				</p>
			</div>
			<Tabs defaultValue='credentials' className='flex flex-1 flex-col overflow-hidden px-6 pt-4'>
				<TabsList className='self-start'>
					<TabsTrigger value='credentials'>Credentials</TabsTrigger>
					<TabsTrigger value='search'>Image Search</TabsTrigger>
				</TabsList>
				<TabsContent value='credentials' className='flex-1 overflow-y-auto pb-6'>
					<CredentialsTab />
				</TabsContent>
				<TabsContent value='search' className='flex-1 overflow-y-auto pb-6'>
					<ImageSearchTab />
				</TabsContent>
			</Tabs>
		</div>
	)
}
