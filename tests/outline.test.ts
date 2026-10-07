import { describe, expect, it } from 'vitest';
import { clampLevels, group, insertPiece, Item, moveItem, render, setHeading, shiftLevels, ungroup } from '../src/outline';

const item = (pieces: number[], level = 0): Item => ({ pieces, level });
const P = ['A.', 'B.', 'C.', 'D.'];

describe('clampLevels', () => {
	it('forces the first bullet to 0 and caps depth at 6', () => {
		expect(clampLevels([item([0], 2), item([1], 5), item([2], 0), item([3], 9)]).map((i) => i.level)).toEqual([0, 5, 0, 6]);
	});
	it('resets to level 0 for a bullet that follows a heading', () => {
		const items = clampLevels([item([0]), { pieces: [1], level: 3, heading: 2 }, item([2], 2), item([3], 2)]);
		expect(items.map((i) => i.level)).toEqual([0, 0, 0, 2]);
	});
});

describe('group / ungroup', () => {
	it('merges items into one at the first position', () => {
		const r = group([item([0]), item([1]), item([2]), item([3])], [1, 2]);
		expect(r.items).toEqual([item([0]), item([1, 2]), item([3])]);
		expect(r.index).toBe(1);
	});
	it('ignores a single index', () => {
		const items = [item([0]), item([1])];
		expect(group(items, [1]).items).toBe(items);
	});
	it('ungroups back into single-piece items and reports their indices', () => {
		const r = ungroup([item([0]), item([1, 2], 1), item([3])], [1]);
		expect(r.items).toEqual([item([0]), item([1], 1), item([2], 1), item([3])]);
		expect(r.indices).toEqual([1, 2]);
	});
});

describe('shiftLevels', () => {
	it('indents several levels deep, but never the first bullet', () => {
		const items = [item([0]), item([1]), item([2])];
		expect(shiftLevels(items, [0], 1).map((i) => i.level)).toEqual([0, 0, 0]);
		let deep = items;
		for (let n = 0; n < 3; n++) deep = shiftLevels(deep, [1], 1);
		expect(deep.map((i) => i.level)).toEqual([0, 3, 0]);
		for (let n = 0; n < 9; n++) deep = shiftLevels(deep, [1], 1);
		expect(deep[1]?.level).toBe(6);
	});
	it('does not indent headings', () => {
		const items = setHeading([item([0]), item([1])], [1], 2);
		expect(shiftLevels(items, [1], 1)[1]).toEqual({ pieces: [1], level: 0, heading: 2 });
	});
	it('indents a selected block together', () => {
		expect(shiftLevels([item([0]), item([1]), item([2])], [1, 2], 1).map((i) => i.level)).toEqual([0, 1, 1]);
	});
	it('outdents one level at a time, never below 0', () => {
		expect(shiftLevels([item([0]), item([1], 2), item([2], 2)], [1], -1).map((i) => i.level)).toEqual([0, 1, 2]);
		expect(shiftLevels([item([0]), item([1], 0)], [1], -1).map((i) => i.level)).toEqual([0, 0]);
	});
});

describe('headings', () => {
	it('sets and clears headings', () => {
		const h = setHeading([item([0]), item([1])], [0], 2);
		expect(h[0]).toEqual({ pieces: [0], level: 0, heading: 2 });
		expect(setHeading(h, [0], null)[0]).toEqual({ pieces: [0], level: 0 });
	});
	it('keeps the heading on the first piece when ungrouping', () => {
		const r = ungroup([{ pieces: [0, 1], level: 0, heading: 1 }], [0]);
		expect(r.items).toEqual([{ pieces: [0], level: 0, heading: 1 }, item([1])]);
	});
	it('keeps the first item heading when grouping', () => {
		const r = group([{ pieces: [0], level: 0, heading: 3 }, item([1])], [0, 1]);
		expect(r.items).toEqual([{ pieces: [0, 1], level: 0, heading: 3 }]);
	});
});

describe('moveItem / insertPiece', () => {
	it('moves to a target index of the resulting list', () => {
		const items = [item([0]), item([1]), item([2])];
		expect(moveItem(items, 0, 2).map((i) => i.pieces[0])).toEqual([1, 2, 0]);
		expect(moveItem(items, 2, 0).map((i) => i.pieces[0])).toEqual([2, 0, 1]);
	});
	it('inserts a piece at the level of the item above', () => {
		const r = insertPiece([item([0]), item([1], 1)], 2, 2);
		expect(r[2]).toEqual(item([2], 1));
		expect(insertPiece([item([0])], 0, 1)[0]).toEqual(item([1], 0));
	});
});

describe('render', () => {
	const items = [item([0, 1]), item([2], 1), item([3])];
	it('paragraph joins every piece with spaces', () => {
		expect(render(items, P, 'paragraph', '\n')).toBe('A. B. C. D.');
	});
	it('sentence puts one piece per line, using the given eol', () => {
		expect(render(items, P, 'sentence', '\r\n')).toBe('A.\r\nB.\r\nC.\r\nD.');
	});
	it('notes makes bullets with a tab per level and grouped pieces on one bullet', () => {
		expect(render(items, P, 'notes', '\n')).toBe('- A. B.\n\t- C.\n- D.');
	});
	it('renders headings as #s and resets bullets under them', () => {
		const withHeading: Item[] = [
			{ pieces: [0], level: 0, heading: 2 },
			item([1]),
			item([2], 2),
			{ pieces: [3], level: 0, heading: 1 },
		];
		expect(render(withHeading, P, 'notes', '\n')).toBe('## A.\n- B.\n\t\t- C.\n# D.');
	});
	it('ignores headings outside notes mode', () => {
		expect(render([{ pieces: [0], level: 0, heading: 2 }, item([1])], P, 'paragraph', '\n')).toBe('A. B.');
	});
	it('renders nothing for no items', () => {
		expect(render([], P, 'notes', '\n')).toBe('');
	});
});
