/** Pointer-based drag and drop for a handle element. Works with mouse, touch and pen. */

let cancelActive: (() => void) | null = null;

/** Ends any drag in progress and removes its preview. Safe to call at any time. */
export function cancelDrag(): void {
	cancelActive?.();
}

export interface DragOptions<T> {
	handle: HTMLElement;
	/** Text shown in the preview that follows the pointer. */
	label: string;
	/** Where would a drop at this point land? Null if nowhere. */
	target(x: number, y: number): T | null;
	/** Show (or with null, clear) the drop indicator. */
	show(target: T | null): void;
	drop(target: T): void;
	/** A scrollable element to nudge when the pointer nears its top or bottom edge. */
	scrollEl?: HTMLElement;
}

const THRESHOLD = 5;
const EDGE = 36;
const SCROLL_STEP = 14;

export function attachDrag<T>(options: DragOptions<T>): void {
	const { handle } = options;
	handle.draggable = false;
	handle.addEventListener('click', (evt) => evt.stopPropagation());
	handle.addEventListener('dragstart', (evt) => evt.preventDefault());
	handle.addEventListener('mousedown', (evt) => evt.preventDefault());

	handle.addEventListener('pointerdown', (down: PointerEvent) => {
		if (down.button !== 0) return;
		down.preventDefault();
		down.stopPropagation();
		cancelActive?.();
		window.getSelection()?.removeAllRanges();
		try {
			handle.setPointerCapture(down.pointerId);
		} catch {
			// The pointer is already gone; the drag simply will not start.
		}

		let ghost: HTMLElement | null = null;
		let target: T | null = null;
		let active = true;

		const onMove = (move: PointerEvent) => {
			if (!active) return;
			if (!ghost) {
				if (Math.hypot(move.clientX - down.clientX, move.clientY - down.clientY) < THRESHOLD) return;
				ghost = document.body.createDiv({ cls: 'paragraph-explode-ghost', text: options.label });
			}
			ghost.style.left = `${move.clientX + 12}px`;
			ghost.style.top = `${move.clientY + 12}px`;
			const scroller = options.scrollEl;
			if (scroller) {
				const rect = scroller.getBoundingClientRect();
				if (move.clientY < rect.top + EDGE) scroller.scrollTop -= SCROLL_STEP;
				else if (move.clientY > rect.bottom - EDGE) scroller.scrollTop += SCROLL_STEP;
			}
			target = options.target(move.clientX, move.clientY);
			options.show(target);
		};

		/** Always runs to completion: the preview is removed before anything that could throw. */
		const end = (drop: boolean) => {
			if (!active) return;
			active = false;
			cancelActive = null;
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
				options.show(null);
				if (dropped !== null) options.drop(dropped);
			} catch (error) {
				console.error('Paragraph explode: drop failed', error);
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

		cancelActive = () => end(false);
		handle.addEventListener('pointermove', onMove);
		handle.addEventListener('pointerup', onUp);
		handle.addEventListener('pointercancel', onCancel);
		handle.addEventListener('lostpointercapture', onCancel);
		window.addEventListener('blur', onCancel);
		window.addEventListener('keydown', onKey, true);
	});
}
