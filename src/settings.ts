import { App, PluginSettingTab, Setting, SettingDefinition, SettingDefinitionItem } from 'obsidian';
import type ParagraphExplodePlugin from './main';
import type { Mode } from './outline';
import { DEFAULT_PHRASE_WORDS, parseWordList } from './splitter';

export interface ParagraphExplodeSettings {
	/** Phrase mode: split after commas, semicolons and colons. */
	splitAtPunctuation: boolean;
	/** Phrase mode: split before conjunction-like words. */
	splitAtWords: boolean;
	phraseWords: string[];
	/** Abbreviations (lowercase, no trailing period) that never end a sentence. */
	extraAbbreviations: string[];
	/** What the reorder window does with set-aside sentences by default. */
	setAsideDefault: 'delete' | 'keep';
	/** The mode the reorder window opens in. */
	defaultMode: Mode;
}

export const DEFAULT_SETTINGS: ParagraphExplodeSettings = {
	splitAtPunctuation: true,
	splitAtWords: true,
	phraseWords: [...DEFAULT_PHRASE_WORDS],
	extraAbbreviations: [],
	setAsideDefault: 'delete',
	defaultMode: 'paragraph',
};

export class ParagraphExplodeSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: ParagraphExplodePlugin,
	) {
		super(app, plugin);
	}

	/** Obsidian 1.13+: rendered and searched declaratively. */
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				type: 'group',
				heading: 'Sentences',
				items: [
					{
						name: 'Extra abbreviations',
						desc: 'Words that end in a period but never end a sentence, such as "gov" or "approx". Separate with commas. Common ones (e.g., et al., Fig., vs.) are built in.',
						control: { type: 'textarea', key: 'extraAbbreviations', placeholder: 'Gov, approx' },
					},
				],
			},
			{
				type: 'group',
				heading: 'Phrases',
				items: [
					{
						name: 'Split at punctuation',
						desc: 'Start a new phrase after a comma, semicolon or colon.',
						control: { type: 'toggle', key: 'splitAtPunctuation' },
					},
					{
						name: 'Split at conjunction words',
						desc: 'Start a new phrase before words like "and", "but" and "because".',
						control: { type: 'toggle', key: 'splitAtWords' },
					},
					{
						name: 'Conjunction words',
						desc: 'Words that start a new phrase. Separate with commas.',
						control: { type: 'textarea', key: 'phraseWords' },
					},
					{
						name: 'Restore the default words',
						desc: 'Reset the conjunction words to the built-in list.',
						action: () => {
							this.plugin.settings.phraseWords = [...DEFAULT_PHRASE_WORDS];
							void this.plugin.saveSettings();
							// update() exists from Obsidian 1.13; older versions re-render via display().
							(this as { update?: () => void }).update?.();
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'Reorder window',
				items: [
					{
						name: 'Set-aside sentences',
						desc: 'What happens to sentences you set aside when you apply. You can change this in the window each time.',
						control: {
							type: 'dropdown',
							key: 'setAsideDefault',
							options: { delete: 'Delete them', keep: 'Keep them below as a separate paragraph' },
						},
					},
					{
						name: 'Default mode',
						desc: 'How the window writes the result when it opens. You can switch modes inside the window.',
						control: {
							type: 'dropdown',
							key: 'defaultMode',
							options: { paragraph: 'Paragraph', sentence: 'Sentence lines', notes: 'Notes (bullet list)' },
						},
					},
				],
			},
		];
	}

	getControlValue(key: string): unknown {
		const value: unknown = this.plugin.settings[key as keyof ParagraphExplodeSettings];
		return Array.isArray(value) ? value.join(', ') : value;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const settings = this.plugin.settings;
		if (key === 'phraseWords' || key === 'extraAbbreviations') {
			settings[key] = parseWordList(String(value));
		} else if (key === 'setAsideDefault') {
			settings.setAsideDefault = value === 'keep' ? 'keep' : 'delete';
		} else if (key === 'defaultMode') {
			settings.defaultMode = value === 'sentence' || value === 'notes' ? value : 'paragraph';
		} else if (key === 'splitAtPunctuation' || key === 'splitAtWords') {
			settings[key] = value === true;
		}
		await this.plugin.saveSettings();
	}

	/** Fallback for Obsidian before 1.13, which ignores getSettingDefinitions(). */
	display(): void {
		this.renderLegacyTab();
	}

	private renderLegacyTab(): void {
		const { containerEl } = this;
		containerEl.empty();
		for (const item of this.getSettingDefinitions()) {
			if (!('type' in item) || item.type !== 'group') continue;
			if (item.heading) new Setting(containerEl).setName(item.heading).setHeading();
			for (const def of item.items ?? []) {
				if ('name' in def) this.renderLegacy(def);
			}
		}
	}

	private renderLegacy(def: SettingDefinition): void {
		const setting = new Setting(this.containerEl).setName(def.name).setDesc(def.desc ?? '');
		const { control } = def;
		if (!control) {
			setting.addButton((button) =>
				button.setButtonText('Restore').onClick(() => {
					def.action?.(button.buttonEl, 0);
					this.renderLegacyTab();
				}),
			);
			return;
		}
		const value = this.getControlValue(control.key);
		const save = (next: unknown) => void this.setControlValue(control.key, next);
		if (control.type === 'toggle') {
			setting.addToggle((toggle) => toggle.setValue(value === true).onChange(save));
		} else if (control.type === 'dropdown') {
			setting.addDropdown((dropdown) =>
				dropdown.addOptions(control.options).setValue(String(value)).onChange(save),
			);
		} else if (control.type === 'textarea') {
			setting.addTextArea((area) =>
				area
					.setPlaceholder(control.placeholder ?? '')
					.setValue(String(value))
					.onChange(save),
			);
		}
	}
}
