import { describe, expect, it } from 'vitest';
import { explodeText, hasMark, splitAtMarks, isPlaceholder, parseTokenList, parseWordList, splitAround, splitPhrases, splitSentences, unwrapLines } from '../src/splitter';

const split = splitSentences;

describe('basics', () => {
	it('splits on . ! ?', () => {
		expect(split('One. Two! Three? Four.')).toEqual(['One.', 'Two!', 'Three?', 'Four.']);
	});
	it('handles empty and single sentences', () => {
		expect(split('')).toEqual([]);
		expect(split('   ')).toEqual([]);
		expect(split('Just one sentence.')).toEqual(['Just one sentence.']);
		expect(split('No terminator')).toEqual(['No terminator']);
	});
	it('does not split before lowercase', () => {
		expect(split('Wait... what happened? nothing.')).toEqual(['Wait... what happened? nothing.']);
	});
	it('splits after an ellipsis before a capital', () => {
		expect(split('He paused... Then he left.')).toEqual(['He paused...', 'Then he left.']);
	});
	it('keeps closing quotes and emphasis markers with the sentence', () => {
		expect(split('She said "Stop." Then she left.')).toEqual(['She said "Stop."', 'Then she left.']);
		expect(split('**Bold claim.** Next one. *Emphasis.* Last.')).toEqual([
			'**Bold claim.**',
			'Next one.',
			'*Emphasis.*',
			'Last.',
		]);
	});
	it('splits before an opening quote or emphasis start', () => {
		expect(split('He left. "Why?" she asked. *Odd.*')).toEqual(['He left.', '"Why?" she asked.', '*Odd.*']);
	});
});

describe('abbreviations', () => {
	it.each([
		['Use a fixed effect, e.g. Smith. Then test it.', ['Use a fixed effect, e.g. Smith.', 'Then test it.']],
		['It is robust, i.e. Stable. Done.', ['It is robust, i.e. Stable.', 'Done.']],
		['Dr. Jones met Mr. Brown. They talked.', ['Dr. Jones met Mr. Brown.', 'They talked.']],
		['Treatment vs. Control differed. Good.', ['Treatment vs. Control differed.', 'Good.']],
		['See Fig. 3 for details. It shows more.', ['See Fig. 3 for details.', 'It shows more.']],
		['Compare cf. Table 2. Fine.', ['Compare cf. Table 2.', 'Fine.']],
		['See p. 4 and pp. 5-6. Next.', ['See p. 4 and pp. 5-6.', 'Next.']],
	])('%s', (input, expected) => {
		expect(split(input)).toEqual(expected);
	});

	it('et al. followed by a citation year or lowercase does not split', () => {
		expect(split('Smith et al. (2020) found it. Next.')).toEqual(['Smith et al. (2020) found it.', 'Next.']);
		expect(split('Smith et al. found it. Next.')).toEqual(['Smith et al. found it.', 'Next.']);
	});
	it('et al. and etc. can still end a sentence before a capital', () => {
		expect(split('This was shown by Smith et al. The result held.')).toEqual([
			'This was shown by Smith et al.',
			'The result held.',
		]);
		expect(split('Cats, dogs, etc. They are pets.')).toEqual(['Cats, dogs, etc.', 'They are pets.']);
	});
});

describe('decimals, initials, numbers', () => {
	it('does not split decimals', () => {
		expect(split('The mean was 3.14 overall. Next 2.5 were lower.')).toEqual([
			'The mean was 3.14 overall.',
			'Next 2.5 were lower.',
		]);
	});
	it('splits after p-values like .05', () => {
		expect(split('It was significant (p < .05). Next.')).toEqual(['It was significant (p < .05).', 'Next.']);
		expect(split('Was p < .05. Next.')).toEqual(['Was p < .05.', 'Next.']);
	});
	it('does not split initials', () => {
		expect(split('J. K. Rowling wrote it. Then J.K. Smith read it.')).toEqual([
			'J. K. Rowling wrote it.',
			'Then J.K. Smith read it.',
		]);
		expect(split('Smith, J. A. found it. Next.')).toEqual(['Smith, J. A. found it.', 'Next.']);
	});
	it('does not split file names or domains', () => {
		expect(split('Open notes.md now. Visit example.com today.')).toEqual(['Open notes.md now.', 'Visit example.com today.']);
	});
});

describe('citations and parentheses', () => {
	it('does not break APA-style citations', () => {
		const s = 'This is well established (Smith et al., 2020. p. 4). Another point follows.';
		expect(split(s)).toEqual(['This is well established (Smith et al., 2020. p. 4).', 'Another point follows.']);
	});
	it('does not break et al. inside parentheses', () => {
		const s = 'Prior work (see Jones et al. Smith, 2019) agrees. More follows.';
		expect(split(s)).toEqual(['Prior work (see Jones et al. Smith, 2019) agrees.', 'More follows.']);
	});
	it('does not break inside brackets or pandoc citation keys', () => {
		const s = 'As shown [@smith2020, p. 4. See also @jones2019]. Next.';
		expect(split(s)).toEqual(['As shown [@smith2020, p. 4. See also @jones2019].', 'Next.']);
	});
	it('keeps a citation placed after the period with its sentence', () => {
		expect(split('It holds. [@smith2020] Then more.')).toEqual(['It holds. [@smith2020]', 'Then more.']);
	});
	it('an unbalanced parenthesis does not swallow the paragraph', () => {
		expect(split('Smile :) Then go. Next one.')).toEqual(['Smile :) Then go.', 'Next one.']);
		expect(split('One (unclosed. Two. Three.')).toEqual(['One (unclosed.', 'Two.', 'Three.']);
	});
});

describe('markdown preservation', () => {
	it('keeps wikilinks intact', () => {
		expect(split('See [[Dr. Smith. Notes|notes]] now. Then [[Next]] later.')).toEqual([
			'See [[Dr. Smith. Notes|notes]] now.',
			'Then [[Next]] later.',
		]);
	});
	it('splits before a wikilink even when lowercase', () => {
		expect(split('First. [[lowercase note]] is next.')).toEqual(['First.', '[[lowercase note]] is next.']);
	});
	it('keeps markdown links and URLs intact', () => {
		expect(split('Read [this. page](https://a.com/b.c/d. e) now. Go to https://x.org/a.b. Done.')).toEqual([
			'Read [this. page](https://a.com/b.c/d. e) now.',
			'Go to https://x.org/a.b.',
			'Done.',
		]);
	});
	it('keeps footnote references with the sentence they follow', () => {
		expect(split('A claim.[^1] Another claim.[^note] Last.')).toEqual(['A claim.[^1]', 'Another claim.[^note]', 'Last.']);
	});
	it('keeps inline code intact', () => {
		expect(split('Run `a. B. c()` first. Then stop.')).toEqual(['Run `a. B. c()` first.', 'Then stop.']);
	});
});

describe('never alters text', () => {
	const samples = [
		'Smith et al. (2020) said so (p. 4). [[Note. One]] and **bold.** *x.* Dr. Who? Yes! 3.5 mm.[^1] Done...',
		'Plain. Text. With. Many. Short. Sentences.',
		'Mixed `code. here` and [link. text](u.rl) trailing. J. R. R. Tolkien wrote. Fin.',
	];
	it.each(samples)('rejoins to the original: %s', (s) => {
		expect(split(s).join(' ')).toBe(s);
	});
	it('trims only at the ends and is stable under extra whitespace', () => {
		expect(split('  One.   Two.  ')).toEqual(['One.', 'Two.']);
	});
});

describe('unwrapLines', () => {
	it('turns soft breaks into single spaces', () => {
		expect(unwrapLines('One sentence\n  wrapped. Two.\r\nThree.')).toBe('One sentence wrapped. Two. Three.');
	});
});

describe('splitPhrases', () => {
	it('splits at commas, semicolons and colons', () => {
		expect(splitPhrases('However, the results were clear; we stopped: done.')).toEqual([
			'However,',
			'the results were clear;',
			'we stopped:',
			'done.',
		]);
	});
	it('leaves numbers, citations and links alone', () => {
		expect(splitPhrases('It cost 1,000 dollars (Smith, 2020), per [[A, B]] ok.')).toEqual([
			'It cost 1,000 dollars (Smith, 2020),',
			'per [[A, B]] ok.',
		]);
	});
	it('also splits sentence boundaries and rejoins verbatim', () => {
		const s = 'One, two. Three, four.';
		const parts = splitPhrases(s);
		expect(parts).toEqual(['One,', 'two.', 'Three,', 'four.']);
		expect(parts.join(' ')).toBe(s);
	});
	it('splits before conjunction-like words', () => {
		const s = 'We ran it and it failed because the data were bad, but we tried again.';
		expect(splitPhrases(s)).toEqual([
			'We ran it',
			'and it failed',
			'because the data were bad,',
			'but we tried again.',
		]);
		expect(splitPhrases(s).join(' ')).toBe(s);
	});
	it('does not split inside words, and/or, or "even if"', () => {
		expect(splitPhrases('An orange and/or lemon, even if sour.')).toEqual(['An orange and/or lemon,', 'even if sour.']);
		expect(splitPhrases('It looked as if it worked.')).toEqual(['It looked', 'as if it worked.']);
	});
	it('does not split on starters inside protected spans', () => {
		expect(splitPhrases('See (cats and dogs) or [[this and that]] now.')).toEqual([
			'See (cats and dogs)',
			'or [[this and that]] now.',
		]);
	});
	it('splits before "as" but keeps "as well as" and "such as" together', () => {
		expect(splitPhrases('He left early as it was late.')).toEqual(['He left early', 'as it was late.']);
		expect(splitPhrases('Cats as well as dogs, such as pugs, ran.')).toEqual([
			'Cats',
			'as well as dogs,',
			'such as pugs,',
			'ran.',
		]);
	});
});

describe('options', () => {
	it('honors extra abbreviations', () => {
		expect(splitSentences('See the Gov. Report now. Then go.')).toEqual(['See the Gov.', 'Report now.', 'Then go.']);
		expect(splitSentences('See the Gov. Report now. Then go.', ['gov'])).toEqual(['See the Gov. Report now.', 'Then go.']);
	});
	it('can turn off punctuation or word splitting', () => {
		const s = 'We ran it, and it failed.';
		expect(splitPhrases(s, { words: [] })).toEqual(['We ran it,', 'and it failed.']);
		expect(splitPhrases(s, { punctuation: false })).toEqual(['We ran it, ', 'and it failed.'].map((x) => x.trim()));
	});
	it('accepts a custom word list, escaping regex characters', () => {
		expect(splitPhrases('Go left so we win.', { words: ['so'], punctuation: false })).toEqual(['Go left', 'so we win.']);
		expect(splitPhrases('Odd a.b word here.', { words: ['a.b'], punctuation: false })).toEqual(['Odd', 'a.b word here.']);
	});
});

describe('parseWordList', () => {
	it('splits on commas, semicolons and whitespace, lowercases, dedupes and drops junk', () => {
		expect(parseWordList('And, but;  Because\nbut Univ. (bad) x')).toEqual(['and', 'but', 'because', 'univ', 'x']);
		expect(parseWordList('')).toEqual([]);
	});
});

describe('placeholders and selection splitting', () => {
	const sentence = 'Genetic factors are thought to contribute to XYZ of the liability for autism.';
	it('isolates a placeholder as its own phrase', () => {
		expect(splitPhrases(sentence, { placeholders: ['XYZ'] })).toEqual([
			'Genetic factors are thought to contribute to',
			'XYZ',
			'of the liability for autism.',
		]);
	});
	it('keeps trailing punctuation with the placeholder and leaves other text alone', () => {
		expect(splitPhrases('It was XYZ, and then TBD.', { placeholders: ['XYZ', 'TBD'], words: [] })).toEqual([
			'It was',
			'XYZ,',
			'and then',
			'TBD.',
		]);
		expect(splitPhrases('XYZZY and abcXYZ stay.', { placeholders: ['XYZ'], words: [] })).toEqual(['XYZZY and abcXYZ stay.']);
	});
	it('does nothing without placeholders', () => {
		expect(splitPhrases(sentence, { words: [] })).toEqual([sentence]);
	});
	it('recognizes placeholder pieces', () => {
		expect(isPlaceholder('XYZ', ['XYZ'])).toBe(true);
		expect(isPlaceholder('XYZ,', ['XYZ'])).toBe(true);
		expect(isPlaceholder('to XYZ', ['XYZ'])).toBe(false);
	});
	it('parses a case-preserving token list', () => {
		expect(parseTokenList('XYZ, TBD ___;XYZ')).toEqual(['XYZ', 'TBD', '___']);
	});
	it('splits around a selection and drops empty parts', () => {
		const t = 'contribute to XYZ of the liability';
		expect(splitAround(t, 14, 17)).toEqual({ parts: ['contribute to', 'XYZ', 'of the liability'], middle: 1 });
		expect(splitAround(t, 0, 10)).toEqual({ parts: ['contribute', 'to XYZ of the liability'], middle: 0 });
		expect(splitAround(t, 0, t.length)).toEqual({ parts: [t], middle: 0 });
		expect(splitAround(t, 3, 3)).toBeNull();
	});
});

describe('split marks', () => {
	const typed =
		'Genetic differences ~ are thought to contribute to~ the lions share ~of the liability for autism,~ with estimated heritability as responsible for 50-90% of the vulnerability to the disorder~.';
	it('cuts at marks, deletes them, and trims', () => {
		expect(explodeText(typed, { phrases: true, mark: '~' })).toEqual([
			'Genetic differences',
			'are thought to contribute to',
			'the lions share',
			'of the liability for autism,',
			'with estimated heritability as responsible for 50-90% of the vulnerability to the disorder.',
		]);
	});
	it('uses marks in the sentence command too, and keeps unmarked sentences whole', () => {
		expect(explodeText('One ~ two. Three, and four. Five~ six.', { phrases: false, mark: '~' })).toEqual([
			'One',
			'two.',
			'Three, and four.',
			'Five',
			'six.',
		]);
	});
	it('ignores doubled tildes (markdown strikethrough)', () => {
		expect(hasMark('a ~~struck~~ word', '~')).toBe(false);
		expect(explodeText('a ~~struck~~ word, and more.', { phrases: false, mark: '~' })).toEqual(['a ~~struck~~ word, and more.']);
	});
	it('falls back to automatic splitting without marks, or with the mark disabled', () => {
		expect(explodeText('One, and two. Three.', { phrases: true, mark: '~' })).toEqual(['One,', 'and two.', 'Three.']);
		expect(explodeText('A ~ b. C.', { phrases: false, mark: '' })).toEqual(['A ~ b.', 'C.']);
	});
	it('supports a different or multi-character mark', () => {
		expect(splitAtMarks('a || b || c', '||')).toEqual(['a', 'b', 'c']);
		expect(splitAtMarks('a / b.', '/')).toEqual(['a', 'b.']);
	});
	it('still isolates placeholders in marked phrase mode', () => {
		expect(explodeText('Up to XYZ of it ~ is true.', { phrases: true, mark: '~', placeholders: ['XYZ'] })).toEqual([
			'Up to',
			'XYZ',
			'of it',
			'is true.',
		]);
	});
});
