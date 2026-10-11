/** Splits markdown notes into blocks (headings, paragraphs, bullets, ...). Pure functions, no Obsidian imports. */

export type BlockKind = 'heading' | 'text' | 'item' | 'quote' | 'code' | 'table' | 'rule';

export interface Block {
	/** Position in the original text. Stable while blocks are moved, so selections can follow them. */
	id: number;
	kind: BlockKind;
	/** The original lines, verbatim. */
	lines: string[];
	/** 1-6 for headings, 0 otherwise. */
	level: number;
	/** A blank line came before this block in the original. */
	gap: boolean;
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const HEADING = /^\s{0,3}(#{1,6})(?:\s+(.*))?$/;
const RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const ITEM = /^(\s*)([-*+]|\d+[.)])(?:\s+|$)/;
const PARAGRAPH_INTERRUPTING_ITEM = /^\s*(?:[-*+]|1[.)])(?:\s+|$)/;
const QUOTE = /^\s{0,3}>/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/;
const BLANK = /^\s*$/;

/** Width of the leading whitespace, counting a tab as four spaces. */
export function indentWidth(line: string): number {
	let width = 0;
	for (const ch of line) {
		if (ch === ' ') width++;
		else if (ch === '\t') width += 4;
		else break;
	}
	return width;
}

/** The text of an ATX heading line, without the # marks or closing marks. */
export function headingText(line: string): string {
	const match = HEADING.exec(line);
	return (match?.[2] ?? '').replace(/\s+#+\s*$/, '').trim();
}

function startsTable(line: string, next: string | undefined): boolean {
	return /^\s*\|/.test(line) || (line.includes('|') && next !== undefined && TABLE_SEPARATOR.test(next));
}

function startsMath(line: string): boolean {
	const t = line.trim();
	return t.startsWith('$$') && !(t.length > 3 && t.endsWith('$$'));
}

function startsBlock(line: string, next: string | undefined): boolean {
	return (
		FENCE.test(line) ||
		HEADING.test(line) ||
		RULE.test(line) ||
		PARAGRAPH_INTERRUPTING_ITEM.test(line) ||
		QUOTE.test(line) ||
		startsTable(line, next) ||
		startsMath(line)
	);
}

export function parseBlocks(text: string): Block[] {
	const lines = text.split(/\r?\n/);
	const n = lines.length;
	const blocks: Block[] = [];
	let gap = false;
	let i = 0;

	const push = (kind: BlockKind, chunk: string[], level = 0) => {
		blocks.push({ id: blocks.length, kind, lines: chunk, level, gap: blocks.length > 0 && gap });
		gap = false;
	};

	while (i < n) {
		const line = lines[i] ?? '';
		if (BLANK.test(line)) {
			gap = true;
			i++;
			continue;
		}

		const fence = FENCE.exec(line)?.[1];
		if (fence) {
			const chunk = [line];
			i++;
			while (i < n) {
				const cur = lines[i] ?? '';
				chunk.push(cur);
				i++;
				const t = cur.trim();
				if (t.startsWith(fence.charAt(0)) && t.length >= fence.length && t === t.charAt(0).repeat(t.length)) break;
			}
			push('code', chunk);
			continue;
		}

		if (startsMath(line)) {
			const chunk = [line];
			i++;
			while (i < n) {
				const cur = lines[i] ?? '';
				chunk.push(cur);
				i++;
				if (cur.includes('$$')) break;
			}
			push('code', chunk);
			continue;
		}

		const heading = HEADING.exec(line);
		if (heading?.[1]) {
			push('heading', [line], heading[1].length);
			i++;
			continue;
		}

		if (RULE.test(line)) {
			push('rule', [line]);
			i++;
			continue;
		}

		if (startsTable(line, lines[i + 1])) {
			const chunk = [line];
			i++;
			while (i < n && !BLANK.test(lines[i] ?? '') && (lines[i] ?? '').includes('|')) {
				chunk.push(lines[i] ?? '');
				i++;
			}
			push('table', chunk);
			continue;
		}

		if (QUOTE.test(line)) {
			const chunk = [line];
			i++;
			while (i < n && QUOTE.test(lines[i] ?? '')) {
				chunk.push(lines[i] ?? '');
				i++;
			}
			push('quote', chunk);
			continue;
		}

		if (ITEM.test(line)) {
			const base = indentWidth(line);
			const chunk = [line];
			i++;
			while (i < n) {
				const cur = lines[i] ?? '';
				if (BLANK.test(cur)) {
					let j = i;
					while (j < n && BLANK.test(lines[j] ?? '')) j++;
					const after = lines[j];
					if (after !== undefined && indentWidth(after) > base) {
						chunk.push(...lines.slice(i, j));
						i = j;
						continue;
					}
					break;
				}
				if (indentWidth(cur) > base) {
					chunk.push(cur);
					i++;
					continue;
				}
				if (ITEM.test(cur) || startsBlock(cur, lines[i + 1])) break;
				chunk.push(cur); // lazy continuation of the item's text
				i++;
			}
			push('item', chunk);
			continue;
		}

		const chunk = [line];
		i++;
		while (i < n && !BLANK.test(lines[i] ?? '') && !startsBlock(lines[i] ?? '', lines[i + 1])) {
			chunk.push(lines[i] ?? '');
			i++;
		}
		push('text', chunk);
	}
	return blocks;
}
