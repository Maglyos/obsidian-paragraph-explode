import { App, ButtonComponent, DropdownComponent, Modal } from 'obsidian';
import { isPlaceholder, splitAround } from './splitter';
import { clampLevels, group, insertPiece, Item, Mode, moveItem, render, setHeading, shiftLevels, ungroup } from './outline';

export interface ModalOptions {
	title: string;
	defaultMode: Mode;
	keepAsideByDefault: boolean;
	eol: string;
	/** Tokens like "XYZ" that mark text you still need to write. */
	placeholders: string[];
}

interface State {
	/** Text of every piece, by id. Ids are append-only; edits replace the text, splits add ids. */
	texts: string[];
	/** Piece ids in their original reading order. */
	seq: number[];
	pool: number[];
	items: Item[];
	aside: number[];
}

/** off: picks make one item each. next: the next pick starts a note. open: picks join the last note. */
type Grouping = 'off' | 'next' | 'open';

type DragSource = { type: 'item'; index: number } | { type: 'piece'; piece: number };
type DropTarget = { type: 'outline'; index: number } | { type: 'pool' } | null;

const MODE_LABELS: Record<Mode, string> = {
	paragraph: 'Paragraph',
	sentence: 'Sentence lines',
	notes: 'Notes',
};

const DRAG_THRESHOLD = 5;

/** Click-and-drag outline builder. Calls `onApply` with the final text for the chosen mode. */
export class ReorderModal extends Modal {
	private state: State;
	private history: State[] = [];
	private selected: number[] = [];
	private anchor: number | null = null;
	private grouping: Grouping = 'off';
	private mode: Mode;
	private keepAside: boolean;
	private editing: number | null = null;
	private draft = '';
	private selectAllOnEdit = false;
	private hintEl!: HTMLElement;

	private poolEl!: HTMLElement;
	private outlineEl!: HTMLElement;
	private asideWrapEl!: HTMLElement;
	private asideEl!: HTMLElement;
	private notesToolsEl!: HTMLElement;
	private modeButtons = new Map<Mode, HTMLButtonElement>();
	private groupingButton!: ButtonComponent;
	private previewEl!: HTMLElement;
	private applyButton!: ButtonComponent;
	private undoButton!: ButtonComponent;

	constructor(
		app: App,
		pieces: string[],
		private readonly onApply: (text: string) => void,
		private readonly options: ModalOptions,
	) {
		super(app);
		this.mode = options.defaultMode;
		this.keepAside = options.keepAsideByDefault;
		this.state = { texts: [...pieces], seq: pieces.map((_, i) => i), pool: pieces.map((_, i) => i), items: [], aside: [] };
	}

	onOpen(): void {
		const { contentEl } = this;
		this.modalEl.addClass('paragraph-explode-modal');
		this.setTitle(this.options.title);

		const modes = contentEl.createDiv({ cls: 'paragraph-explode-modes' });
		for (const mode of ['paragraph', 'sentence', 'notes'] as const) {
			const button = modes.createEl('button', { text: MODE_LABELS[mode] });
			button.addEventListener('click', () => this.setMode(mode));
			this.modeButtons.set(mode, button);
		}

		this.notesToolsEl = contentEl.createDiv({ cls: 'paragraph-explode-tools' });
		this.groupingButton = new ButtonComponent(this.notesToolsEl)
			.setButtonText('New note')
			.setTooltip('Start a note: the next picks join it. Press again to start another, twice to stop.')
			.onClick(() => this.newNote());
		new ButtonComponent(this.notesToolsEl)
			.setButtonText('Group')
			.setTooltip('Merge the selected items into one note')
			.onClick(() => this.groupSelected());
		new ButtonComponent(this.notesToolsEl)
			.setButtonText('Ungroup')
			.setTooltip('Split the selected notes into one item per piece')
			.onClick(() => this.ungroupSelected());
		for (const level of [1, 2, 3]) {
			new ButtonComponent(this.notesToolsEl)
				.setButtonText(`H${level}`)
				.setTooltip(`Make the selected items level ${level} headings`)
				.onClick(() => this.setHeadingLevel(level));
		}
		new ButtonComponent(this.notesToolsEl)
			.setButtonText('Bullet')
			.setTooltip('Turn the selected headings back into bullets')
			.onClick(() => this.setHeadingLevel(null));
		new ButtonComponent(this.notesToolsEl)
			.setButtonText('Outdent')
			.setTooltip('Shift+Tab')
			.onClick(() => this.shift(-1));
		new ButtonComponent(this.notesToolsEl)
			.setButtonText('Indent')
			.setTooltip('Tab')
			.onClick(() => this.shift(1));

		const columns = contentEl.createDiv({ cls: 'paragraph-explode-columns' });
		const left = columns.createDiv({ cls: 'paragraph-explode-column' });
		left.createEl('h4', { text: 'Remaining' });
		this.poolEl = left.createDiv({ cls: 'paragraph-explode-list' });
		const right = columns.createDiv({ cls: 'paragraph-explode-column' });
		right.createEl('h4', { text: 'New order' });
		this.outlineEl = right.createDiv({ cls: 'paragraph-explode-list' });

		this.asideWrapEl = contentEl.createDiv({ cls: 'paragraph-explode-column paragraph-explode-aside' });
		this.asideWrapEl.createEl('h4', { text: 'Set aside (click to bring back)' });
		this.asideEl = this.asideWrapEl.createDiv({ cls: 'paragraph-explode-list' });
		const keep = this.asideWrapEl.createDiv({ cls: 'paragraph-explode-keep' });
		keep.createSpan({ text: 'When applying:' });
		new DropdownComponent(keep)
			.addOption('delete', 'Delete set-aside sentences')
			.addOption('keep', 'Keep them below as a separate paragraph')
			.setValue(this.keepAside ? 'keep' : 'delete')
			.onChange((value) => {
				this.keepAside = value === 'keep';
				this.renderPreview();
			});

		const preview = contentEl.createDiv({ cls: 'paragraph-explode-column paragraph-explode-preview-wrap' });
		preview.createEl('h4', { text: 'Preview' });
		this.previewEl = preview.createDiv({ cls: 'paragraph-explode-preview' });

		this.hintEl = contentEl.createDiv({ cls: 'paragraph-explode-hint' });

		const buttons = contentEl.createDiv({ cls: 'paragraph-explode-buttons' });
		this.applyButton = new ButtonComponent(buttons)
			.setButtonText('Apply')
			.setCta()
			.onClick(() => this.apply(false));
		this.undoButton = new ButtonComponent(buttons).setButtonText('Undo').onClick(() => this.undo());
		new ButtonComponent(buttons).setButtonText('Reset').onClick(() => this.reset());
		new ButtonComponent(buttons).setButtonText('Cancel').onClick(() => {
			this.editing = null;
			this.close();
		});

		this.registerKeys();
		this.render();
	}

	/** Esc while editing a piece cancels the edit instead of closing the window. */
	close(): void {
		if (this.editing !== null) {
			this.cancelEdit();
			return;
		}
		super.close();
	}

	onClose(): void {
		this.cancelDrag?.();
		document.body.findAll('.paragraph-explode-ghost').forEach((el) => el.remove());
		this.contentEl.empty();
	}

	// ---- keyboard ----------------------------------------------------------------------------------------------

	private registerKeys(): void {
		const key = (modifiers: ('Shift' | 'Alt')[], k: string, fn: () => boolean | void) =>
			this.scope.register(modifiers, k, () => {
				// While typing in a piece editor, every key keeps its normal behavior except Enter.
				if (this.editing !== null && k !== 'Enter') return true;
				return fn() === false;
			});

		for (let n = 1; n <= 9; n++) {
			key([], String(n), () => {
				const id = this.state.seq[n - 1];
				return id === undefined ? false : this.pick(id);
			});
		}
		key([], 'Backspace', () => this.undo());
		key([], 'Enter', () => this.apply(true));
		key([], 'n', () => this.onlyNotes(() => this.newNote()));
		key([], 'g', () => this.onlyNotes(() => this.groupSelected()));
		key([], 'u', () => this.onlyNotes(() => this.ungroupSelected()));
		key([], 'h', () => this.onlyNotes(() => this.cycleHeading()));
		key([], 'Tab', () => this.onlyNotes(() => this.shift(1)));
		key(['Shift'], 'Tab', () => this.onlyNotes(() => this.shift(-1)));
		key(['Alt'], 'ArrowUp', () => this.moveSelected(-1));
		key(['Alt'], 'ArrowDown', () => this.moveSelected(1));
	}

	/** Runs `fn` in notes mode. Otherwise returns false so the key keeps its default behavior. */
	private onlyNotes(fn: () => void): boolean {
		if (this.mode !== 'notes') return false;
		fn();
		return true;
	}

	// ---- state changes -------------------------------------------------------------------------------------------

	private snapshot(): void {
		this.history.push({
			texts: [...this.state.texts],
			seq: [...this.state.seq],
			pool: [...this.state.pool],
			items: this.state.items.map((i) => ({ ...i, pieces: [...i.pieces] })),
			aside: [...this.state.aside],
		});
		if (this.history.length > 200) this.history.shift();
	}

	private undo(): void {
		const previous = this.history.pop();
		if (!previous) return;
		this.state = previous;
		this.editing = null;
		this.selected = [];
		this.grouping = 'off';
		this.render();
	}

	private reset(): void {
		this.snapshot();
		this.editing = null;
		this.state = { ...this.state, pool: [...this.state.seq], items: [], aside: [] };
		this.selected = [];
		this.grouping = 'off';
		this.render();
	}

	private setMode(mode: Mode): void {
		this.mode = mode;
		if (mode !== 'notes') this.grouping = 'off';
		this.render();
	}

	private pick(piece: number): boolean {
		const at = this.state.pool.indexOf(piece);
		if (at === -1) return false;
		this.snapshot();
		this.state.pool.splice(at, 1);
		const last = this.state.items[this.state.items.length - 1];
		if (this.mode === 'notes' && this.grouping === 'open' && last) {
			last.pieces.push(piece);
		} else {
			this.state.items.push({ pieces: [piece], level: last && !last.heading ? last.level : 0 });
			if (this.mode === 'notes' && this.grouping === 'next') this.grouping = 'open';
		}
		this.selected = [];
		this.render();
		return true;
	}

	private putBack(index: number): void {
		const item = this.state.items[index];
		if (!item) return;
		this.snapshot();
		this.state.items.splice(index, 1);
		this.state.items = clampLevels(this.state.items);
		this.state.pool = this.bySeq([...this.state.pool, ...item.pieces]);
		this.selected = [];
		this.render();
	}

	private setAside(piece: number): void {
		const at = this.state.pool.indexOf(piece);
		if (at === -1) return;
		this.snapshot();
		this.state.pool.splice(at, 1);
		this.state.aside = this.bySeq([...this.state.aside, piece]);
		this.render();
	}

	private unaside(piece: number): void {
		const at = this.state.aside.indexOf(piece);
		if (at === -1) return;
		this.snapshot();
		this.state.aside.splice(at, 1);
		this.state.pool = this.bySeq([...this.state.pool, piece]);
		this.render();
	}

	private bySeq(ids: number[]): number[] {
		const rank = (id: number) => this.state.seq.indexOf(id);
		return [...ids].sort((a, b) => rank(a) - rank(b));
	}

	// ---- editing ---------------------------------------------------------------------------------------------------

	private startEdit(id: number, selectAll = false): void {
		if (this.editing !== null && this.editing !== id) this.commitEdit();
		this.editing = id;
		this.draft = this.state.texts[id] ?? '';
		this.selectAllOnEdit = selectAll;
		this.render();
	}

	private commitEdit(): void {
		const id = this.editing;
		if (id === null) return;
		const text = this.draft.replace(/\s+/g, ' ').trim();
		this.editing = null;
		if (text && text !== this.state.texts[id]) {
			this.snapshot();
			this.state.texts[id] = text;
		}
		this.render();
	}

	private cancelEdit(): void {
		this.editing = null;
		this.render();
	}

	/** Split the piece being edited into before / selection / after, then edit the selection. */
	private splitSelection(input: HTMLInputElement): void {
		const id = this.editing;
		const start = input.selectionStart;
		const end = input.selectionEnd;
		if (id === null || start === null || end === null) return;
		const result = splitAround(input.value, start, end);
		if (!result || result.parts.length < 2) return;

		this.snapshot();
		const ids = [id];
		for (let i = 1; i < result.parts.length; i++) {
			this.state.texts.push('');
			ids.push(this.state.texts.length - 1);
		}
		result.parts.forEach((text, i) => (this.state.texts[ids[i] ?? id] = text));
		const added = ids.slice(1);
		this.state.seq.splice(this.state.seq.indexOf(id) + 1, 0, ...added);

		if (this.state.pool.includes(id)) this.state.pool = this.bySeq([...this.state.pool, ...added]);
		else if (this.state.aside.includes(id)) this.state.aside = this.bySeq([...this.state.aside, ...added]);
		else {
			for (const item of this.state.items) {
				const at = item.pieces.indexOf(id);
				if (at !== -1) {
					item.pieces.splice(at + 1, 0, ...added);
					break;
				}
			}
		}

		const middle = ids[result.middle] ?? id;
		this.editing = middle;
		this.draft = this.state.texts[middle] ?? '';
		this.selectAllOnEdit = true;
		this.render();
	}

	private newNote(): void {
		this.grouping = this.grouping === 'next' ? 'off' : 'next';
		this.render();
	}

	/** The selected items, or the last item when nothing is selected. */
	private targets(): number[] {
		if (this.selected.length > 0) return this.selected;
		return this.state.items.length > 0 ? [this.state.items.length - 1] : [];
	}

	private groupSelected(): void {
		if (this.selected.length < 2) return;
		this.snapshot();
		const result = group(this.state.items, this.selected);
		this.state.items = result.items;
		this.selected = [result.index];
		this.grouping = 'off';
		this.render();
	}

	private ungroupSelected(): void {
		const targets = this.targets();
		if (!targets.some((i) => (this.state.items[i]?.pieces.length ?? 0) > 1)) return;
		this.snapshot();
		const result = ungroup(this.state.items, targets);
		this.state.items = result.items;
		this.selected = result.indices;
		this.grouping = 'off';
		this.render();
	}

	private setHeadingLevel(level: number | null): void {
		const targets = this.targets();
		if (targets.length === 0) return;
		this.snapshot();
		this.state.items = setHeading(this.state.items, targets, level);
		this.render();
	}

	/** Key H: bullet, then H1, H2, H3, then back to a bullet. */
	private cycleHeading(): void {
		const first = this.targets()[0];
		const current = first === undefined ? undefined : this.state.items[first]?.heading;
		this.setHeadingLevel(current === undefined ? 1 : current >= 3 ? null : current + 1);
	}

	private shift(delta: number): void {
		const targets = this.targets();
		if (targets.length === 0) return;
		const next = shiftLevels(this.state.items, targets, delta);
		if (next.every((item, i) => item.level === this.state.items[i]?.level)) return;
		this.snapshot();
		this.state.items = next;
		this.render();
	}

	private moveSelected(delta: number): boolean {
		const first = this.selected[0];
		if (first === undefined || this.selected.length !== 1) return false;
		const to = first + delta;
		if (to < 0 || to >= this.state.items.length) return true;
		this.snapshot();
		this.state.items = moveItem(this.state.items, first, to);
		this.selected = [to];
		this.render();
		return true;
	}

	private selectItem(index: number, evt: MouseEvent): void {
		if (evt.shiftKey && this.anchor !== null) {
			const [from, to] = [Math.min(this.anchor, index), Math.max(this.anchor, index)];
			this.selected = Array.from({ length: to - from + 1 }, (_, i) => from + i);
		} else if (evt.metaKey || evt.ctrlKey) {
			this.selected = this.selected.includes(index)
				? this.selected.filter((i) => i !== index)
				: [...this.selected, index].sort((a, b) => a - b);
			this.anchor = index;
		} else {
			this.selected = this.selected.length === 1 && this.selected[0] === index ? [] : [index];
			this.anchor = index;
		}
		this.render();
	}

	private text(): string {
		const { items, aside } = this.state;
		let out = render(items, this.state.texts, this.mode, this.options.eol);
		if (this.keepAside && aside.length > 0) {
			const asideItems: Item[] = aside.map((p) => ({ pieces: [p], level: 0 }));
			out += this.options.eol + this.options.eol + render(asideItems, this.state.texts, this.mode, this.options.eol);
		}
		return out;
	}

	private canApply(): boolean {
		return this.state.pool.length === 0 && this.state.items.length > 0;
	}

	private apply(fromKey: boolean): void {
		if (this.editing !== null) {
			this.commitEdit();
			if (fromKey) return;
		}
		if (!this.canApply()) return;
		const text = this.text();
		this.close();
		this.onApply(text);
	}

	// ---- rendering -----------------------------------------------------------------------------------------------

	private render(): void {
		this.cancelDrag?.();
		const notes = this.mode === 'notes';
		this.modeButtons.forEach((button, mode) => button.toggleClass('is-active', mode === this.mode));
		this.notesToolsEl.toggleClass('paragraph-explode-hidden', !notes);
		this.groupingButton.setButtonText(
			this.grouping === 'next' ? 'New note: pick next…' : this.grouping === 'open' ? 'New note: open' : 'New note',
		);
		this.groupingButton.buttonEl.toggleClass('mod-cta', this.grouping !== 'off');

		this.poolEl.empty();
		for (const piece of this.state.pool) this.poolRow(piece);

		this.outlineEl.empty();
		this.state.items.forEach((item, index) => this.itemRow(item, index, notes));

		this.asideEl.empty();
		for (const piece of this.state.aside) {
			const row = this.row(this.asideEl, piece);
			row.createSpan({ cls: 'paragraph-explode-text', text: this.state.texts[piece] ?? '' });
			row.addEventListener('click', () => this.unaside(piece));
		}
		this.asideWrapEl.toggleClass('paragraph-explode-hidden', this.state.aside.length === 0);

		const open = [...this.state.pool, ...this.state.items.flatMap((i) => i.pieces)].filter((id) =>
			isPlaceholder(this.state.texts[id] ?? '', this.options.placeholders),
		).length;
		this.hintEl.setText(
			open > 0 ? `${open} placeholder${open === 1 ? '' : 's'} still to rewrite. Click Edit, or double-click a piece.` : '',
		);
		this.hintEl.toggleClass('paragraph-explode-hidden', open === 0);

		this.applyButton.setDisabled(!this.canApply());
		this.undoButton.setDisabled(this.history.length === 0);
		this.renderPreview();
	}

	private renderPreview(): void {
		const left = this.state.pool.length;
		this.previewEl.setText(
			this.canApply()
				? this.text()
				: left > 0
					? `${left} piece${left === 1 ? ' is' : 's are'} still under Remaining. Place or set aside every piece to apply.`
					: 'Add at least one piece to the new order to apply.',
		);
	}

	private row(parent: HTMLElement, piece: number): HTMLElement {
		const row = parent.createDiv({ cls: 'paragraph-explode-row' });
		row.setAttribute('role', 'button');
		row.dataset.piece = String(piece);
		return row;
	}

	private poolRow(piece: number): void {
		const row = this.row(this.poolEl, piece);
		const handle = row.createSpan({ cls: 'paragraph-explode-handle', text: '⋮⋮' });
		handle.setAttribute('aria-label', 'Drag to the new order');
		const rank = this.state.seq.indexOf(piece);
		row.createSpan({ cls: 'paragraph-explode-num', text: rank < 9 ? String(rank + 1) : '' });
		const content = row.createSpan({ cls: 'paragraph-explode-text' });
		this.pieceContent(content, piece);
		if (this.editing !== piece) {
			this.smallButton(row, 'Edit', () => this.startEdit(piece));
			this.smallButton(row, 'Set aside', () => this.setAside(piece));
		}
		row.addEventListener('click', () => this.pick(piece));
		this.makeDraggable(handle, { type: 'piece', piece }, this.state.texts[piece] ?? '');
	}

	private itemRow(item: Item, index: number, notes: boolean): void {
		const row = this.outlineEl.createDiv({ cls: 'paragraph-explode-row' });
		row.setAttribute('role', 'button');
		row.dataset.index = String(index);
		row.toggleClass('is-selected', this.selected.includes(index));
		row.toggleClass('is-heading', notes && item.heading !== undefined);
		row.style.setProperty('--paragraph-explode-level', String(notes ? item.level : 0));

		const handle = row.createSpan({ cls: 'paragraph-explode-handle', text: '⋮⋮' });
		handle.setAttribute('aria-label', 'Drag to reorder');
		const badge = notes ? (item.heading ? `H${item.heading}` : '•') : String(index + 1);
		row.createSpan({ cls: 'paragraph-explode-num', text: badge });
		const content = row.createSpan({ cls: 'paragraph-explode-text' });
		item.pieces.forEach((piece, i) => {
			if (i > 0) content.appendText(' ');
			this.pieceContent(content, piece);
		});
		const only = item.pieces.length === 1 ? item.pieces[0] : undefined;
		if (only !== undefined && this.editing !== only) this.smallButton(row, 'Edit', () => this.startEdit(only));
		if (this.editing === null || !item.pieces.includes(this.editing)) {
			this.smallButton(row, 'Put back', () => this.putBack(index));
		}
		row.addEventListener('click', (evt) => this.selectItem(index, evt));
		this.makeDraggable(handle, { type: 'item', index }, item.pieces.map((p) => this.state.texts[p] ?? '').join(' '));
	}

	private smallButton(parent: HTMLElement, text: string, onClick: () => void): void {
		const button = parent.createEl('button', { cls: 'paragraph-explode-small-button', text });
		button.addEventListener('click', (evt) => {
			evt.stopPropagation();
			onClick();
		});
	}

	/** One piece's text, or its inline editor while it is being edited. Double-click a piece to edit it. */
	private pieceContent(parent: HTMLElement, piece: number): void {
		const text = this.state.texts[piece] ?? '';
		if (this.editing !== piece) {
			const span = parent.createSpan({ cls: 'paragraph-explode-piece', text });
			span.toggleClass('is-placeholder', isPlaceholder(text, this.options.placeholders));
			span.addEventListener('dblclick', (evt) => {
				evt.stopPropagation();
				this.startEdit(piece, isPlaceholder(text, this.options.placeholders));
			});
			return;
		}

		const wrap = parent.createSpan({ cls: 'paragraph-explode-editor' });
		wrap.addEventListener('click', (evt) => evt.stopPropagation());
		wrap.addEventListener('dblclick', (evt) => evt.stopPropagation());
		const input = wrap.createEl('input', { cls: 'paragraph-explode-input', type: 'text' });
		input.value = this.draft;
		input.addEventListener('input', () => (this.draft = input.value));

		const tools = wrap.createSpan({ cls: 'paragraph-explode-editor-tools' });
		const isolate = tools.createEl('button', {
			cls: 'paragraph-explode-small-button',
			text: 'Split out selection',
		});
		isolate.setAttribute('aria-label', 'Select part of the text above, then split it into its own piece');
		isolate.addEventListener('mousedown', (evt) => evt.preventDefault()); // keep the text selected
		isolate.addEventListener('click', () => this.splitSelection(input));
		const save = tools.createEl('button', { cls: 'paragraph-explode-small-button mod-cta', text: 'Save' });
		save.addEventListener('click', () => this.commitEdit());
		const cancel = tools.createEl('button', { cls: 'paragraph-explode-small-button', text: 'Cancel edit' });
		cancel.addEventListener('click', () => this.cancelEdit());

		const selectAll = this.selectAllOnEdit;
		this.selectAllOnEdit = false;
		window.setTimeout(() => {
			input.focus();
			if (selectAll) input.select();
		}, 0);
	}

	// ---- drag and drop -------------------------------------------------------------------------------------------

	/** Ends any drag in progress and removes its preview. Safe to call at any time. */
	private cancelDrag: (() => void) | null = null;

	private makeDraggable(handle: HTMLElement, source: DragSource, label: string): void {
		handle.draggable = false;
		handle.addEventListener('click', (evt) => evt.stopPropagation());
		handle.addEventListener('dragstart', (evt) => evt.preventDefault());
		// Stops the browser from starting its own text selection or text drag from the handle.
		handle.addEventListener('mousedown', (evt) => evt.preventDefault());
		handle.addEventListener('pointerdown', (down: PointerEvent) => {
			if (down.button !== 0) return;
			down.preventDefault();
			down.stopPropagation();
			this.cancelDrag?.();
			window.getSelection()?.removeAllRanges();
			try {
				handle.setPointerCapture(down.pointerId);
			} catch {
				// Pointer already gone; the drag simply won't start.
			}

			let ghost: HTMLElement | null = null;
			let target: DropTarget = null;
			let active = true;

			const onMove = (move: PointerEvent) => {
				if (!active) return;
				if (!ghost) {
					if (Math.hypot(move.clientX - down.clientX, move.clientY - down.clientY) < DRAG_THRESHOLD) return;
					ghost = document.body.createDiv({ cls: 'paragraph-explode-ghost', text: label });
				}
				ghost.style.left = `${move.clientX + 12}px`;
				ghost.style.top = `${move.clientY + 12}px`;
				target = this.dropTarget(move.clientX, move.clientY, source);
				this.showDropTarget(target, source);
			};
			/** Always runs to completion: the preview is removed before anything that could throw. */
			const end = (drop: boolean) => {
				if (!active) return;
				active = false;
				this.cancelDrag = null;
				ghost?.remove();
				document.body.findAll('.paragraph-explode-ghost').forEach((el) => el.remove());
				handle.removeEventListener('pointermove', onMove);
				handle.removeEventListener('pointerup', onUp);
				handle.removeEventListener('pointercancel', onCancel);
				handle.removeEventListener('lostpointercapture', onCancel);
				window.removeEventListener('blur', onCancel);
				window.removeEventListener('keydown', onKey, true);
				try {
					if (handle.hasPointerCapture(down.pointerId)) handle.releasePointerCapture(down.pointerId);
				} catch {
					// Capture was already released.
				}
				const dropped = ghost !== null && drop ? target : null;
				ghost = null;
				try {
					this.showDropTarget(null, source);
					if (dropped) this.drop(source, dropped);
				} catch (error) {
					console.error('Paragraph explode: drop failed', error);
					this.render();
				}
			};
			const onUp = () => end(true);
			const onCancel = () => end(false);
			const onKey = (evt: KeyboardEvent) => {
				if (evt.key !== 'Escape') return;
				evt.stopPropagation();
				evt.preventDefault();
				end(false);
			};

			this.cancelDrag = () => end(false);
			handle.addEventListener('pointermove', onMove);
			handle.addEventListener('pointerup', onUp);
			handle.addEventListener('pointercancel', onCancel);
			handle.addEventListener('lostpointercapture', onCancel);
			window.addEventListener('blur', onCancel);
			window.addEventListener('keydown', onKey, true);
		});
	}

	private dropTarget(x: number, y: number, source: DragSource): DropTarget {
		if (contains(this.outlineEl, x, y)) {
			const rows = Array.from(this.outlineEl.children).filter((el): el is HTMLElement => el.instanceOf(HTMLElement));
			for (const row of rows) {
				const rect = row.getBoundingClientRect();
				if (y < rect.top + rect.height / 2) return { type: 'outline', index: Number(row.dataset.index) };
			}
			return { type: 'outline', index: this.state.items.length };
		}
		if (source.type === 'item' && contains(this.poolEl, x, y)) return { type: 'pool' };
		return null;
	}

	private showDropTarget(target: DropTarget, source: DragSource): void {
		this.contentEl
			.findAll('.paragraph-explode-drop-before, .paragraph-explode-drop-end, .paragraph-explode-drop-pool')
			.forEach((el) => el.removeClasses(['paragraph-explode-drop-before', 'paragraph-explode-drop-end', 'paragraph-explode-drop-pool']));
		if (source.type === 'item') {
			this.outlineEl.children[source.index]?.addClass('is-dragging');
		}
		if (!target) return;
		if (target.type === 'pool') {
			this.poolEl.addClass('paragraph-explode-drop-pool');
		} else if (target.index >= this.state.items.length) {
			this.outlineEl.addClass('paragraph-explode-drop-end');
		} else {
			this.outlineEl.children[target.index]?.addClass('paragraph-explode-drop-before');
		}
	}

	private drop(source: DragSource, target: NonNullable<DropTarget>): void {
		if (target.type === 'pool') {
			if (source.type === 'item') this.putBack(source.index);
			return;
		}
		if (source.type === 'piece') {
			const at = this.state.pool.indexOf(source.piece);
			if (at === -1) return;
			this.snapshot();
			this.state.pool.splice(at, 1);
			this.state.items = insertPiece(this.state.items, target.index, source.piece);
			this.selected = [];
		} else {
			const to = target.index > source.index ? target.index - 1 : target.index;
			if (to === source.index) return;
			this.snapshot();
			this.state.items = moveItem(this.state.items, source.index, to);
			this.selected = [to];
		}
		this.render();
	}
}

function contains(el: HTMLElement, x: number, y: number): boolean {
	const r = el.getBoundingClientRect();
	return x >= r.left && x <= r.right && y >= r.top - 8 && y <= r.bottom + 8;
}
