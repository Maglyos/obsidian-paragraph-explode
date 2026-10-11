# Paragraph Explode

Rearrange the sentences of a paragraph by exploding it into pieces and putting them back in a new order with a few clicks. Works on desktop and mobile.

Your note is never touched until you confirm, and every change is a single edit, so one undo (Ctrl/Cmd+Z) restores the original.

## Commands

Run these from the command palette. Each works on your selection if you have one, otherwise on the paragraph under the cursor (a block delimited by blank lines).

| Command | What it does |
| --- | --- |
| **Explode paragraph** | Opens the reorder window with one entry per sentence. |
| **Explode paragraph in place** | Rewrites the paragraph as one sentence per line, right in the editor. |
| **Explode selection into phrases** | Like the first command, but splits your selection into phrases (commas, semicolons, colons, and words like "and", "but", "because"). Requires a selection. |
| **Reorganize notes (selection or whole page)** | Opens a section tree of your notes so you can move sections and blocks around. See *Reorganize notes* below. |
| **Collapse exploded lines back into a paragraph** | Joins the lines of an exploded paragraph back into one. |

## The reorder window

Pick pieces from **Remaining** to build the **New order**, then Apply. A **Preview** shows exactly what will be written.

**Modes** (switch at the top of the window at any time, nothing is lost):

| Mode | Output |
| --- | --- |
| **Paragraph** | All pieces joined into one paragraph. |
| **Sentence lines** | One piece per line. |
| **Notes** | A bullet list. Pieces can be grouped into notes and indented into sub-points. |

**Building the order**
- Click a piece to add it, or drag its handle (`⋮⋮`) into the New order at the position you want.
- Drag items in the New order to reorder them. Drag one back onto *Remaining*, or press *Put back*.
- *Set aside* parks a piece. Set-aside pieces can be clicked to bring them back, and are deleted or kept below the result when you apply.

**Cut where you choose: split marks**
- Type a mark (default `~`) into your text wherever you want a cut, select it, and run any explode command. Example: `Genetic differences ~ are thought to contribute to~ the lions share ~of the liability for autism,~ with estimated heritability as responsible for 50-90% of the vulnerability to the disorder~.`
- The text is cut only at your marks, and **the marks are deleted** from the pieces and from the result. Anything you type next to a mark (a comma, a period) stays with the piece before it.
- If the text has marks, sentences without marks stay whole. If it has none, the usual automatic splitting is used.
- A doubled mark (`~~strikethrough~~`) is ignored. Change or turn off the mark in the settings.

**Drafting: rewrite parts of a sentence**
- *Edit* (or double-click a piece) turns it into a text box. Rewrite it and press Save (or Enter). Esc cancels the edit. Everything is undoable.
- To rewrite only part of a piece, select that text in the box and click *Split out selection*. The piece becomes up to three (before, selection, after), and the selection opens for editing.
- **Placeholders** such as `XYZ` get their own piece automatically in *Explode selection into phrases*, are highlighted, and are counted under the lists until you rewrite them. Example: "Genetic factors are thought to contribute to XYZ of the liability for autism." becomes three pieces: `Genetic factors are thought to contribute to`, `XYZ`, and `of the liability for autism.` Edit `XYZ` into your own words and Apply.
- Which words count as placeholders is a setting (default `XYZ, TBD, ___`, case-sensitive).

**Notes mode**
- *Group*: select items (click, Shift+click for a range, Cmd/Ctrl+click to add) and merge them into one note. *Ungroup* splits them again.
- *New note*: press it (or `N`), then click pieces. They all join one note. Press `N` again to start the next note, and twice to stop.
- *Indent* / *Outdent* (`Tab` / `Shift+Tab`) move the selected notes one level at a time, up to six levels deep. The first bullet, and the first bullet after a heading, always stays at the top level. Output uses one tab per level.
- *H1*, *H2*, *H3* (or `H` to cycle) turn the selected items into `#`, `##` or `###` headings, and *Bullet* turns them back. Headings are written without a bullet. They only appear in Notes mode; in the other modes they are written as normal text.

**Keys**: `1`-`9` pick the remaining piece with that number; `Backspace` undoes the last change; `Enter` applies; `Esc` cancels; `N`, `G`, `U`, `H`, `Tab`, `Shift+Tab` for notes as above; `Alt+Up` / `Alt+Down` move the selected item.

## Reorganize notes

Select any stretch of notes, or select nothing to use the whole page (frontmatter is left alone), and run **Reorganize notes (selection or whole page)**. Your notes are split into blocks: headings, paragraphs, bullets (each top-level bullet with its nested bullets), quotes and callouts, code, tables and dividers.

**Seeing the structure**
- Headings are bold, colored by level, and carry an `H1`-`H6` badge. Everything under a heading is indented beneath it, so sections and subsections read as a tree.
- Click the arrow (or double-click a heading) to collapse a section. **Show** collapses everything to *All sections*, *H1*, *H2* or *H3* so you can see just the outline, and *Expand all* opens it back up.
- A heading that skips a level (an H3 directly under an H1) is marked *level skipped*.

**Reorganizing**
- Drag a row's handle to move it. **Moving a heading moves its whole section**, including the subsections inside it.
- Click to select; Shift+click selects a range, Cmd/Ctrl+click adds. Selected blocks move together. **Up** and **Down** (or Alt+Up/Down) move the selection one step; for a section that means hopping over the neighboring section.
- **Promote** and **Demote** (Shift+Tab / Tab) change heading levels. A section's subsections shift with it, and nothing moves if a level would leave H1-H6.
- Undo (Cmd/Ctrl+Z), Reset, and a **Preview the result** panel. Apply writes everything as one edit, so one undo in the note restores it.

**Formatting**: choose what survives when the notes are written back.

| Choice | Result |
| --- | --- |
| **Keep all formatting** | Your text is written back exactly as it was. |
| **Choose what to keep** | Tick the kinds to keep: headings and dividers, bullets and numbers, bold/italic/highlight, links, code and math, quotes and callouts, tables, footnotes and citations. Anything unticked becomes plain text. |
| **Plain text** | No formatting at all: headings become plain lines, bullets become lines, links become their text, tables become `cell; cell` lines, and so on. |

The window shows each block as it will be written, so the effect is visible before you apply. Your choice is remembered.

Notes: blank lines between blocks are normalized (runs of blank lines become one), and a moved block is separated from its new neighbors by a blank line. Underlined (setext) headings are treated as paragraphs; use `#` headings.

## What it protects

Sentences are copied verbatim; only their order changes. Splitting does not happen inside:

- abbreviations (e.g., i.e., et al., Dr., vs., Fig., p., and more), initials such as "J. K. Rowling", or decimals like 3.14
- parentheses or brackets, so APA citations like (Smith et al., 2020. p. 4) stay whole
- `[[wikilinks]]`, `[links](https://example.com)`, URLs, inline code, footnotes like `[^1]`, and citation keys like `[@smith2020]`

Headings, code blocks, tables, frontmatter, lists and quotes are skipped with a notice. A soft line break inside a sentence becomes a single space.

## Settings

- **Extra abbreviations**: words ending in a period that should never end a sentence.
- **Reorganize notes**: the default formatting choice.
- **Split marks**: the mark you type to cut your own text (default `~`).
- **Phrases**: toggle splitting at punctuation and at conjunction words, edit the word list, and set the placeholder words.
- **Reorder window**: the mode the window opens in, and whether set-aside sentences are deleted or kept by default.

## Known limits

- A single capital letter before a period ("Plan B. The next step") is treated as an initial and does not split.
- A sentence that is entirely in parentheses ("(See above.) Next.") does not split after the closing parenthesis.
- A sentence that starts with a lowercase letter is not treated as a new sentence.

## Install

Once listed: Settings → Community plugins → Browse → search "Paragraph Explode".

Manual: download `main.js`, `manifest.json` and `styles.css` from the latest release into `<vault>/.obsidian/plugins/paragraph-explode/`, then enable the plugin.

## Development

```bash
npm install
npm run dev     # watch build
npm test        # vitest
npm run build   # type-check and production build
```

## License

MIT
