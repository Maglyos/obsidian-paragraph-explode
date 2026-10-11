import { describe, expect, it } from 'vitest';
import { parseBlocks } from '../src/blocks';
import { FormatKeep, formatInline, KEEP_ALL, KEEP_NONE, renderBlocks, resolveKeep } from '../src/format';

const only = (k: Partial<FormatKeep>): FormatKeep => ({ ...KEEP_NONE, ...k });
const plain = (text: string, keep: FormatKeep = KEEP_NONE) => renderBlocks(parseBlocks(text), keep, '\n');

describe('formatInline', () => {
	it('keeps everything when asked', () => {
		const s = '**b** *i* ==h== ~~s~~ [[w|x]] [l](u) `c` [^1] [@k]';
		expect(formatInline(s, KEEP_ALL)).toBe(s);
	});
	it('strips emphasis, including nested and mixed', () => {
		expect(formatInline('**bold** and *it* and __b__ and _i_ and ==h== and ~~s~~', KEEP_NONE)).toBe('bold and it and b and i and h and s');
		expect(formatInline('***both***', KEEP_NONE)).toBe('both');
	});
	it('leaves math, intraword underscores and stray asterisks alone', () => {
		expect(formatInline('snake_case_name and 2*3*4 and a * b * c', KEEP_NONE)).toBe('snake_case_name and 2*3*4 and a * b * c');
	});
	it('strips links to their text', () => {
		expect(formatInline('[[Page]] [[Page|alias]] [[Page#Head]] [[#Local]] [t](http://x.org/a_(b))', KEEP_NONE)).toBe('Page alias Page Local t');
		expect(formatInline('![[img.png]] ![alt](a.png) <https://x.org>', KEEP_NONE)).toBe('img.png alt https://x.org');
	});
	it('strips footnotes and citations, with the space before them', () => {
		expect(formatInline('Claim [@smith2020, p. 4]. Next.[^1] More^[inline note] end', KEEP_NONE)).toBe('Claim. Next. More end');
	});
	it('protects code spans from other rules, and unwraps them when code is not kept', () => {
		expect(formatInline('`**not bold**` and **bold**', only({ code: true }))).toBe('`**not bold**` and bold');
		expect(formatInline('`**x**` `` a`b ``', KEEP_NONE)).toBe('**x** a`b');
	});
	it('strips only what is turned off', () => {
		const s = '**b** [[w]] [^1]';
		expect(formatInline(s, { ...KEEP_ALL, emphasis: false })).toBe('b [[w]] [^1]');
		expect(formatInline(s, { ...KEEP_ALL, links: false })).toBe('**b** w [^1]');
		expect(formatInline(s, { ...KEEP_ALL, footnotes: false })).toBe('**b** [[w]]');
	});
});

describe('block formatting', () => {
	it('headings: kept, or reduced to a plain line', () => {
		expect(plain('## Big **idea**', only({ headings: true }))).toBe('## Big **idea**'.replace('**idea**', 'idea'));
		expect(plain('## Big **idea**', only({ headings: true, emphasis: true }))).toBe('## Big **idea**');
		expect(plain('## Big idea')).toBe('Big idea');
	});
	it('bullets: kept with nesting, or flattened to separate lines', () => {
		const text = '- a\n  - [ ] b **x**\n1. c';
		expect(plain(text, only({ lists: true, emphasis: true }))).toBe('- a\n  - [ ] b **x**\n1. c');
		expect(plain(text)).toBe('a\nb x\n\nc');
	});
	it('quotes and callouts: markers and callout titles are removed', () => {
		expect(plain('> [!note]- Title here\n> body *text*')).toBe('Title here\nbody text');
		expect(plain('> [!tip]\n> only body')).toBe('only body');
		expect(plain('> q', only({ quotes: true }))).toBe('> q');
	});
	it('tables: delimiter row dropped, cells joined', () => {
		expect(plain('| a | b |\n|---|---|\n| **1** | [[x\\|y]] |')).toBe('a; b\n1; y');
		expect(plain('| a |\n|---|\n| 1 |', only({ tables: true }))).toBe('| a |\n|---|\n| 1 |');
	});
	it('code: fences removed but the content is kept untouched', () => {
		expect(plain('```py\n**x**\n```')).toBe('**x**');
		expect(plain('$$\na=b\n$$')).toBe('a=b');
		expect(plain('```\nx\n```', only({ code: true }))).toBe('```\nx\n```');
	});
	it('dividers go with headings', () => {
		expect(plain('a\n\n---\n\nb')).toBe('a\n\nb');
		expect(plain('a\n\n---\n\nb', only({ headings: true }))).toBe('a\n\n---\n\nb');
	});
	it('footnote definitions lose their label when footnotes are not kept', () => {
		expect(plain('[^1]: The note text.')).toBe('The note text.');
	});
	it('plain text puts a blank line between everything, so nothing runs together', () => {
		expect(plain('# H\n- a\n- b\n\ntext')).toBe('H\n\na\n\nb\n\ntext');
	});
});

describe('resolveKeep', () => {
	it('maps modes to keep sets', () => {
		const chosen = only({ links: true });
		expect(resolveKeep('all', chosen)).toBe(KEEP_ALL);
		expect(resolveKeep('none', chosen)).toBe(KEEP_NONE);
		expect(resolveKeep('selected', chosen)).toBe(chosen);
	});
});
