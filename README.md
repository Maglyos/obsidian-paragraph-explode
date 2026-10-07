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

**Notes mode**
- *Group*: select items (click, Shift+click for a range, Cmd/Ctrl+click to add) and merge them into one note. *Ungroup* splits them again.
- *New note*: press it (or `N`), then click pieces. They all join one note. Press `N` again to start the next note, and twice to stop.
- *Indent* / *Outdent* (`Tab` / `Shift+Tab`) move the selected notes one level at a time, up to six levels deep. The first bullet, and the first bullet after a heading, always stays at the top level. Output uses one tab per level.
- *H1*, *H2*, *H3* (or `H` to cycle) turn the selected items into `#`, `##` or `###` headings, and *Bullet* turns them back. Headings are written without a bullet. They only appear in Notes mode; in the other modes they are written as normal text.

**Keys**: `1`-`9` pick the remaining piece with that number; `Backspace` undoes the last change; `Enter` applies; `Esc` cancels; `N`, `G`, `U`, `H`, `Tab`, `Shift+Tab` for notes as above; `Alt+Up` / `Alt+Down` move the selected item.

## What it protects

Sentences are copied verbatim; only their order changes. Splitting does not happen inside:

- abbreviations (e.g., i.e., et al., Dr., vs., Fig., p., and more), initials such as "J. K. Rowling", or decimals like 3.14
- parentheses or brackets, so APA citations like (Smith et al., 2020. p. 4) stay whole
- `[[wikilinks]]`, `[links](https://example.com)`, URLs, inline code, footnotes like `[^1]`, and citation keys like `[@smith2020]`

Headings, code blocks, tables, frontmatter, lists and quotes are skipped with a notice. A soft line break inside a sentence becomes a single space.

## Settings

- **Extra abbreviations**: words ending in a period that should never end a sentence.
- **Phrases**: toggle splitting at punctuation and at conjunction words, and edit the word list.
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
