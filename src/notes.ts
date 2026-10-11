/** Section-aware operations on a block list. Pure functions: every one returns a new array. */

import type { Block } from './blocks';

/** One past the last block of the section that starts at `i`. A non-heading is a section of one. */
export function sectionEnd(blocks: readonly Block[], i: number): number {
	const head = blocks[i];
	if (!head || head.kind !== 'heading') return i + 1;
	let j = i + 1;
	while (j < blocks.length) {
		const cur = blocks[j];
		if (cur && cur.kind === 'heading' && cur.level <= head.level) break;
		j++;
	}
	return j;
}

/** How many headings enclose each block (a heading's own depth counts only the headings above it). */
export function depths(blocks: readonly Block[]): number[] {
	const stack: number[] = [];
	return blocks.map((b) => {
		if (b.kind !== 'heading') return stack.length;
		while (stack.length > 0 && (stack[stack.length - 1] ?? 0) >= b.level) stack.pop();
		const depth = stack.length;
		stack.push(b.level);
		return depth;
	});
}

/** True for headings that skip a level, such as an H3 straight after an H1. */
export function levelJumps(blocks: readonly Block[]): boolean[] {
	let previous = 0;
	return blocks.map((b) => {
		if (b.kind !== 'heading') return false;
		const jump = previous > 0 && b.level > previous + 1;
		previous = b.level;
		return jump;
	});
}

/** The index ranges [start, end) that move when `indices` are moved. A heading brings its whole section. */
export function unitRanges(blocks: readonly Block[], indices: readonly number[]): [number, number][] {
	const ranges = [...new Set(indices)]
		.filter((i) => i >= 0 && i < blocks.length)
		.sort((a, b) => a - b)
		.map((i): [number, number] => [i, sectionEnd(blocks, i)]);
	const merged: [number, number][] = [];
	for (const range of ranges) {
		const last = merged[merged.length - 1];
		if (last && range[0] < last[1]) last[1] = Math.max(last[1], range[1]);
		else merged.push([range[0], range[1]]);
	}
	return merged;
}

/**
 * Move the units for `indices` so they sit before the block currently at `gap` (blocks.length means the end).
 * Moved blocks keep their relative order. Dropping a unit inside itself changes nothing.
 */
export function moveBlocks(blocks: readonly Block[], indices: readonly number[], gap: number): Block[] {
	const moving = new Set<number>();
	for (const [start, end] of unitRanges(blocks, indices)) for (let k = start; k < end; k++) moving.add(k);
	if (moving.size === 0) return [...blocks];

	const rest: Block[] = [];
	let at = 0;
	blocks.forEach((b, i) => {
		if (moving.has(i)) return;
		if (i < gap) at++;
		rest.push(b);
	});
	const moved = blocks.filter((_, i) => moving.has(i));
	return [...rest.slice(0, at), ...moved, ...rest.slice(at)];
}

/**
 * Raise (delta -1) or lower (+1) heading levels. The selected headings and every heading inside their sections
 * shift together. If any would leave H1-H6, nothing changes.
 */
export function shiftHeadings(blocks: readonly Block[], indices: readonly number[], delta: number): Block[] {
	const headings = indices.filter((i) => blocks[i]?.kind === 'heading');
	const targets = new Set<number>();
	for (const [start, end] of unitRanges(blocks, headings)) {
		for (let k = start; k < end; k++) if (blocks[k]?.kind === 'heading') targets.add(k);
	}
	if (targets.size === 0) return [...blocks];
	for (const k of targets) {
		const level = (blocks[k]?.level ?? 0) + delta;
		if (level < 1 || level > 6) return [...blocks];
	}
	return blocks.map((b, i) => (targets.has(i) ? { ...b, level: b.level + delta } : b));
}

export function sameOrder(a: readonly Block[], b: readonly Block[]): boolean {
	return a.length === b.length && a.every((block, i) => block === b[i]);
}
