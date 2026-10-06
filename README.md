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

- **Remaining** (left): click a sentence to add it to the **New order** (right). Click a sentence in the new order to send it back.
- **Set aside**: each remaining sentence has a *Set aside* button. Set-aside sentences can be clicked to bring them back. When you apply, they are either deleted or kept below the new text as a separate paragraph.
- **Apply** replaces the original with the new order as a normal paragraph. **Apply as exploded** puts one sentence per line. **Reset** starts over. **Cancel** closes the window.
- Keyboard: keys `1`-`9` pick the remaining sentence with that number, `Backspace` undoes the last pick, `Enter` applies once everything is placed or set aside, `Esc` cancels.

## What it protects

Sentences are copied verbatim; only their order changes. Splitting does not happen inside:

- abbreviations (e.g., i.e., et al., Dr., vs., Fig., p., and more), initials such as "J. K. Rowling", or decimals like 3.14
- parentheses or brackets, so APA citations like (Smith et al., 2020. p. 4) stay whole
- `[[wikilinks]]`, `[links](https://example.com)`, URLs, inline code, footnotes like `[^1]`, and citation keys like `[@smith2020]`

Headings, code blocks, tables, frontmatter, lists and quotes are skipped with a notice. A soft line break inside a sentence becomes a single space.

## Settings

- **Extra abbreviations**: words ending in a period that should never end a sentence.
- **Phrases**: toggle splitting at punctuation and at conjunction words, and edit the word list.
- **Reorder window**: whether set-aside sentences are deleted or kept by default, and whether Enter applies as a paragraph or as one sentence per line.

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
