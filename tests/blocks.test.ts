import { describe, expect, it } from 'vitest';
import { Block, headingText, parseBlocks } from '../src/blocks';
import { KEEP_ALL, renderBlocks } from '../src/format';

const kinds = (text: string) => parseBlocks(text).map((b) => b.kind);
const roundTrip = (text: string) => renderBlocks(parseBlocks(text), KEEP_ALL, '\n');

describe('parseBlocks', () => {
	it('recognizes the basic kinds', () => {
		const text = ['# Title', '', 'A paragraph', 'on two lines.', '', '- a', '- b', '', '> quote', '', '---', '', '| a | b |', '|---|---|', '| 1 | 2 |'].join('\n');
		expect(kinds(text)).toEqual(['heading', 'text', 'item', 'item', 'quote', 'rule', 'table']);
	});
	it('reads heading levels and text', () => {
		const [h] = parseBlocks('### Hello world ###');
		expect(h?.level).toBe(3);
		expect(headingText('### Hello world ###')).toBe('Hello world');
		expect(kinds('#hashtag')).toEqual(['text']);
	});
	it('keeps nested bullets inside their parent, and splits top-level bullets', () => {
		const blocks = parseBlocks('- a\n  - a1\n    - a2\n- b\n  text\n- c');
		expect(blocks.map((b) => b.lines.length)).toEqual([3, 2, 1]);
	});
	it('keeps loose list children after a blank line, but not the next bullet', () => {
		const blocks = parseBlocks('- a\n\n  more of a\n\n- b');
		expect(blocks.map((b) => b.lines)).toEqual([['- a', '', '  more of a'], ['- b']]);
		expect(blocks[1]?.gap).toBe(true);
	});
	it('treats fenced code, including blank lines and headings inside it, as one block', () => {
		const blocks = parseBlocks('```js\n# not a heading\n\n- not a bullet\n```\nafter');
		expect(blocks.map((b) => b.kind)).toEqual(['code', 'text']);
		expect(blocks[0]?.lines).toHaveLength(5);
	});
	it('handles unclosed fences, math blocks and tables without leading pipes', () => {
		expect(kinds('```\nstill code\n- x')).toEqual(['code']);
		expect(kinds('$$\na = b\n\nc\n$$\ntext')).toEqual(['code', 'text']);
		expect(kinds('a | b\n--|--\n1 | 2')).toEqual(['table']);
	});
	it('lets bullets and headings interrupt a paragraph, but not a bare number', () => {
		expect(kinds('text\n- item')).toEqual(['text', 'item']);
		expect(kinds('text\n# Head')).toEqual(['text', 'heading']);
		expect(kinds('In\n2024. it happened')).toEqual(['text']);
	});
	it('records blank-line gaps', () => {
		const blocks = parseBlocks('# H\n- a\n\npara');
		expect(blocks.map((b) => b.gap)).toEqual([false, false, true]);
	});
	it('does not read emphasis or numbers as list markers', () => {
		expect(kinds('**bold** start\n\n*italic* start\n\n1.5 million')).toEqual(['text', 'text', 'text']);
	});
	it('numbers blocks by position', () => {
		expect(parseBlocks('a\n\nb\n\nc').map((b) => b.id)).toEqual([0, 1, 2]);
	});
});

describe('round trip with everything kept', () => {
	const sample = [
		'# Genetics',
		'Intro line directly under the heading.',
		'',
		'## Heritability',
		'- Twin studies [[Smith 2020|Smith]] suggest **high** heritability',
		'  - estimated at 50-90%[^1]',
		'- Family studies',
		'',
		'> [!note] A note',
		'> body',
		'',
		'```python',
		'x = 1',
		'',
		'y = 2',
		'```',
		'',
		'| a | b |',
		'|---|---|',
		'| 1 | 2 |',
		'',
		'---',
		'',
		'### Detail',
		'A paragraph with `code` and *italics*.',
		'[^1]: Footnote text.',
	].join('\n');

	it('writes the original back unchanged', () => {
		expect(roundTrip(sample)).toBe(sample);
	});
	it('collapses runs of blank lines to one and ignores trailing blanks', () => {
		expect(roundTrip('a\n\n\n\nb\n\n')).toBe('a\n\nb');
	});
	it('keeps CRLF-free output and honors the requested line ending', () => {
		expect(renderBlocks(parseBlocks('a\n\nb'), KEEP_ALL, '\r\n')).toBe('a\r\n\r\nb');
	});
	it('uses the level on the block, so a changed level is written', () => {
		const blocks: Block[] = parseBlocks('## Two\ntext').map((b) => (b.kind === 'heading' ? { ...b, level: 3 } : b));
		expect(renderBlocks(blocks, KEEP_ALL, '\n')).toBe('### Two\ntext');
	});
});
