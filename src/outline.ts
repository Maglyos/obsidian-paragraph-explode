/** Outline model for the reorder window. Pure functions, no Obsidian imports. */

export type Mode = 'paragraph' | 'sentence' | 'notes';

/** One output unit: a bullet in notes mode. `pieces` are indices into the exploded pieces. */
export interface Item {
	pieces: number[];
	/** Bullet depth, 0 to MAX_LEVEL. Always 0 for headings. */
	level: number;
	/** Notes mode: render as a markdown heading of this level (1-6) instead of a bullet. */
	heading?: number;
}

export const MAX_LEVEL = 6;

/**
 * Make levels valid. Headings are level 0. A bullet that starts the list or follows a heading is level 0
 * (a tab-indented first bullet would render as a code block); every other bullet may be 0 to MAX_LEVEL.
 */
export function clampLevels(items: Item[]): Item[] {
	let afterBreak = true;
	return items.map((item) => {
		const level = item.heading || afterBreak ? 0 : Math.max(0, Math.min(item.level, MAX_LEVEL));
		afterBreak = item.heading !== undefined;
		return { ...item, level };
	});
}

const sorted = (indices: number[]) => [...new Set(indices)].filter((i) => i >= 0).sort((a, b) => a - b);

/** Merge the items at `indices` into one at the first index's position. Returns the new item index. */
export function group(items: Item[], indices: number[]): { items: Item[]; index: number } {
	const picked = sorted(indices).filter((i) => i < items.length);
	const first = picked[0];
	if (first === undefined || picked.length < 2) return { items, index: first ?? 0 };
	const chosen = new Set(picked);
	const merged: Item = { ...items[first], pieces: picked.flatMap((i) => items[i]?.pieces ?? []), level: items[first]?.level ?? 0 };
	const out: Item[] = [];
	items.forEach((item, i) => {
		if (i === first) out.push(merged);
		else if (!chosen.has(i)) out.push(item);
	});
	return { items: clampLevels(out), index: first };
}

/** Split the items at `indices` into one item per piece. Returns the new items and the indices they now occupy. */
export function ungroup(items: Item[], indices: number[]): { items: Item[]; indices: number[] } {
	const chosen = new Set(indices);
	const out: Item[] = [];
	const spread: number[] = [];
	items.forEach((item, i) => {
		if (chosen.has(i) && item.pieces.length > 1) {
			item.pieces.forEach((piece, n) => {
				spread.push(out.length);
				out.push(n === 0 ? { ...item, pieces: [piece] } : { pieces: [piece], level: item.level });
			});
		} else {
			if (chosen.has(i)) spread.push(out.length);
			out.push(item);
		}
	});
	return { items: out, indices: spread };
}

/** Indent (+1) or outdent (-1) the items at `indices`. */
export function shiftLevels(items: Item[], indices: number[], delta: number): Item[] {
	const chosen = new Set(indices);
	return clampLevels(
		items.map((item, i) => (chosen.has(i) && !item.heading ? { ...item, level: item.level + delta } : item)),
	);
}

/** Make the items at `indices` headings of `level` (1-6), or plain bullets when `level` is null. */
export function setHeading(items: Item[], indices: number[], level: number | null): Item[] {
	const chosen = new Set(indices);
	return clampLevels(
		items.map((item, i) => {
			if (!chosen.has(i)) return item;
			const { heading: _old, ...rest } = item;
			return level === null ? rest : { ...rest, heading: level };
		}),
	);
}

/** Move the item at `from` so it ends up at index `to` of the resulting list. */
export function moveItem(items: Item[], from: number, to: number): Item[] {
	const moved = items[from];
	if (!moved) return items;
	const rest = items.filter((_, i) => i !== from);
	const at = Math.max(0, Math.min(to, rest.length));
	return clampLevels([...rest.slice(0, at), moved, ...rest.slice(at)]);
}

export function insertPiece(items: Item[], index: number, piece: number): Item[] {
	const at = Math.max(0, Math.min(index, items.length));
	const previous = items[at - 1];
	const level = previous && !previous.heading ? previous.level : 0;
	return clampLevels([...items.slice(0, at), { pieces: [piece], level }, ...items.slice(at)]);
}

/** The text that Apply writes. In notes mode this is a markdown bullet list, one tab per level. */
export function render(items: Item[], pieces: readonly string[], mode: Mode, eol: string): string {
	const text = (item: Item) => item.pieces.map((p) => pieces[p] ?? '').join(' ');
	if (mode === 'notes') {
		return items
			.map((item) =>
				item.heading ? '#'.repeat(item.heading) + ' ' + text(item) : '\t'.repeat(item.level) + '- ' + text(item),
			)
			.join(eol);
	}
	const flat = items.flatMap((item) => item.pieces.map((p) => pieces[p] ?? ''));
	return flat.join(mode === 'sentence' ? eol : ' ');
}
