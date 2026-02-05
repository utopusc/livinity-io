import PhotoSwipeLightbox from 'photoswipe/lightbox'
import {Link} from 'react-router-dom'

import 'photoswipe/style.css'

import {useEffect} from 'react'

import {FadeInImg} from '@/components/ui/fade-in-img'
import {Banner} from '@/routes/app-store/use-discover-query'
import {cn} from '@/shadcn-lib/utils'
import {tw} from '@/utils/tw'

export const AppsGallerySection: React.FC<{banners: Banner[]}> = ({banners}) => {
	if (!banners || banners.length === 0) return null

	return (
		<div className={galleryRootClass}>
			{banners.map((banner, i) => (
				<Link
					key={banner.id}
					to={`/app-store/${banner.id}`}
					className={cn(
						galleryItemClass,
						'group relative aspect-[2.2] h-[160px] overflow-hidden rounded-2xl md:h-[320px] md:rounded-3xl',
					)}
					style={{
						animationDelay: `${i * 100}ms`,
					}}
				>
					{/* Background image */}
					<FadeInImg
						src={banner.image}
						className='h-full w-full object-cover transition-transform duration-700 group-hover:scale-105'
						alt={banner.id}
					/>

					{/* Gradient overlay */}
					<div className='absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent' />

					{/* Hover glow */}
					<div className='absolute inset-0 bg-gradient-to-br from-purple-500/0 to-cyan-500/0 opacity-0 transition-opacity duration-500 group-hover:opacity-20' />

					{/* Border highlight on hover */}
					<div className='absolute inset-0 rounded-2xl border-2 border-white/0 transition-colors duration-300 group-hover:border-white/20 md:rounded-3xl' />
				</Link>
			))}
		</div>
	)
}

export const AppGallerySection: React.FC<{gallery: string[]; galleryId: string}> = ({gallery, galleryId}) => {
	useEffect(() => {
		let lightbox: PhotoSwipeLightbox | null = new PhotoSwipeLightbox({
			gallery: '#' + galleryId,
			children: 'a',
			pswpModule: () => import('photoswipe'),
		})
		lightbox.init()

		return () => {
			lightbox?.destroy()
			lightbox = null
		}
	}, [galleryId])

	return (
		<div className={cn(galleryRootClass, 'pswp-gallery')} id={galleryId}>
			{gallery.map((src, i) => (
				<a
					key={src}
					href={src}
					data-pswp-width={2880}
					data-pswp-height={1800}
					className={cn(
						galleryItemClass,
						'group relative aspect-[1.6] h-[200px] overflow-hidden rounded-xl md:h-[300px] md:rounded-2xl',
					)}
					style={{
						animationDelay: `${i * 80}ms`,
					}}
					target='_blank'
					rel='noreferrer'
				>
					<FadeInImg
						src={src}
						className='h-full w-full object-cover transition-transform duration-500 group-hover:scale-105'
						alt=''
					/>
					{/* Zoom indicator */}
					<div className='absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100'>
						<div className='rounded-full bg-white/20 p-3 backdrop-blur-sm'>
							<svg className='h-6 w-6 text-white' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
								<path
									strokeLinecap='round'
									strokeLinejoin='round'
									strokeWidth={2}
									d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7'
								/>
							</svg>
						</div>
					</div>
					{/* Border */}
					<div className='absolute inset-0 rounded-xl border border-white/10 transition-colors duration-300 group-hover:border-white/20 md:rounded-2xl' />
				</a>
			))}
		</div>
	)
}

// Hero banner for featured app
export function HeroBanner({
	appId,
	image,
	title,
	tagline,
	gradient,
}: {
	appId: string
	image?: string
	title: string
	tagline: string
	gradient?: string
}) {
	return (
		<Link
			to={`/app-store/${appId}`}
			className={cn(
				'group relative block w-full overflow-hidden rounded-3xl',
				'border border-white/[0.1]',
				'transition-all duration-500',
				'hover:border-white/[0.2] hover:shadow-[0_20px_60px_rgba(0,0,0,0.4)]',
				'animate-in fade-in slide-in-from-bottom-8 duration-500',
			)}
		>
			{/* Background */}
			<div
				className={cn(
					'absolute inset-0',
					gradient || 'bg-gradient-to-br from-purple-600/40 via-blue-600/30 to-cyan-600/20',
				)}
			/>
			{image && (
				<FadeInImg
					src={image}
					className='absolute inset-0 h-full w-full object-cover opacity-60 transition-transform duration-700 group-hover:scale-105'
					alt=''
				/>
			)}

			{/* Overlay */}
			<div className='absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent' />

			{/* Animated glow */}
			<div className='absolute -right-20 -top-20 h-60 w-60 rounded-full bg-purple-500/20 blur-3xl transition-all duration-500 group-hover:bg-purple-500/30' />

			{/* Content */}
			<div className='relative flex min-h-[200px] flex-col justify-end p-6 md:min-h-[280px] md:p-10'>
				<span className='mb-2 inline-flex w-fit items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-purple-300 backdrop-blur-sm'>
					<span className='h-1.5 w-1.5 rounded-full bg-purple-400' />
					Featured
				</span>
				<h2 className='text-3xl font-bold tracking-tight text-white md:text-5xl'>{title}</h2>
				<p className='mt-2 max-w-xl text-base text-white/70 md:text-lg'>{tagline}</p>
				<div className='mt-4 flex items-center gap-2 text-sm font-medium text-white/60 transition-colors group-hover:text-white'>
					<span>Explore now</span>
					<svg
						className='h-4 w-4 transition-transform group-hover:translate-x-1'
						fill='none'
						viewBox='0 0 24 24'
						stroke='currentColor'
					>
						<path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M9 5l7 7-7 7' />
					</svg>
				</div>
			</div>
		</Link>
	)
}

export const galleryRootClass = tw`-mx-[70px] px-[70px] livinity-hide-scrollbar flex gap-4 md:gap-6 overflow-x-auto pb-2`

export const galleryItemClass = tw`
	shrink-0
	bg-white/5
	outline-none
	ring-inset
	focus-visible:ring-2
	focus-visible:ring-purple-500/50
	animate-in
	fade-in
	slide-in-from-right-8
	fill-mode-both
`
