/** Paragraph-boundary detection over an array of lines. Pure functions, no Obsidian imports. */

export type LineKind = 'text' | 'blank' | 'frontmatter' | 'code' | 'heading' | 'table';

export interface LineRange {
	start: number;
	end: number;
}

export type Located = LineRange | { error: string };

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const HEADING = /^\s{0,3}#{1,6}(?:\s|$)/;
const THEMATIC_BREAK = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const TABLE_ROW = /^\s*\|/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/;
const LIST_OR_QUOTE = /^\s*(?:>|[-*+]\s|\d+[.)]\s)/;

export function lineKinds(lines: string[]): LineKind[] {
	const kinds: LineKind[] = new Array<LineKind>(lines.length).fill('text');

	let firstBody = 0;
	if (lines[0]?.trimEnd() === '---') {
		for (let i = 1; i < lines.length; i++) {
			const t = (lines[i] ?? '').trimEnd();
			if (t === '---' || t === '...') {
				for (let j = 0; j <= i; j++) kinds[j] = 'frontmatter';
				firstBody = i + 1;
				break;
			}
		}
	}

	let fence: { char: string; len: number } | null = null;
	for (let i = firstBody; i < lines.length; i++) {
		const line = lines[i] ?? '';
		const m = FENCE.exec(line);
		if (fence) {
			kinds[i] = 'code';
			const closer = m?.[1];
			if (closer && closer.startsWith(fence.char) && closer.length >= fence.len && line.trim() === closer) {
				fence = null;
			}
		} else if (m?.[1]) {
			kinds[i] = 'code';
			fence = { char: m[1].charAt(0), len: m[1].length };
		} else if (/^\s*$/.test(line) || THEMATIC_BREAK.test(line)) {
			kinds[i] = 'blank';
		} else if (HEADING.test(line)) {
			kinds[i] = 'heading';
		} else if (TABLE_ROW.test(line) || TABLE_SEPARATOR.test(line)) {
			kinds[i] = 'table';
		}
	}
	return kinds;
}

const KIND_MESSAGES: Partial<Record<LineKind, string>> = {
	frontmatter: 'Paragraph explode: skipping frontmatter.',
	code: 'Paragraph explode: skipping code blocks.',
	heading: 'Paragraph explode: skipping headings.',
	table: 'Paragraph explode: skipping tables.',
	blank: 'Paragraph explode: put the cursor in a paragraph (or select some text).',
};

/** The blank-line-delimited block around `line`, or an error message to show the user. */
export function findParagraph(lines: string[], line: number): Located {
	const kinds = lineKinds(lines);
	const here = kinds[line];
	if (here === undefined) return { error: KIND_MESSAGES.blank ?? '' };
	if (here !== 'text' && here !== 'table') return { error: KIND_MESSAGES[here] ?? '' };

	let start = line;
	while (start > 0 && isBlockLine(kinds[start - 1])) start--;
	let end = line;
	while (end < lines.length - 1 && isBlockLine(kinds[end + 1])) end++;

	for (let i = start; i <= end; i++) {
		if (kinds[i] === 'table') return { error: KIND_MESSAGES.table ?? '' };
	}
	if (LIST_OR_QUOTE.test(lines[start] ?? '')) {
		return { error: 'Paragraph explode: skipping lists and quotes.' };
	}
	return { start, end };
}

/** Validate a selection spanning lines `from..to`: one paragraph's worth of plain text. */
export function checkSelection(lines: string[], from: number, to: number): string | null {
	const kinds = lineKinds(lines);
	for (let i = from; i <= to; i++) {
		const kind = kinds[i];
		if (kind === undefined || kind === 'text') continue;
		if (kind === 'blank') {
			if (i !== from && i !== to) return 'Paragraph explode: the selection spans more than one paragraph.';
			continue;
		}
		return KIND_MESSAGES[kind] ?? null;
	}
	return null;
}

function isBlockLine(kind: LineKind | undefined): boolean {
	return kind === 'text' || kind === 'table';
}
