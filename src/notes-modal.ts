import { App, ButtonComponent, Modal } from 'obsidian';
import { Block } from './blocks';
import { attachDrag, cancelDrag } from './drag';
import { FORMAT_LABELS, FormatKeep, FormatMode, formatBlock, renderBlocks, resolveKeep } from './format';
import { depths, levelJumps, moveBlocks, sameOrder, sectionEnd, shiftHeadings } from './notes';

export interface NotesModalOptions {
	eol: string;
	formatMode: FormatMode;
	keep: FormatKeep;
	/** Called when the formatting choice changes, so it can be remembered. */
	onFormatChange: (mode: FormatMode, keep: FormatKeep) => void;
}

const MODE_LABELS: Record<FormatMode, string> = {
	all: 'Keep all formatting',
	selected: 'Choose what to keep',
	none: 'Plain text',
};

const KIND_BADGES: Record<Block['kind'], string> = {
	heading: '',
	text: '¶',
	item: '•',
	quote: '❝',
	code: '</>',
	table: '▦',
	rule: '—',
};

const KIND_NAMES: Record<Block['kind'], string> = {
	heading: 'Heading',
	text: 'Paragraph',
	item: 'Bullet',
	quote: 'Quote',
	code: 'Code',
	table: 'Table',
	rule: 'Divider',
};

/** Reorganize a page: sections and blocks as a tree you can collapse, select, drag and re-level. */
export class NotesModal extends Modal {
	private blocks: Block[];
	private readonly original: Block[];
	private history: Block[][] = [];
	private selected = new Set<number>();
	private anchor: number | null = null;
	private collapsed = new Set<number>();
	private mode: FormatMode;
	private keep: FormatKeep;

	private modeButtons = new Map<FormatMode, HTMLButtonElement>();
	private keepEl!: HTMLElement;
	private listEl!: HTMLElement;
	private statusEl!: HTMLElement;
	private previewEl!: HTMLElement;
	private previewBox!: HTMLDetailsElement;
	private applyButton!: ButtonComponent;
	private undoButton!: ButtonComponent;

	constructor(
		app: App,
		blocks: Block[],
		private readonly onApply: (text: string) => void,
		private readonly options: NotesModalOptions,
	) {
		super(app);
		this.blocks = blocks;
		this.original = [...blocks];
		this.mode = options.formatMode;
		this.keep = { ...options.keep };
	}

	onOpen(): void {
		const { contentEl } = this;
		this.modalEl.addClass('paragraph-explode-modal', 'paragraph-explode-notes-modal');
		this.setTitle('Reorganize notes');

		const format = contentEl.createDiv({ cls: 'paragraph-explode-format' });
		format.createSpan({ cls: 'paragraph-explode-format-label', text: 'Formatting' });
		const modes = format.createDiv({ cls: 'paragraph-explode-modes' });
		for (const mode of ['all', 'selected', 'none'] as const) {
			const button = modes.createEl('button', { text: MODE_LABELS[mode] });
			button.addEventListener('click', () => this.setMode(mode));
			this.modeButtons.set(mode, button);
		}
		this.keepEl = contentEl.createDiv({ cls: 'paragraph-explode-keeps' });

		const bar = contentEl.createDiv({ cls: 'paragraph-explode-tools' });
		bar.createSpan({ cls: 'paragraph-explode-format-label', text: 'Show' });
		for (const [label, level] of [['All sections', 0], ['H1', 1], ['H2', 2], ['H3', 3]] as const) {
			new ButtonComponent(bar)
				.setButtonText(label)
				.setTooltip(level === 0 ? 'Collapse every section' : `Collapse everything below heading level ${level}`)
				.onClick(() => this.collapseTo(level));
		}
		new ButtonComponent(bar).setButtonText('Expand all').onClick(() => this.expandAll());

		const move = contentEl.createDiv({ cls: 'paragraph-explode-tools' });
		move.createSpan({ cls: 'paragraph-explode-format-label', text: 'Selected' });
		new ButtonComponent(move).setButtonText('Up').setTooltip('Alt+Up').onClick(() => this.moveSelected(-1));
		new ButtonComponent(move).setButtonText('Down').setTooltip('Alt+Down').onClick(() => this.moveSelected(1));
		new ButtonComponent(move).setButtonText('Promote').setTooltip('Shift+Tab. Raises the heading level').onClick(() => this.shift(-1));
		new ButtonComponent(move).setButtonText('Demote').setTooltip('Tab. Lowers the heading level').onClick(() => this.shift(1));

		contentEl.createDiv({
			cls: 'paragraph-explode-legend',
			text: 'Headings show their level. Moving a heading moves its whole section. Click selects, Shift+click selects a range, Cmd/Ctrl+click adds. Drag the handle to move.',
		});

		this.listEl = contentEl.createDiv({ cls: 'paragraph-explode-tree' });
		this.statusEl = contentEl.createDiv({ cls: 'paragraph-explode-hint' });

		this.previewBox = contentEl.createEl('details', { cls: 'paragraph-explode-preview-wrap' });
		this.previewBox.createEl('summary', { text: 'Preview the result' });
		this.previewEl = this.previewBox.createDiv({ cls: 'paragraph-explode-preview' });
		this.previewBox.addEventListener('toggle', () => this.renderPreview());

		const buttons = contentEl.createDiv({ cls: 'paragraph-explode-buttons' });
		this.applyButton = new ButtonComponent(buttons).setButtonText('Apply').setCta().onClick(() => this.apply());
		this.undoButton = new ButtonComponent(buttons).setButtonText('Undo').setTooltip('Cmd/Ctrl+Z').onClick(() => this.undo());
		new ButtonComponent(buttons).setButtonText('Reset').onClick(() => this.reset());
		new ButtonComponent(buttons).setButtonText('Cancel').onClick(() => this.close());

		this.registerKeys();
		this.render();
	}

	onClose(): void {
		cancelDrag();
		document.body.findAll('.paragraph-explode-ghost').forEach((el) => el.remove());
		this.contentEl.empty();
	}

	// ---- keyboard ----------------------------------------------------------------------------------------------

	private registerKeys(): void {
		const on = (modifiers: ('Shift' | 'Alt' | 'Mod')[], key: string, fn: () => void) =>
			this.scope.register(modifiers, key, () => {
				fn();
				return false;
			});
		on(['Alt'], 'ArrowUp', () => this.moveSelected(-1));
		on(['Alt'], 'ArrowDown', () => this.moveSelected(1));
		on([], 'Tab', () => this.shift(1));
		on(['Shift'], 'Tab', () => this.shift(-1));
		on([], 'ArrowUp', () => this.step(-1));
		on([], 'ArrowDown', () => this.step(1));
		on([], 'ArrowLeft', () => this.toggleSelectedSections(true));
		on([], 'ArrowRight', () => this.toggleSelectedSections(false));
		on(['Mod'], 'z', () => this.undo());
		on(['Mod'], 'Enter', () => this.apply());
	}

	// ---- structure helpers -------------------------------------------------------------------------------------

	/** Block indices that have a row on screen: everything except the insides of collapsed sections. */
	private visibleIndices(): number[] {
		const out: number[] = [];
		for (let i = 0; i < this.blocks.length; ) {
			out.push(i);
			const block = this.blocks[i];
			i = block && block.kind === 'heading' && this.collapsed.has(block.id) ? sectionEnd(this.blocks, i) : i + 1;
		}
		return out;
	}

	private selectedIndices(): number[] {
		const out: number[] = [];
		this.blocks.forEach((b, i) => {
			if (this.selected.has(b.id)) out.push(i);
		});
		return out;
	}

	private snapshot(): void {
		this.history.push(this.blocks);
		if (this.history.length > 200) this.history.shift();
	}

	private commit(next: Block[]): void {
		if (sameOrder(this.blocks, next)) return;
		this.snapshot();
		this.blocks = next;
		this.render();
	}

	// ---- actions -----------------------------------------------------------------------------------------------

	private undo(): void {
		const previous = this.history.pop();
		if (!previous) return;
		this.blocks = previous;
		this.render();
	}

	private reset(): void {
		this.snapshot();
		this.blocks = [...this.original];
		this.selected.clear();
		this.render();
	}

	private setMode(mode: FormatMode): void {
		this.mode = mode;
		this.options.onFormatChange(this.mode, this.keep);
		this.render();
	}

	private setKeep(key: keyof FormatKeep, value: boolean): void {
		this.keep = { ...this.keep, [key]: value };
		this.options.onFormatChange(this.mode, this.keep);
		this.render();
	}

	private collapseTo(level: number): void {
		this.collapsed.clear();
		for (const b of this.blocks) {
			if (b.kind === 'heading' && (level === 0 || b.level >= level)) this.collapsed.add(b.id);
		}
		this.render();
	}

	private expandAll(): void {
		this.collapsed.clear();
		this.render();
	}

	private toggleSection(id: number): void {
		if (this.collapsed.has(id)) this.collapsed.delete(id);
		else this.collapsed.add(id);
		this.render();
	}

	private toggleSelectedSections(collapse: boolean): void {
		let changed = false;
		for (const i of this.selectedIndices()) {
			const b = this.blocks[i];
			if (b?.kind !== 'heading') continue;
			if (collapse && !this.collapsed.has(b.id)) this.collapsed.add(b.id);
			else if (!collapse && this.collapsed.has(b.id)) this.collapsed.delete(b.id);
			else continue;
			changed = true;
		}
		if (changed) this.render();
	}

	private shift(delta: number): void {
		this.commit(shiftHeadings(this.blocks, this.selectedIndices(), delta));
	}

	/** Up/Down arrow: move the selection to the previous or next visible row. */
	private step(delta: number): void {
		const rows = this.visibleIndices();
		if (rows.length === 0) return;
		const chosen = this.selectedIndices();
		let at: number;
		if (chosen.length === 0) {
			at = delta > 0 ? 0 : rows.length - 1;
		} else {
			const base = (delta < 0 ? chosen[0] : chosen[chosen.length - 1]) ?? 0;
			const here = rows.findIndex((r) => r >= base);
			at = Math.max(0, Math.min(rows.length - 1, (here === -1 ? rows.length - 1 : here) + delta));
		}
		const block = this.blocks[rows[at] ?? -1];
		if (!block) return;
		this.selected = new Set([block.id]);
		this.anchor = block.id;
		this.render();
		this.listEl.find('.is-selected')?.scrollIntoView({ block: 'nearest' });
	}

	private moveSelected(delta: number): void {
		const indices = this.selectedIndices();
		const first = indices[0];
		const last = indices[indices.length - 1];
		if (first === undefined || last === undefined) return;
		const rows = this.visibleIndices();

		let gap: number | null = null;
		if (delta < 0) {
			const head = this.blocks[first];
			if (head?.kind === 'heading') {
				for (let k = first - 1; k >= 0; k--) {
					const b = this.blocks[k];
					if (b?.kind === 'heading' && b.level <= head.level) {
						gap = k;
						break;
					}
				}
			} else {
				const above = [...rows].reverse().find((r) => r < first);
				if (above !== undefined) gap = above;
			}
		} else {
			const end = Math.max(...indices.map((i) => sectionEnd(this.blocks, i)));
			const tail = this.blocks[last];
			const next = rows.find((r) => r >= end);
			const nextBlock = next === undefined ? undefined : this.blocks[next];
			if (next !== undefined && nextBlock) {
				if (tail?.kind === 'heading') {
					gap = nextBlock.kind === 'heading' && nextBlock.level < tail.level ? next + 1 : sectionEnd(this.blocks, next);
				} else {
					gap = nextBlock.kind === 'heading' && this.collapsed.has(nextBlock.id) ? sectionEnd(this.blocks, next) : next + 1;
				}
			}
		}
		if (gap === null) return;
		this.commit(moveBlocks(this.blocks, indices, gap));
		this.listEl.find('.is-selected')?.scrollIntoView({ block: 'nearest' });
	}

	private selectRow(index: number, evt: MouseEvent): void {
		const block = this.blocks[index];
		if (!block) return;
		const anchorIndex = this.anchor === null ? -1 : this.blocks.findIndex((b) => b.id === this.anchor);
		if (evt.shiftKey && anchorIndex !== -1) {
			const visible = this.visibleIndices();
			const [from, to] = [Math.min(anchorIndex, index), Math.max(anchorIndex, index)];
			this.selected = new Set(visible.filter((i) => i >= from && i <= to).map((i) => this.blocks[i]?.id ?? -1));
		} else if (evt.metaKey || evt.ctrlKey) {
			if (this.selected.has(block.id)) this.selected.delete(block.id);
			else this.selected.add(block.id);
			this.anchor = block.id;
		} else {
			this.selected = this.selected.size === 1 && this.selected.has(block.id) ? new Set() : new Set([block.id]);
			this.anchor = block.id;
		}
		this.render();
	}

	private apply(): void {
		if (this.blocks.length === 0) return;
		const text = this.output();
		this.close();
		this.onApply(text);
	}

	private output(): string {
		return renderBlocks(this.blocks, resolveKeep(this.mode, this.keep), this.options.eol);
	}

	// ---- rendering ---------------------------------------------------------------------------------------------

	private render(): void {
		cancelDrag();
		const keep = resolveKeep(this.mode, this.keep);

		this.modeButtons.forEach((button, mode) => button.toggleClass('is-active', mode === this.mode));
		this.keepEl.empty();
		this.keepEl.toggleClass('paragraph-explode-hidden', this.mode !== 'selected');
		for (const key of Object.keys(FORMAT_LABELS) as (keyof FormatKeep)[]) {
			const label = this.keepEl.createEl('label', { cls: 'paragraph-explode-keep-option' });
			const box = label.createEl('input', { type: 'checkbox' });
			box.checked = this.keep[key];
			box.addEventListener('change', () => this.setKeep(key, box.checked));
			label.appendText(FORMAT_LABELS[key]);
		}

		const depth = depths(this.blocks);
		const jumps = levelJumps(this.blocks);
		const marked = new Set<number>();
		for (const i of this.selectedIndices()) for (let k = i; k < sectionEnd(this.blocks, i); k++) marked.add(k);

		this.listEl.empty();
		for (const i of this.visibleIndices()) {
			const block = this.blocks[i];
			if (block) this.row(block, i, depth[i] ?? 0, jumps[i] ?? false, marked.has(i), keep);
		}

		const headings = this.blocks.filter((b) => b.kind === 'heading').length;
		const moved = this.blocks.some((b, i) => b.id !== i);
		this.statusEl.setText(
			`${this.blocks.length} blocks, ${headings} headings. ${this.selected.size} selected.${moved ? ' Order changed.' : ''}`,
		);
		this.applyButton.setDisabled(this.blocks.length === 0);
		this.undoButton.setDisabled(this.history.length === 0);
		this.renderPreview();
	}

	private renderPreview(): void {
		if (this.previewBox.open) this.previewEl.setText(this.output());
	}

	private row(block: Block, index: number, depth: number, jump: boolean, marked: boolean, keep: FormatKeep): void {
		const heading = block.kind === 'heading';
		const folded = heading && this.collapsed.has(block.id);
		const row = this.listEl.createDiv({ cls: 'paragraph-explode-nrow' });
		row.dataset.index = String(index);
		row.style.setProperty('--paragraph-explode-depth', String(depth));
		row.addClasses([`is-${block.kind}`]);
		if (heading) row.addClass(`is-h${block.level}`);
		row.toggleClass('is-selected', this.selected.has(block.id));
		row.toggleClass('in-selection', marked && !this.selected.has(block.id));

		const handle = row.createSpan({ cls: 'paragraph-explode-handle', text: '⋮⋮' });
		handle.setAttribute('aria-label', heading ? 'Drag this section' : 'Drag this block');

		if (heading) {
			const chevron = row.createEl('button', { cls: 'paragraph-explode-chevron', text: folded ? '▸' : '▾' });
			chevron.setAttribute('aria-label', folded ? 'Expand section' : 'Collapse section');
			chevron.addEventListener('click', (evt) => {
				evt.stopPropagation();
				this.toggleSection(block.id);
			});
		} else {
			row.createSpan({ cls: 'paragraph-explode-chevron-space' });
		}

		const badge = row.createSpan({
			cls: 'paragraph-explode-badge',
			text: heading ? `H${block.level}` : KIND_BADGES[block.kind],
		});
		badge.setAttribute('aria-label', heading ? `Heading level ${block.level}` : KIND_NAMES[block.kind]);

		const shown = formatBlock(block, keep).join('\n');
		const text = row.createSpan({ cls: 'paragraph-explode-ntext', text: shown || '(removed by the formatting choice)' });
		text.setAttribute('title', block.lines.join('\n'));

		if (folded) {
			const count = sectionEnd(this.blocks, index) - index - 1;
			row.createSpan({ cls: 'paragraph-explode-meta', text: `${count} block${count === 1 ? '' : 's'} inside` });
		}
		if (jump) {
			const warn = row.createSpan({ cls: 'paragraph-explode-meta is-warning', text: 'level skipped' });
			warn.setAttribute('aria-label', 'This heading skips a level');
		}

		row.addEventListener('click', (evt) => this.selectRow(index, evt));
		if (heading) {
			row.addEventListener('dblclick', () => this.toggleSection(block.id));
		}

		attachDrag<number>({
			handle,
			label: shown.split('\n')[0] ?? '',
			scrollEl: this.listEl,
			target: (x, y) => this.dropGap(x, y),
			show: (gap) => this.showGap(gap),
			drop: (gap) => {
				const indices = this.selected.has(block.id) ? this.selectedIndices() : [index];
				if (!this.selected.has(block.id)) {
					this.selected = new Set([block.id]);
					this.anchor = block.id;
				}
				this.commit(moveBlocks(this.blocks, indices, gap));
				this.render();
			},
		});
	}

	// ---- drag targets ------------------------------------------------------------------------------------------

	/** The block index a drop here would land before, or null outside the list. */
	private dropGap(x: number, y: number): number | null {
		const box = this.listEl.getBoundingClientRect();
		if (x < box.left || x > box.right || y < box.top - 12 || y > box.bottom + 12) return null;
		const rows = Array.from(this.listEl.children).filter((el): el is HTMLElement => el.instanceOf(HTMLElement));
		for (const row of rows) {
			const rect = row.getBoundingClientRect();
			if (y < rect.top + rect.height / 2) return Number(row.dataset.index);
		}
		return this.blocks.length;
	}

	private showGap(gap: number | null): void {
		this.listEl
			.findAll('.paragraph-explode-drop-before')
			.forEach((el) => el.removeClass('paragraph-explode-drop-before'));
		this.listEl.removeClass('paragraph-explode-drop-end');
		if (gap === null) return;
		const rows = Array.from(this.listEl.children).filter((el): el is HTMLElement => el.instanceOf(HTMLElement));
		const target = rows.find((r) => Number(r.dataset.index) === gap);
		if (target) target.addClass('paragraph-explode-drop-before');
		else this.listEl.addClass('paragraph-explode-drop-end');
	}
}
