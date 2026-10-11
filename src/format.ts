/** Controls how much markdown formatting survives when blocks are written back. Pure functions. */

import { Block, headingText } from './blocks';

/** true = keep that kind of formatting; false = reduce it to plain text. */
export interface FormatKeep {
	headings: boolean;
	lists: boolean;
	emphasis: boolean;
	links: boolean;
	code: boolean;
	quotes: boolean;
	tables: boolean;
	footnotes: boolean;
}

export type FormatMode = 'all' | 'selected' | 'none';

export const KEEP_ALL: FormatKeep = {
	headings: true,
	lists: true,
	emphasis: true,
	links: true,
	code: true,
	quotes: true,
	tables: true,
	footnotes: true,
};

export const KEEP_NONE: FormatKeep = {
	headings: false,
	lists: false,
	emphasis: false,
	links: false,
	code: false,
	quotes: false,
	tables: false,
	footnotes: false,
};

export const FORMAT_LABELS: Record<keyof FormatKeep, string> = {
	headings: 'Headings and dividers',
	lists: 'Bullets and numbers',
	emphasis: 'Bold, italic, highlight',
	links: 'Links',
	code: 'Code and math',
	quotes: 'Quotes and callouts',
	tables: 'Tables',
	footnotes: 'Footnotes and citations',
};

export function resolveKeep(mode: FormatMode, selected: FormatKeep): FormatKeep {
	return mode === 'all' ? KEEP_ALL : mode === 'none' ? KEEP_NONE : selected;
}

const INLINE_KEYS: (keyof FormatKeep)[] = ['emphasis', 'links', 'code', 'footnotes'];

function inlineKept(keep: FormatKeep): boolean {
	return INLINE_KEYS.every((k) => keep[k]);
}

// ---- inline ------------------------------------------------------------------------------------------------------

const CODE_SPAN = /(`+)(?:(?!\1)[\s\S])+\1/g;
const CODE_TOKEN = /\uE000(\d+)\uE001/g;

/** Strip inline formatting that `keep` turns off. Code spans are protected from every other rule. */
export function formatInline(text: string, keep: FormatKeep): string {
	if (inlineKept(keep)) return text;

	const codes: string[] = [];
	let s = text.replace(CODE_SPAN, (m) => {
		codes.push(m);
		return `\uE000${codes.length - 1}\uE001`;
	});

	if (!keep.footnotes) {
		s = s
			.replace(/\^\[[^\]]*\]/g, '')
			.replace(/[ \t]?\[\^[^\]\s]+\]/g, '')
			.replace(/[ \t]?\[@[^\]]*\]/g, '');
	}

	if (!keep.links) {
		s = s
			.replace(/!\[\[([^\]|]*)(?:\\?\|([^\]]*))?\]\]/g, (_m, target: string, alias?: string) => alias ?? target.split('#')[0] ?? target)
			.replace(/\[\[([^\]|]*)(?:\\?\|([^\]]*))?\]\]/g, (_m, target: string, alias?: string) => {
				if (alias !== undefined) return alias;
				if (target.startsWith('#')) return target.slice(1).replace(/^\^/, '');
				return target.split('#')[0] || target;
			})
			.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
			.replace(/\[([^\]]+)\]\((?:[^()]|\([^)]*\))*\)/g, '$1')
			.replace(/<((?:https?|ftp):\/\/[^>\s]+)>/g, '$1');
	}

	if (!keep.emphasis) {
		s = s
			.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
			.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '$1')
			.replace(/==(?=\S)([\s\S]*?\S)==/g, '$1')
			.replace(/(?<![\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/g, '$1')
			.replace(/(?<![\w_])_(?=\S)([^_\n]*?\S)_(?![\w_])/g, '$1');
	}

	return s.replace(CODE_TOKEN, (_m, n: string) => {
		const code = codes[Number(n)] ?? '';
		return keep.code ? code : code.replace(/^(`+)\s?([\s\S]*?)\s?\1$/, '$2');
	});
}

// ---- blocks ------------------------------------------------------------------------------------------------------

const LIST_LINE = /^(\s*)((?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)?(.*)$/;
const QUOTE_LINE = /^(\s*)((?:>\s?)+)(.*)$/;
const CALLOUT_TAG = /^\[![\w-]+\][+-]?\s*/;
const FOOTNOTE_DEFINITION = /^\[\^[^\]]+\]:\s*/;
const CLOSING_FENCE = /^\s*(?:`{3,}|~{3,}|\$\$)\s*$/;
const TABLE_DELIMITER_ROW = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const UNESCAPED_PIPE = /(?<!\\)\|/;

/** The lines that represent `block` under `keep`. Empty when the block disappears entirely. */
export function formatBlock(block: Block, keep: FormatKeep): string[] {
	const lines = block.lines;
	switch (block.kind) {
		case 'heading': {
			const first = lines[0] ?? '';
			if (keep.headings) {
				if (inlineKept(keep)) return [first.replace(/^(\s{0,3})#{1,6}/, `$1${'#'.repeat(block.level)}`)];
				return [`${'#'.repeat(block.level)} ${formatInline(headingText(first), keep)}`];
			}
			const text = formatInline(headingText(first), keep);
			return text ? [text] : [];
		}
		case 'rule':
			return keep.headings ? lines : [];
		case 'code':
			if (keep.code) return lines;
			return lines.filter((l, i) => i > 0 && !(i === lines.length - 1 && lines.length > 1 && CLOSING_FENCE.test(l)));
		case 'table':
			return formatTable(lines, keep);
		case 'quote':
			return formatQuote(lines, keep);
		case 'item':
			return trimBlank(
				lines.flatMap((line) => {
					const m = LIST_LINE.exec(line);
					const indent = m?.[1] ?? '';
					const marker = m?.[2] ?? '';
					const rest = formatInline(m?.[3] ?? line, keep);
					if (keep.lists) return [indent + marker + rest];
					return rest.trim() ? [rest] : [];
				}),
			);
		default:
			return lines.flatMap((line) => {
				const stripped = !keep.footnotes ? line.replace(FOOTNOTE_DEFINITION, '') : line;
				const out = formatInline(stripped, keep);
				return out.trim() || !stripped.trim() ? [out] : [];
			});
	}
}

function formatQuote(lines: string[], keep: FormatKeep): string[] {
	const out = lines.map((line, i) => {
		const m = QUOTE_LINE.exec(line);
		const indent = m?.[1] ?? '';
		const marks = m?.[2] ?? '';
		let rest = m?.[3] ?? '';
		if (!keep.quotes && i === 0) rest = rest.replace(CALLOUT_TAG, '');
		rest = formatInline(rest, keep);
		return keep.quotes ? indent + marks + rest : rest;
	});
	return keep.quotes ? out : trimBlank(out);
}

function formatTable(lines: string[], keep: FormatKeep): string[] {
	if (keep.tables) return lines.map((line) => formatInline(line, keep));
	return lines
		.filter((line) => !TABLE_DELIMITER_ROW.test(line))
		.map((line) => {
			const cells = line.trim().split(UNESCAPED_PIPE).map((c) => c.trim());
			if (cells[0] === '') cells.shift();
			if (cells[cells.length - 1] === '') cells.pop();
			return cells.map((c) => formatInline(c, keep)).filter(Boolean).join('; ');
		})
		.filter(Boolean);
}

function trimBlank(lines: string[]): string[] {
	let start = 0;
	let end = lines.length;
	while (start < end && !(lines[start] ?? '').trim()) start++;
	while (end > start && !(lines[end - 1] ?? '').trim()) end--;
	return lines.slice(start, end);
}

// ---- joining -----------------------------------------------------------------------------------------------------

type Layout = 'heading' | 'item' | 'text' | 'other';

/** How a block behaves for spacing, after formatting: stripped headings and bullets become ordinary text. */
function layoutOf(block: Block, keep: FormatKeep): Layout {
	if (block.kind === 'heading') return keep.headings ? 'heading' : 'text';
	if (block.kind === 'item') return keep.lists ? 'item' : 'text';
	if (block.kind === 'text') return 'text';
	return 'other';
}

/** A tight join (no blank line) is only used where markdown reads it the same way as the original did. */
function mayTouch(previous: Layout, current: Layout): boolean {
	return current === 'heading' || previous === 'heading' || (current === 'item' && (previous === 'item' || previous === 'text'));
}

/**
 * The markdown for `blocks` in their current order. A block stays tight against the one above only when that one
 * is still its original predecessor and the join is safe; every other pair gets one blank line.
 */
export function renderBlocks(blocks: readonly Block[], keep: FormatKeep, eol: string): string {
	const out: string[] = [];
	let previous: { layout: Layout; id: number } | null = null;
	for (const block of blocks) {
		const lines = formatBlock(block, keep);
		if (lines.length === 0) continue;
		const layout = layoutOf(block, keep);
		if (previous !== null) {
			const stillTogether = !block.gap && previous.id === block.id - 1 && mayTouch(previous.layout, layout);
			if (!stillTogether) out.push('');
		}
		out.push(...lines);
		previous = { layout, id: block.id };
	}
	return out.join(eol);
}
