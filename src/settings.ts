import { App, PluginSettingTab, Setting } from 'obsidian';
import type ParagraphExplodePlugin from './main';
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
	/** What pressing Enter in the reorder window applies. */
	enterApplies: 'paragraph' | 'exploded';
}

export const DEFAULT_SETTINGS: ParagraphExplodeSettings = {
	splitAtPunctuation: true,
	splitAtWords: true,
	phraseWords: [...DEFAULT_PHRASE_WORDS],
	extraAbbreviations: [],
	setAsideDefault: 'delete',
	enterApplies: 'paragraph',
};

export class ParagraphExplodeSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: ParagraphExplodePlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const settings = this.plugin.settings;
		containerEl.empty();

		new Setting(containerEl).setName('Sentences').setHeading();

		new Setting(containerEl)
			.setName('Extra abbreviations')
			.setDesc(
				'Words that end in a period but never end a sentence, such as "gov" or "approx". Separate with commas. Common ones (e.g., et al., Fig., vs.) are built in.',
			)
			.addTextArea((area) =>
				area
					.setPlaceholder('Gov, approx')
					.setValue(settings.extraAbbreviations.join(', '))
					.onChange(async (value) => {
						settings.extraAbbreviations = parseWordList(value);
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName('Phrases').setHeading();

		new Setting(containerEl)
			.setName('Split at punctuation')
			.setDesc('Start a new phrase after a comma, semicolon or colon.')
			.addToggle((toggle) =>
				toggle.setValue(settings.splitAtPunctuation).onChange(async (value) => {
					settings.splitAtPunctuation = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Split at conjunction words')
			.setDesc('Start a new phrase before words like "and", "but" and "because".')
			.addToggle((toggle) =>
				toggle.setValue(settings.splitAtWords).onChange(async (value) => {
					settings.splitAtWords = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Conjunction words')
			.setDesc('Words that start a new phrase. Separate with commas.')
			.addTextArea((area) =>
				area.setValue(settings.phraseWords.join(', ')).onChange(async (value) => {
					settings.phraseWords = parseWordList(value);
					await this.plugin.saveSettings();
				}),
			)
			.addExtraButton((button) =>
				button
					.setIcon('reset')
					.setTooltip('Restore the default words')
					.onClick(async () => {
						settings.phraseWords = [...DEFAULT_PHRASE_WORDS];
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		new Setting(containerEl).setName('Reorder window').setHeading();

		new Setting(containerEl)
			.setName('Set-aside sentences')
			.setDesc('What happens to sentences you set aside when you apply. You can change this in the window each time.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('delete', 'Delete them')
					.addOption('keep', 'Keep them below as a separate paragraph')
					.setValue(settings.setAsideDefault)
					.onChange(async (value) => {
						settings.setAsideDefault = value === 'keep' ? 'keep' : 'delete';
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Enter key applies')
			.setDesc('Which format is used when you confirm from the keyboard after placing every sentence.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('paragraph', 'As a normal paragraph')
					.addOption('exploded', 'One sentence per line')
					.setValue(settings.enterApplies)
					.onChange(async (value) => {
						settings.enterApplies = value === 'exploded' ? 'exploded' : 'paragraph';
						await this.plugin.saveSettings();
					}),
			);
	}
}
