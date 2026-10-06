import { App, ButtonComponent, DropdownComponent, Modal } from 'obsidian';

export type ApplyMode = 'paragraph' | 'exploded';

export interface ModalOptions {
	title: string;
	keepAsideByDefault: boolean;
	enterApplies: ApplyMode;
}

export interface ApplyResult {
	ordered: string[];
	/** Sentences set aside, in their original order. */
	aside: string[];
	mode: ApplyMode;
	/** Keep the set-aside sentences in the note (below the new text) instead of deleting them. */
	keepAside: boolean;
}

/** Click-to-build reorder UI. Calls `onApply` with the pieces in their new order. */
export class ReorderModal extends Modal {
	private remaining: number[];
	private order: number[] = [];
	private aside: number[] = [];
	private keepAside: boolean;
	private remainingEl!: HTMLElement;
	private orderEl!: HTMLElement;
	private asideWrapEl!: HTMLElement;
	private asideEl!: HTMLElement;
	private applyButtons: ButtonComponent[] = [];

	constructor(
		app: App,
		private readonly sentences: string[],
		private readonly onApply: (result: ApplyResult) => void,
		private readonly options: ModalOptions,
	) {
		super(app);
		this.keepAside = options.keepAsideByDefault;
		this.remaining = sentences.map((_, i) => i);
	}

	onOpen(): void {
		const { contentEl } = this;
		this.modalEl.addClass('paragraph-explode-modal');
		this.setTitle(this.options.title);

		const columns = contentEl.createDiv({ cls: 'paragraph-explode-columns' });
		const left = columns.createDiv({ cls: 'paragraph-explode-column' });
		left.createEl('h4', { text: 'Remaining' });
		this.remainingEl = left.createDiv({ cls: 'paragraph-explode-list' });
		const right = columns.createDiv({ cls: 'paragraph-explode-column' });
		right.createEl('h4', { text: 'New order' });
		this.orderEl = right.createDiv({ cls: 'paragraph-explode-list' });

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
			});

		const buttons = contentEl.createDiv({ cls: 'paragraph-explode-buttons' });
		this.applyButtons = [
			new ButtonComponent(buttons)
				.setButtonText('Apply')
				.setCta()
				.onClick(() => this.apply('paragraph')),
			new ButtonComponent(buttons)
				.setButtonText('Apply as exploded')
				.onClick(() => this.apply('exploded')),
		];
		new ButtonComponent(buttons).setButtonText('Reset').onClick(() => this.reset());
		new ButtonComponent(buttons).setButtonText('Cancel').onClick(() => this.close());

		for (let n = 1; n <= 9; n++) {
			this.scope.register([], String(n), () => {
				this.pick(n - 1);
				return false;
			});
		}
		this.scope.register([], 'Backspace', () => {
			this.undo();
			return false;
		});
		this.scope.register([], 'Enter', () => {
			this.apply(this.options.enterApplies);
			return false;
		});

		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private pick(index: number): void {
		const at = this.remaining.indexOf(index);
		if (at === -1) return;
		this.remaining.splice(at, 1);
		this.order.push(index);
		this.render();
	}

	private unpick(position: number): void {
		const [index] = this.order.splice(position, 1);
		if (index !== undefined) this.restore(index);
	}

	private setAside(index: number): void {
		const at = this.remaining.indexOf(index);
		if (at === -1) return;
		this.remaining.splice(at, 1);
		this.aside.push(index);
		this.aside.sort((a, b) => a - b);
		this.render();
	}

	private unaside(index: number): void {
		const at = this.aside.indexOf(index);
		if (at === -1) return;
		this.aside.splice(at, 1);
		this.restore(index);
	}

	private restore(index: number): void {
		this.remaining.push(index);
		this.remaining.sort((a, b) => a - b);
		this.render();
	}

	private undo(): void {
		if (this.order.length > 0) this.unpick(this.order.length - 1);
	}

	private reset(): void {
		this.remaining = this.sentences.map((_, i) => i);
		this.order = [];
		this.aside = [];
		this.render();
	}

	private apply(mode: ApplyMode): void {
		if (this.remaining.length > 0 || this.order.length === 0) return;
		const text = (i: number) => this.sentences[i] ?? '';
		const result: ApplyResult = {
			ordered: this.order.map(text),
			aside: this.aside.map(text),
			mode,
			keepAside: this.keepAside,
		};
		this.close();
		this.onApply(result);
	}

	private render(): void {
		this.remainingEl.empty();
		for (const index of this.remaining) {
			const row = this.row(this.remainingEl, index < 9 ? String(index + 1) : '', index, () => this.pick(index));
			const aside = row.createEl('button', { cls: 'paragraph-explode-aside-button', text: 'Set aside' });
			aside.addEventListener('click', (evt) => {
				evt.stopPropagation();
				this.setAside(index);
			});
		}
		this.orderEl.empty();
		this.order.forEach((index, position) => {
			this.row(this.orderEl, String(position + 1), index, () => this.unpick(position));
		});
		this.asideEl.empty();
		for (const index of this.aside) {
			this.row(this.asideEl, '', index, () => this.unaside(index));
		}
		this.asideWrapEl.toggleClass('paragraph-explode-hidden', this.aside.length === 0);

		const done = this.remaining.length === 0 && this.order.length > 0;
		for (const button of this.applyButtons) button.setDisabled(!done);
	}

	private row(parent: HTMLElement, label: string, index: number, onClick: () => void): HTMLElement {
		const row = parent.createDiv({ cls: 'paragraph-explode-row' });
		row.setAttribute('role', 'button');
		row.createSpan({ cls: 'paragraph-explode-num', text: label });
		row.createSpan({ cls: 'paragraph-explode-text', text: this.sentences[index] ?? '' });
		row.addEventListener('click', onClick);
		return row;
	}
}
