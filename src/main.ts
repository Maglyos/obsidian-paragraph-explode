import { Editor, EditorPosition, Notice, Plugin } from 'obsidian';
import { parseBlocks } from './blocks';
import { ModalOptions, ReorderModal } from './modal';
import { NotesModal } from './notes-modal';
import { checkSelection, findParagraph, lineKinds } from './paragraph';
import { DEFAULT_SETTINGS, ParagraphExplodeSettings, ParagraphExplodeSettingTab } from './settings';
import { explodeText, unwrapLines } from './splitter';

interface Target {
	from: EditorPosition;
	to: EditorPosition;
	/** Exact text currently in [from, to]. */
	text: string;
}

export default class ParagraphExplodePlugin extends Plugin {
	settings: ParagraphExplodeSettings = { ...DEFAULT_SETTINGS };

	async onload(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()) as ParagraphExplodeSettings;
		delete (this.settings as { enterApplies?: unknown }).enterApplies; // replaced by defaultMode in 1.1.0
		this.settings.formatKeep = { ...DEFAULT_SETTINGS.formatKeep, ...this.settings.formatKeep };
		this.addSettingTab(new ParagraphExplodeSettingTab(this.app, this));

		this.addCommand({
			id: 'explode-paragraph',
			name: 'Explode paragraph',
			editorCallback: (editor) => this.explode(editor),
		});
		this.addCommand({
			id: 'explode-paragraph-in-place',
			name: 'Explode paragraph in place',
			editorCallback: (editor) => this.explodeInPlace(editor),
		});
		this.addCommand({
			id: 'explode-selection-into-phrases',
			name: 'Explode selection into phrases',
			editorCallback: (editor) => this.explodePhrases(editor),
		});
		this.addCommand({
			id: 'reorganize-notes',
			name: 'Reorganize notes (selection or whole page)',
			editorCallback: (editor) => this.reorganize(editor),
		});
		this.addCommand({
			id: 'collapse-exploded-lines',
			name: 'Collapse exploded lines back into a paragraph',
			editorCallback: (editor) => this.collapse(editor),
		});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private modalOptions(editor: Editor, title: string): ModalOptions {
		return {
			title,
			defaultMode: this.settings.defaultMode,
			keepAsideByDefault: this.settings.setAsideDefault === 'keep',
			eol: this.eol(editor),
			placeholders: this.settings.placeholders,
		};
	}

	private explode(editor: Editor): void {
		const target = this.locate(editor);
		const sentences = target && this.sentencesOf(target);
		if (!target || !sentences) return;

		new ReorderModal(
			this.app,
			sentences,
			(text) => this.write(editor, target, text),
			this.modalOptions(editor, 'Explode paragraph'),
		).open();
	}

	private explodePhrases(editor: Editor): void {
		if (!editor.somethingSelected()) {
			new Notice('Paragraph explode: select a sentence (or more) to split into phrases.');
			return;
		}
		const target = this.locate(editor);
		if (!target) return;
		const phrases = this.piecesOf(target, true);
		if (phrases.length < 2) {
			new Notice('Paragraph explode: found only one phrase.');
			return;
		}
		new ReorderModal(
			this.app,
			phrases,
			(text) => this.write(editor, target, text),
			this.modalOptions(editor, 'Explode into phrases'),
		).open();
	}

	/** Reorganize the selected lines, or the whole note below its frontmatter, as sections and blocks. */
	private reorganize(editor: Editor): void {
		const lines = editor.getValue().split(/\r?\n/);
		const kinds = lineKinds(lines);
		let from = 0;
		let to = lines.length - 1;
		if (editor.somethingSelected()) {
			const start = editor.getCursor('from');
			const end = editor.getCursor('to');
			from = start.line;
			to = end.ch === 0 && end.line > start.line ? end.line - 1 : end.line;
			if (kinds.slice(from, to + 1).includes('frontmatter')) {
				new Notice('Paragraph explode: the selection includes frontmatter. Select below it, or select nothing for the whole page.');
				return;
			}
		} else {
			while (from <= to && kinds[from] === 'frontmatter') from++;
		}
		while (from <= to && !(lines[from] ?? '').trim()) from++;
		while (to >= from && !(lines[to] ?? '').trim()) to--;
		if (from > to) {
			new Notice('Paragraph explode: there is nothing to reorganize here.');
			return;
		}

		const start = { line: from, ch: 0 };
		const end = { line: to, ch: (lines[to] ?? '').length };
		const original = editor.getRange(start, end);
		const blocks = parseBlocks(original);
		if (blocks.length < 2) {
			new Notice('Paragraph explode: found only one block.');
			return;
		}

		new NotesModal(
			this.app,
			blocks,
			(text) => {
				if (editor.getRange(start, end) !== original) {
					new Notice('Paragraph explode: the note changed; nothing was applied.');
					return;
				}
				editor.replaceRange(text, start, end);
			},
			{
				eol: this.eol(editor),
				formatMode: this.settings.formatMode,
				keep: this.settings.formatKeep,
				onFormatChange: (mode, keep) => {
					this.settings.formatMode = mode;
					this.settings.formatKeep = keep;
					void this.saveSettings();
				},
			},
		).open();
	}

	private explodeInPlace(editor: Editor): void {
		const target = this.locate(editor);
		const sentences = target && this.sentencesOf(target);
		if (!target || !sentences) return;
		this.write(editor, target, sentences.join(this.eol(editor)));
	}

	private collapse(editor: Editor): void {
		const target = this.locate(editor);
		if (!target) return;
		const lines = target.text.split(/\r?\n/);
		if (lines.filter((l) => l.trim()).length < 2) {
			new Notice('Paragraph explode: that is already a single line.');
			return;
		}
		this.write(editor, target, unwrapLines(target.text));
	}

	/** Split the target text. Your split mark, if present, decides the cuts and is removed. */
	private piecesOf(target: Target, phrases: boolean): string[] {
		const s = this.settings;
		return explodeText(unwrapLines(target.text), {
			phrases,
			mark: s.separatorMark,
			punctuation: s.splitAtPunctuation,
			words: s.splitAtWords ? s.phraseWords : [],
			extraAbbreviations: s.extraAbbreviations,
			placeholders: s.placeholders,
		});
	}

	private sentencesOf(target: Target): string[] | null {
		const sentences = this.piecesOf(target, false);
		if (sentences.length < 2) {
			new Notice('Paragraph explode: found only one sentence.');
			return null;
		}
		return sentences;
	}

	/** The selection, or the blank-line-delimited paragraph under the cursor. Shows a Notice on failure. */
	private locate(editor: Editor): Target | null {
		const lines = editor.getValue().split(/\r?\n/);

		if (editor.somethingSelected()) {
			const from = editor.getCursor('from');
			const to = editor.getCursor('to');
			const problem = checkSelection(lines, from.line, to.line);
			if (problem) {
				new Notice(problem);
				return null;
			}
			const text = editor.getRange(from, to);
			if (!text.trim()) return null;
			return { from, to, text };
		}

		const found = findParagraph(lines, editor.getCursor().line);
		if ('error' in found) {
			new Notice(found.error);
			return null;
		}
		const from = { line: found.start, ch: 0 };
		const to = { line: found.end, ch: editor.getLine(found.end).length };
		return { from, to, text: editor.getRange(from, to) };
	}

	/** One replaceRange call is one undo step. Keeps selection edge whitespace untouched. */
	private write(editor: Editor, target: Target, replacement: string): void {
		if (editor.getRange(target.from, target.to) !== target.text) {
			new Notice('Paragraph explode: the note changed; nothing was applied.');
			return;
		}
		const lead = /^\s*/.exec(target.text)?.[0] ?? '';
		const trail = target.text.trim() ? (/\s*$/.exec(target.text)?.[0] ?? '') : '';
		editor.replaceRange(lead + replacement + trail, target.from, target.to);
	}

	private eol(editor: Editor): string {
		return editor.getValue().includes('\r\n') ? '\r\n' : '\n';
	}
}
