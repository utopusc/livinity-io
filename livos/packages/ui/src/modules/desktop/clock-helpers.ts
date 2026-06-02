// Phase 255-04 (Wave 2 GREEN) — clock-helpers pure-function contract.
//
// Extracted out of top-bar.tsx so the WMO-glyph map + the Turkish greeting
// bands are pure, testable functions (GREEN gate for the 255-01 RED suite
// `clock-helpers.test.ts`). Consumed by ClockWithLocation in top-bar.tsx for
// the additive navbar glow-up (weather glyph + day/night accent + greeting).
//
// WMO map (research §5 / PATTERNS.md): 0→☀️, 1-2→⛅, 3→☁️, 45-48→🌫️,
// 51-67→🌧️, 71-77→❄️, 80-82→🌧️, 95-99→⛈️, unknown→☁️ (fallback).
// Greeting bands (user_language.md): h<6 'İyi geceler' | h<12 'Günaydın' |
// h<18 'İyi günler' | else 'İyi akşamlar'.

export function wmoGlyph(code: number): string {
	if (code === 0) return '☀️'
	if (code <= 2) return '⛅'
	if (code === 3) return '☁️'
	if (code >= 45 && code <= 48) return '🌫️'
	if (code >= 51 && code <= 67) return '🌧️'
	if (code >= 71 && code <= 77) return '❄️'
	if (code >= 80 && code <= 82) return '🌧️'
	if (code >= 95 && code <= 99) return '⛈️'
	return '☁️'
}

export function greeting(hour: number, name?: string): string {
	const g = hour < 6 ? 'İyi geceler' : hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar'
	return name ? `${g}, ${name}` : g
}
