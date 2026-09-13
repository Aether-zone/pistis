import { isReadable, readableInkFor } from '../src/app/login/readable-ink';

/*
 * A client picks its own colour, so the panel's text colour cannot be a fixed
 * near-white. The first version of this page mixed toward white regardless and
 * rendered unreadable copy on a pale yellow.
 */
describe('readableInkFor', () => {
  it('takes white onto a dark colour', () => {
    expect(readableInkFor('#2563eb')).toBe('#ffffff');
    expect(readableInkFor('#111827')).toBe('#ffffff');
  });

  it('takes dark ink onto a pale one', () => {
    // #facc15 is the case that caught this: a flat yellow, entirely plausible
    // for a client to choose, on which white text cannot be read.
    expect(readableInkFor('#facc15')).toBe('#111827');
    expect(readableInkFor('#ffffff')).toBe('#111827');
  });

  it('reads the hex whatever case it is written in', () => {
    expect(readableInkFor('#FACC15')).toBe(readableInkFor('#facc15'));
  });

  it('falls back to white for anything that is not a hex colour', () => {
    // The schema refuses bad input; this only has to not make it worse by
    // rendering no legible text at all.
    for (const bad of ['', 'blue', '#abc', '2563eb', '#12345g']) {
      expect(readableInkFor(bad)).toBe('#ffffff');
    }
  });

  /*
   * The property that actually matters: whatever colour comes out of the
   * database, the ink chosen for it clears the contrast floor the panel's copy
   * needs. Checked across the hue circle at several lightnesses rather than on
   * a handful of favourites.
   */
  it('always clears 3:1, across the whole colour space', () => {
    const failures: string[] = [];

    for (let r = 0; r < 256; r += 51) {
      for (let g = 0; g < 256; g += 51) {
        for (let b = 0; b < 256; b += 51) {
          const colour = `#${[r, g, b]
            .map((channel) => channel.toString(16).padStart(2, '0'))
            .join('')}`;

          if (!isReadable(readableInkFor(colour), colour)) {
            failures.push(colour);
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
