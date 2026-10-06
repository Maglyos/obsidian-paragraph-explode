import { describe, expect, it } from 'vitest';
import { checkSelection, findParagraph } from '../src/paragraph';

const doc = (s: string) => s.split('\n');

describe('findParagraph', () => {
	const lines = doc(['# Title', '', 'First line.', 'Second line.', '', 'Other para.'].join('\n'));

	it('finds blank-line-delimited blocks from any line in them', () => {
		expect(findParagraph(lines, 2)).toEqual({ start: 2, end: 3 });
		expect(findParagraph(lines, 3)).toEqual({ start: 2, end: 3 });
		expect(findParagraph(lines, 5)).toEqual({ start: 5, end: 5 });
	});
	it('rejects headings and blank lines', () => {
		expect(findParagraph(lines, 0)).toHaveProperty('error');
		expect(findParagraph(lines, 1)).toHaveProperty('error');
	});
	it('treats a heading directly above text as a boundary', () => {
		expect(findParagraph(doc('# H\nBody one. Body two.'), 1)).toEqual({ start: 1, end: 1 });
	});
	it('rejects frontmatter', () => {
		const l = doc('---\ntitle: x. y.\n---\n\nBody.');
		expect(findParagraph(l, 1)).toHaveProperty('error');
		expect(findParagraph(l, 4)).toEqual({ start: 4, end: 4 });
	});
	it('does not treat an unclosed leading --- as frontmatter', () => {
		expect(findParagraph(doc('---\nText here. More.'), 1)).toEqual({ start: 1, end: 1 });
	});
	it('rejects fenced code, including ~~~ and longer fences', () => {
		const l = doc('Before.\n\n```js\nlet a = 1. 2;\n\nmore\n```\n\nAfter.');
		expect(findParagraph(l, 3)).toHaveProperty('error');
		expect(findParagraph(l, 4)).toHaveProperty('error');
		expect(findParagraph(l, 8)).toEqual({ start: 8, end: 8 });
		const l2 = doc('~~~\ncode\n~~~');
		expect(findParagraph(l2, 1)).toHaveProperty('error');
		const l3 = doc('````\n```\ninner\n```\n````\n\nText.');
		expect(findParagraph(l3, 2)).toHaveProperty('error');
		expect(findParagraph(l3, 6)).toEqual({ start: 6, end: 6 });
	});
	it('rejects tables, with or without leading pipes', () => {
		expect(findParagraph(doc('| a | b |\n|---|---|\n| 1 | 2 |'), 2)).toHaveProperty('error');
		expect(findParagraph(doc('a | b\n--|--\n1 | 2'), 0)).toHaveProperty('error');
	});
	it('rejects lists and quotes', () => {
		expect(findParagraph(doc('- item one. item two.'), 0)).toHaveProperty('error');
		expect(findParagraph(doc('1. item one. item two.'), 0)).toHaveProperty('error');
		expect(findParagraph(doc('> quoted. text.'), 0)).toHaveProperty('error');
	});
	it('does not mistake emphasis for a list', () => {
		expect(findParagraph(doc('*Emphasis.* Next sentence.'), 0)).toEqual({ start: 0, end: 0 });
	});
});

describe('checkSelection', () => {
	it('accepts plain text, tolerating blank edge lines', () => {
		expect(checkSelection(doc('a\nb'), 0, 1)).toBeNull();
		expect(checkSelection(doc('a\nb\n'), 0, 2)).toBeNull();
	});
	it('rejects multi-paragraph, code, and headings', () => {
		expect(checkSelection(doc('a\n\nb'), 0, 2)).toMatch(/more than one/);
		expect(checkSelection(doc('```\nx\n```'), 0, 2)).toMatch(/code/);
		expect(checkSelection(doc('# h'), 0, 0)).toMatch(/heading/);
	});
});
