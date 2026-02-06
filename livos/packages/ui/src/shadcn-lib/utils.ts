import {clsx, type ClassValue} from 'clsx'
import {extendTailwindMerge} from 'tailwind-merge'

const num = (classPart: string) => /^\d+$/.test(classPart)

const customTwMerge = extendTailwindMerge({
	classGroups: {
		// Without this, styles like text-12 don't work properly with other text-* styles
		// Also includes semantic font sizes for proper merge precedence
		'font-size': [{text: ['base', num, 'caption-sm', 'caption', 'body-sm', 'body', 'body-lg', 'heading-sm', 'heading', 'heading-lg', 'display-sm', 'display', 'display-lg']}],
		// Allows cn('rounded-12', 'rounded-20') to cause the 20 to override the 12
		// Also includes semantic border radii for proper merge precedence
		'border-radius': [{rounded: ['base', num, 'radius-sm', 'radius-md', 'radius-lg', 'radius-xl']}],
		'border-width': [{border: ['hpx']}],
	},
})

export function cn(...inputs: ClassValue[]) {
	return customTwMerge(clsx(inputs))
}
