// Feedback 90358f61: the product domain is livinity.IO (livinity.com is
// unrelated); /support did not exist there. Point support at a mailto that
// always works, and the legal links at the pages that actually resolve
// (/legal/privacy = 200, /legal/terms = 200).
export const links = {
	support: 'mailto:support@livinity.io',
	legal: {
		privacy: 'https://livinity.io/legal/privacy',
		tos: 'https://livinity.io/legal/terms',
	},
}
