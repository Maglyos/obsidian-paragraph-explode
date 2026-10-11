/**
 * Sentence splitter. Pure functions, no Obsidian imports.
 *
 * Guarantee: sentences are verbatim slices of the input (trimmed at the ends only).
 * Nothing is rewritten; boundaries are only ever chosen between existing characters.
 */

/** Never end a sentence, even before a capital letter ("Dr. Smith", "e.g. Foo"). */
const HARD_ABBREVIATIONS = new Set([
	'e.g', 'i.e', 'cf', 'viz', 'vs', 'v', 'ca', 'approx', 'resp',
	'dr', 'mr', 'mrs', 'ms', 'prof', 'sr', 'jr', 'st', 'mt',
	'fig', 'figs', 'eq', 'eqs', 'ch', 'sec', 'vol', 'vols', 'ed', 'eds',
	'p', 'pp', 'inc', 'ltd', 'dept', 'univ',
]);

/** May end a sentence, but only before a capital letter ("et al. (2020)" does not split). */
const SOFT_ABBREVIATIONS = new Set(['al', 'etc']);

const TERMINATORS = new Set(['.', '!', '?', '…']);
const TRAILING_CLOSERS = new Set(['"', "'", '”', '’', '»', ')', ']', '*', '_', '~', '=']);
const LEADING_OPENERS = new Set(['"', "'", '“', '‘', '«', '(', '[', '*', '_', '~', '=', '`']);

/** Footnote refs and (possibly space-separated) citation groups that trail a terminator. */
const TRAILING_REF = /\[\^[^\]\s]+\]|[ \t]+\[@[^\]]*\]/y;
const INITIALS = /^(?:\p{Lu}\.)*\p{Lu}$/u;
const UPPER = /\p{Lu}/u;
const UPPER_OR_DIGIT = /[\p{Lu}\p{N}]/u;
const WHITESPACE = /\s/;

/** Marks characters where a sentence must not end: code, URLs, and (...) / [...] groups. */
function protectedMask(text: string): boolean[] {
	const mask = new Array<boolean>(text.length).fill(false);
	const mark = (from: number, to: number) => {
		for (let i = from; i < to; i++) mask[i] = true;
	};

	for (const m of text.matchAll(/(`+)(?:(?!\1)[\s\S])+\1/g)) {
		mark(m.index, m.index + m[0].length);
	}
	for (const m of text.matchAll(/\b(?:https?|ftp):\/\/[^\s<>)\]]+/g)) {
		const trimmed = m[0].replace(/[.,;:!?]+$/, '');
		mark(m.index, m.index + trimmed.length);
	}

	// Matched pairs only: an unbalanced "(" must not swallow the rest of the paragraph.
	const stack: { ch: string; at: number }[] = [];
	for (let i = 0; i < text.length; i++) {
		if (mask[i]) continue;
		const ch = text.charAt(i);
		if (ch === '(' || ch === '[') {
			stack.push({ ch, at: i });
		} else if (ch === ')' || ch === ']') {
			const open = ch === ')' ? '(' : '[';
			const top = stack[stack.length - 1];
			if (top && top.ch === open) {
				stack.pop();
				mark(top.at, i + 1);
			}
		}
	}
	return mask;
}

function startsSentence(text: string, at: number, upperLetterOnly: boolean): boolean {
	const first = text.charAt(at);
	if (upperLetterOnly) return UPPER.test(first);
	if (first === '[') {
		const second = text.charAt(at + 1);
		if (second === '@' || second === '^') return false; // citation key / footnote belong to the previous sentence
		if (second === '[') return true; // wikilink
	}
	let q = at;
	while (q < text.length && LEADING_OPENERS.has(text.charAt(q))) q++;
	return q < text.length && UPPER_OR_DIGIT.test(text.charAt(q));
}

/** The whitespace-delimited word ending just before `periodAt`, with leading markup stripped. */
function wordBefore(text: string, periodAt: number): string {
	let p = periodAt;
	while (p > 0 && !WHITESPACE.test(text.charAt(p - 1))) p--;
	return text.slice(p, periodAt).replace(/^[("'“‘[*_`~=]+/, '');
}

export function splitSentences(text: string, extraAbbreviations: readonly string[] = []): string[] {
	const extra = new Set(extraAbbreviations);
	const mask = protectedMask(text);
	const n = text.length;
	const out: string[] = [];

	let start = 0;
	while (start < n && WHITESPACE.test(text.charAt(start))) start++;

	let i = start;
	while (i < n) {
		if (mask[i] || !TERMINATORS.has(text.charAt(i))) {
			i++;
			continue;
		}

		let runEnd = i;
		while (runEnd < n && !mask[runEnd] && TERMINATORS.has(text.charAt(runEnd))) runEnd++;

		let end = runEnd;
		for (;;) {
			TRAILING_REF.lastIndex = end;
			const fn = TRAILING_REF.exec(text);
			if (fn) {
				end += fn[0].length;
			} else if (end < n && TRAILING_CLOSERS.has(text.charAt(end))) {
				end++;
			} else {
				break;
			}
		}

		let next = end;
		while (next < n && WHITESPACE.test(text.charAt(next))) next++;
		if (next >= n) break; // terminator at the very end: the tail becomes the last sentence
		if (next === end) {
			i = end; // no whitespace after the terminator: "3.14", "file.md"
			continue;
		}

		let upperLetterOnly = false;
		if (text.charAt(i) === '.' && runEnd === i + 1) {
			const word = wordBefore(text, i);
			const lower = word.toLowerCase();
			if (HARD_ABBREVIATIONS.has(lower) || extra.has(lower) || INITIALS.test(word)) {
				i = end;
				continue;
			}
			upperLetterOnly = SOFT_ABBREVIATIONS.has(lower);
		}

		if (!startsSentence(text, next, upperLetterOnly)) {
			i = end;
			continue;
		}

		out.push(text.slice(start, end).trimEnd());
		start = next;
		i = next;
	}

	const tail = text.slice(start).trimEnd();
	if (tail) out.push(tail);
	return out;
}

/** Turn soft line breaks (and their indentation) into single spaces so each sentence is one line. */
export function unwrapLines(text: string): string {
	return text.replace(/[ \t]*\r?\n[ \t]*/g, ' ').trim();
}

export const DEFAULT_PHRASE_WORDS: readonly string[] = [
	'and', 'but', 'or', 'nor', 'yet',
	'as', 'because', 'although', 'though', 'while', 'whereas', 'since', 'unless', 'if', 'when', 'whenever',
	'whether', 'until', 'after', 'before', 'which', 'whereby', 'wherein',
	'however', 'therefore', 'thus', 'hence', 'moreover', 'furthermore', 'otherwise',
];

/** "as if", "even if", "so if": the starter belongs to the word before it. */
const STARTER_BLOCKERS = new Set(['as', 'even', 'so']);
/** Extra blockers for "as": "as well as", "such as", "as long as", "twice as" are one unit. */
const AS_BLOCKERS = new Set(['well', 'such', 'much', 'many', 'long', 'far', 'soon', 'same', 'just', 'twice']);

export interface PhraseOptions {
	/** Split after commas, semicolons and colons. Default true. */
	punctuation?: boolean;
	/** Words that start a new phrase. Default DEFAULT_PHRASE_WORDS; an empty list disables word splitting. */
	words?: readonly string[];
	/** Extra abbreviations (lowercase, no trailing period) that never end a sentence. */
	extraAbbreviations?: readonly string[];
	/** Placeholder tokens (case-sensitive, like "XYZ") to isolate into their own pieces. */
	placeholders?: readonly string[];
}

/**
 * Parse a user-typed list ("and, but; because") into lowercase unique words.
 * Entries may be separated by commas, semicolons or whitespace; a trailing period is dropped.
 */
export function parseWordList(input: string): string[] {
	const words = input
		.split(/[\s,;]+/)
		.map((w) => w.trim().toLowerCase().replace(/\.+$/, ''))
		.filter((w) => /^[\p{L}\p{N}][\p{L}\p{N}.'’-]*$/u.test(w));
	return [...new Set(words)];
}

function starterRegex(words: readonly string[]): RegExp | null {
	if (words.length === 0) return null;
	const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	return new RegExp(`(?:${escaped.join('|')})(?![\\p{L}\\p{N}_/'’-])`, 'iuy');
}

/**
 * Split text into phrases: every sentence, further split after commas, semicolons and colons
 * followed by whitespace, and before conjunction-like words (and, but, because, ...).
 * Punctuation stays with the phrase it ends; nothing is rewritten.
 */
export function splitPhrases(text: string, options: PhraseOptions = {}): string[] {
	const punctuation = options.punctuation ?? true;
	const starter = starterRegex(options.words ?? DEFAULT_PHRASE_WORDS);
	const phrases = splitSentences(text, options.extraAbbreviations).flatMap((s) => splitClauses(s, punctuation, starter));
	return isolatePlaceholders(phrases, options.placeholders ?? []);
}

function splitClauses(sentence: string, punctuation: boolean, starter: RegExp | null): string[] {
	const mask = protectedMask(sentence);
	const out: string[] = [];
	let start = 0;
	for (let i = 0; i < sentence.length; i++) {
		if (mask[i]) continue;
		const ch = sentence.charAt(i);
		if (punctuation && (ch === ',' || ch === ';' || ch === ':')) {
			let next = i + 1;
			while (next < sentence.length && WHITESPACE.test(sentence.charAt(next))) next++;
			if (next === i + 1 || next >= sentence.length) continue; // "1,000", "a:b", or trailing
			out.push(sentence.slice(start, i + 1).trim());
			start = next;
			i = next - 1;
		} else if (
			starter &&
			i > start &&
			WHITESPACE.test(sentence.charAt(i - 1)) &&
			startsPhraseWord(sentence, i, start, starter)
		) {
			out.push(sentence.slice(start, i).trim());
			start = i;
		}
	}
	out.push(sentence.slice(start).trim());
	return out;
}

function startsPhraseWord(sentence: string, at: number, phraseStart: number, starter: RegExp): boolean {
	starter.lastIndex = at;
	const matched = starter.exec(sentence)?.[0].toLowerCase();
	if (!matched) return false;
	const before = sentence.slice(phraseStart, at).trim();
	if (!before) return false;
	const previousWord = before.split(/\s+/).pop()?.toLowerCase() ?? '';
	return !STARTER_BLOCKERS.has(previousWord) && !(matched === 'as' && AS_BLOCKERS.has(previousWord));
}

export const DEFAULT_PLACEHOLDERS: readonly string[] = ['XYZ', 'TBD', '___'];

/** Parse a user-typed token list, keeping case ("XYZ, TBD"). */
export function parseTokenList(input: string): string[] {
	const tokens = input
		.split(/[\s,;]+/)
		.map((t) => t.trim())
		.filter((t) => t.length > 0 && t.length <= 20);
	return [...new Set(tokens)];
}

const PLACEHOLDER_TRAIL = /^[,;:.!?)\]"'”’]*/;

/** True when `text` is just a placeholder, ignoring punctuation after it ("XYZ," counts). */
export function isPlaceholder(text: string, placeholders: readonly string[]): boolean {
	const bare = text.trim().replace(/[,;:.!?)\]"'”’]+$/, '');
	return placeholders.includes(bare);
}

/** Give each placeholder its own piece ("to XYZ of the" becomes "to", "XYZ", "of the"). Punctuation stays with it. */
export function isolatePlaceholders(pieces: readonly string[], placeholders: readonly string[]): string[] {
	if (placeholders.length === 0) return [...pieces];
	const escaped = [...placeholders]
		.sort((a, b) => b.length - a.length)
		.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${escaped.join('|')})(?![\\p{L}\\p{N}])`, 'gu');

	return pieces.flatMap((piece) => {
		const out: string[] = [];
		let start = 0;
		for (const m of piece.matchAll(re)) {
			const end = m.index + m[0].length + (PLACEHOLDER_TRAIL.exec(piece.slice(m.index + m[0].length))?.[0].length ?? 0);
			if (m.index < start) continue;
			const before = piece.slice(start, m.index).trim();
			if (before) out.push(before);
			out.push(piece.slice(m.index, end));
			start = end;
		}
		const tail = piece.slice(start).trim();
		if (tail) out.push(tail);
		return out.length > 0 ? out : [piece];
	});
}

/** Split `text` around the selection [start, end): the pieces before, inside and after. Empty parts are dropped. */
export function splitAround(text: string, start: number, end: number): { parts: string[]; middle: number } | null {
	const before = text.slice(0, start).trim();
	const inside = text.slice(start, end).trim();
	const after = text.slice(end).trim();
	if (!inside) return null;
	const parts: string[] = [];
	if (before) parts.push(before);
	const middle = parts.length;
	parts.push(inside);
	if (after) parts.push(after);
	return { parts, middle };
}

/** Matches a split mark, but not a doubled one ("~~strikethrough~~" is markdown, not a mark). */
function markRegex(mark: string): RegExp {
	const escaped = mark.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	if (mark.length !== 1) return new RegExp(escaped, 'g');
	return new RegExp(`(?<!${escaped})${escaped}(?!${escaped})`, 'g');
}

export function hasMark(text: string, mark: string): boolean {
	return mark.length > 0 && markRegex(mark).test(text);
}

const PUNCTUATION_ONLY = /^[.,;:!?…)\]"'”’]+$/;

/** Split at your marks and delete them. Punctuation left alone after a mark rejoins the piece before it. */
export function splitAtMarks(text: string, mark: string): string[] {
	if (!mark) return [text.trim()].filter(Boolean);
	const out: string[] = [];
	for (const part of text.split(markRegex(mark)).map((p) => p.trim())) {
		if (!part) continue;
		const last = out.length - 1;
		if (last >= 0 && PUNCTUATION_ONLY.test(part)) out[last] += part;
		else out.push(part);
	}
	return out;
}

export interface ExplodeOptions extends PhraseOptions {
	/** Manual split mark. Empty disables marks. */
	mark?: string;
	/** Split into phrases instead of sentences. */
	phrases: boolean;
}

/**
 * The pieces the reorder window starts from. If the text contains your split mark, the marks decide where
 * the sentences they sit in are cut (and are removed); sentences without marks stay whole. Otherwise the
 * text is split automatically into sentences, or into phrases.
 */
export function explodeText(text: string, options: ExplodeOptions): string[] {
	const mark = options.mark ?? '';
	if (hasMark(text, mark)) {
		const pieces = splitSentences(text, options.extraAbbreviations).flatMap((s) =>
			hasMark(s, mark) ? splitAtMarks(s, mark) : [s],
		);
		return options.phrases ? isolatePlaceholders(pieces, options.placeholders ?? []) : pieces;
	}
	return options.phrases ? splitPhrases(text, options) : splitSentences(text, options.extraAbbreviations);
}
