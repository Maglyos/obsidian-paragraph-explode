import { describe, expect, it } from 'vitest';
import { parseBlocks } from '../src/blocks';
import { KEEP_ALL, renderBlocks } from '../src/format';
import { depths, levelJumps, moveBlocks, sameOrder, sectionEnd, shiftHeadings } from '../src/notes';

const doc = [
	'# A',
	'a text',
	'## A1',
	'a1 text',
	'## A2',
	'a2 text',
	'# B',
	'b text',
	'### B-deep',
	'deep text',
].join('\n\n');
const blocks = parseBlocks(doc);
const titles = (list: ReturnType<typeof parseBlocks>) => list.map((b) => b.lines[0]?.replace(/^#+ /, '')).join(',');

describe('sections', () => {
	it('ends a section at the next heading of the same or higher level', () => {
		expect(sectionEnd(blocks, 0)).toBe(6); // # A covers A1 and A2
		expect(sectionEnd(blocks, 2)).toBe(4); // ## A1
		expect(sectionEnd(blocks, 6)).toBe(10); // # B
		expect(sectionEnd(blocks, 1)).toBe(2); // plain text is a section of one
	});
	it('computes depth and flags skipped levels', () => {
		expect(depths(blocks)).toEqual([0, 1, 1, 2, 1, 2, 0, 1, 1, 2]);
		expect(levelJumps(blocks)).toEqual([false, false, false, false, false, false, false, false, true, false]);
	});
});

describe('moveBlocks', () => {
	it('moves a heading together with its whole section', () => {
		const moved = moveBlocks(blocks, [6], 0); // # B to the front
		expect(titles(moved)).toBe('B,b text,B-deep,deep text,A,a text,A1,a1 text,A2,a2 text');
	});
	it('moves a subsection within its parent', () => {
		const moved = moveBlocks(blocks, [4], 2); // ## A2 before ## A1
		expect(titles(moved)).toBe('A,a text,A2,a2 text,A1,a1 text,B,b text,B-deep,deep text');
	});
	it('moves a plain block into another section', () => {
		const moved = moveBlocks(blocks, [1], 8);
		expect(titles(moved)).toBe('A,A1,a1 text,A2,a2 text,B,b text,a text,B-deep,deep text');
	});
	it('moves several selections together, in their original order', () => {
		const moved = moveBlocks(blocks, [3, 1], 10);
		expect(titles(moved)).toBe('A,A1,A2,a2 text,B,b text,B-deep,deep text,a text,a1 text');
	});
	it('does nothing when dropped inside or next to itself', () => {
		for (const gap of [0, 1]) expect(sameOrder(moveBlocks(blocks, [0], gap), blocks)).toBe(true);
		expect(sameOrder(moveBlocks(blocks, [0], 3), blocks)).toBe(true); // inside its own section
		expect(sameOrder(moveBlocks(blocks, [6], 6), blocks)).toBe(true);
		expect(sameOrder(moveBlocks(blocks, [6], 10), blocks)).toBe(true);
	});
	it('absorbs a selected child when its heading is also selected', () => {
		expect(titles(moveBlocks(blocks, [6, 7], 0))).toBe('B,b text,B-deep,deep text,A,a text,A1,a1 text,A2,a2 text');
	});
});

describe('shiftHeadings', () => {
	it('lowers a heading and the headings inside its section together', () => {
		const shifted = shiftHeadings(blocks, [6], 1);
		expect(renderBlocks(shifted, KEEP_ALL, '\n')).toContain('## B\n\nb text\n\n#### B-deep');
		expect(renderBlocks(shifted, KEEP_ALL, '\n')).toContain('# A');
	});
	it('refuses to go past H1 or H6', () => {
		expect(shiftHeadings(blocks, [0], -1).every((b, i) => b === blocks[i])).toBe(true);
		const six = parseBlocks('###### x');
		expect(shiftHeadings(six, [0], 1)[0]).toBe(six[0]);
	});
	it('ignores non-headings', () => {
		expect(shiftHeadings(blocks, [1], 1).every((b, i) => b === blocks[i])).toBe(true);
	});
});

describe('reorganizing a page end to end', () => {
	it('writes the moved sections with sensible spacing', () => {
		const page = '# One\n- a\n- b\n\n# Two\ntext\n\n# Three';
		const parsed = parseBlocks(page);
		const out = renderBlocks(moveBlocks(parsed, [3], 0), KEEP_ALL, '\n');
		expect(out).toBe('# Two\ntext\n\n# One\n- a\n- b\n\n# Three');
	});
	it('never lets a moved paragraph merge into a list above it', () => {
		const parsed = parseBlocks('- a\n- b\n\nplain');
		const out = renderBlocks(moveBlocks(parsed, [2], 1), KEEP_ALL, '\n');
		expect(out).toBe('- a\n\nplain\n\n- b');
	});
});
