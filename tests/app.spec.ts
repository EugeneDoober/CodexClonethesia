import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import MidiPackage from '@tonejs/midi';

const { Midi } = MidiPackage;

const position = (page: Page) => page.getByRole('slider', { name: 'Song position' });
const readPosition = async (page: Page) => Number(await position(page).inputValue());

async function movePlayhead(page: Page, seconds: number): Promise<void> {
  // Range inputs cannot be filled by Playwright. Use their native setter and
  // input event so React receives the same change as a slider interaction.
  await position(page).evaluate((element, value) => {
    const input = element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, seconds);
  await expect.poll(() => readPosition(page)).toBeCloseTo(seconds, 2);
}

async function keyFor(page: Page, pitch: string): Promise<string> {
  return (await page.getByRole('button', { name: `Play ${pitch}`, exact: true }).locator('.binding').innerText()).toLowerCase();
}

function fixtureMidi(chord = false): Buffer {
  const midi = new Midi();
  midi.name = 'Keyboard Etude';
  midi.header.tempos = [{ ticks: 0, bpm: 80 }];
  midi.header.update();
  const track = midi.addTrack();
  track.addNote({ midi: 64, time: 0, duration: 0.5, velocity: 0.8 });
  if (chord) track.addNote({ midi: 67, time: 0, duration: 0.5, velocity: 0.7 });
  track.addNote({ midi: 69, time: 2, duration: 0.8, velocity: 0.8 });
  return Buffer.from(midi.toArray());
}

async function uploadMidi(page: Page, chord = false): Promise<void> {
  await page.getByLabel('Import MIDI file').setInputFiles({ name: 'keyboard-etude.mid', mimeType: 'audio/midi', buffer: fixtureMidi(chord) });
  await expect(page.getByRole('region', { name: 'Current song' }).getByRole('heading')).toContainText('Keyboard Etude');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Find your flow.' })).toBeVisible();
  await page.getByRole('button', { name: 'Choose a song', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /First Light/ }).click();
  await expect(page.getByRole('region', { name: 'Current song' }).getByRole('heading')).toContainText('First Light');
});

test('opens the provided Runaway transcription by default and teaches its actual first chord', async ({ page }) => {
  // Revisit the app to test its default state, independent of demo-based cases.
  await page.goto('/');
  const currentSong = page.getByRole('region', { name: 'Current song' });
  await expect(currentSong.getByRole('heading')).toContainText('Runaway');
  await expect(currentSong).toContainText('Kanye West');
  await expect(currentSong).toContainText('Piano transcription');
  expect(Number(await position(page).getAttribute('max'))).toBeCloseTo(338.363636, 2);

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.learning-status')).toContainText('Your turn · E5 + E6');
  expect(await readPosition(page)).toBeCloseTo(1.76, 2);
  await page.keyboard.press(await keyFor(page, 'E5'));
  await expect(page.locator('.learning-status')).toContainText('Your turn · E6');
  await page.waitForTimeout(200);
  expect(await readPosition(page)).toBeCloseTo(1.76, 2);
  await page.keyboard.press(await keyFor(page, 'E6'));
  await expect.poll(() => readPosition(page)).toBeGreaterThan(1.8);
  await expect(page.locator('.accuracy strong')).toHaveText('100%');

  await page.getByRole('button', { name: 'Choose a song', exact: true }).click();
  const library = page.getByRole('dialog');
  await expect(library.getByRole('button', { name: /Runaway/ })).toBeVisible();
  await library.getByRole('button', { name: /First Light/ }).click();
  await expect(currentSong.getByRole('heading')).toContainText('First Light');
  await page.getByRole('button', { name: 'Choose a song', exact: true }).click();
  await library.getByRole('button', { name: /Runaway/ }).click();
  await expect(currentSong.getByRole('heading')).toContainText('Runaway');
  await expect(position(page)).toHaveValue('0');
});

test('Learn waits for the correct computer key, then advances the music', async ({ page }) => {
  const rightKey = await keyFor(page, 'E4');
  const wrongKey = await keyFor(page, 'G4');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.learning-status')).toContainText('Your turn · E4');
  await page.keyboard.press(wrongKey);
  // Give the real animation loop time to run: a wrong key must not unblock it.
  await page.waitForTimeout(300);
  expect(await readPosition(page)).toBe(0);
  await expect(page.locator('.accuracy strong')).toHaveText('—');
  await page.keyboard.press(rightKey);
  await expect.poll(() => readPosition(page)).toBeGreaterThan(0.15);
  await expect(page.locator('.accuracy strong')).toHaveText('100%');
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});

test('Learn accepts chord notes separately and waits until both are played', async ({ page }) => {
  await uploadMidi(page, true);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.learning-status')).toContainText('E4 + G4');
  await page.keyboard.press(await keyFor(page, 'E4'));
  await expect(page.locator('.learning-status')).toContainText('Your turn · G4');
  await page.waitForTimeout(200);
  expect(await readPosition(page)).toBe(0);
  await page.keyboard.press(await keyFor(page, 'G4'));
  await expect.poll(() => readPosition(page)).toBeGreaterThan(0.15);
});

test('Listen advances without input, pause freezes, restart resets and seek works', async ({ page }) => {
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => readPosition(page)).toBeGreaterThan(0.35);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await readPosition(page);
  await page.waitForTimeout(200);
  expect(await readPosition(page)).toBe(paused);
  await page.getByRole('button', { name: 'Restart song' }).click();
  await expect(position(page)).toHaveValue('0');
  await page.keyboard.press('ArrowRight');
  expect(await readPosition(page)).toBe(5);
  await page.keyboard.press('ArrowLeft');
  expect(await readPosition(page)).toBe(0);
});

test('song completion updates the final position and Play button, then replay starts over', async ({ page }) => {
  await uploadMidi(page);
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await page.getByRole('button', { name: 'Increase tempo' }).click({ clickCount: 3 });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  expect(await readPosition(page)).toBeCloseTo(Number(await position(page).getAttribute('max')), 1);
  await expect(page.locator('.learning-status')).toContainText('Beautiful work');
  await expect(page.locator('.piano-key.automatic')).toHaveCount(0);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  expect(await readPosition(page)).toBeLessThan(1);
});

test('loop markers constrain playback and wrap back from B to A', async ({ page }) => {
  await uploadMidi(page);
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await movePlayhead(page, 0.5);
  await page.getByRole('button', { name: 'Set loop start', exact: true }).click();
  await movePlayhead(page, 1.5);
  await page.getByRole('button', { name: 'Set loop end', exact: true }).click();
  await page.getByRole('button', { name: 'Loop section', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Loop section', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const samples = await page.evaluate(async () => {
    const slider = document.querySelector<HTMLInputElement>('input[aria-label="Song position"]')!;
    const started = performance.now();
    const values: number[] = [];
    return new Promise<number[]>(resolve => {
      const sample = () => {
        values.push(Number(slider.value));
        if (performance.now() - started >= 1800) resolve(values);
        else requestAnimationFrame(sample);
      };
      sample();
    });
  });
  expect(Math.min(...samples)).toBeGreaterThanOrEqual(0.5);
  expect(Math.max(...samples)).toBeLessThanOrEqual(1.5);
  expect(samples.some((value, index) => index > 0 && samples[index - 1] - value > 0.5)).toBe(true);
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Restart song' }).click();
  expect(await readPosition(page)).toBe(0.5);
});

test('Perform keeps moving after missed notes and restart clears the score', async ({ page }) => {
  await uploadMidi(page);
  await page.getByRole('button', { name: 'Perform', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => readPosition(page)).toBeGreaterThan(0.3);
  await expect(page.locator('.accuracy strong')).toHaveText('0%');
  await expect(page.locator('.learning-status')).not.toContainText('Your turn');
  await page.getByRole('button', { name: 'Restart song' }).click();
  await expect(position(page)).toHaveValue('0');
  await expect(page.locator('.accuracy strong')).toHaveText('—');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});

test('valid MIDI becomes playable and remains selectable in the song library', async ({ page }) => {
  await uploadMidi(page);
  await expect(page.getByRole('status')).toContainText('2 notes to explore');
  await expect(page.getByRole('region', { name: 'Current song' })).toContainText('80 BPM');
  expect(Number(await position(page).getAttribute('max'))).toBeCloseTo(2.8, 1);
  await page.getByRole('button', { name: 'Change song' }).click();
  const library = page.getByRole('dialog');
  await library.getByRole('button', { name: /Paper Planes/ }).click();
  await expect(page.getByRole('region', { name: 'Current song' }).getByRole('heading')).toContainText('Paper Planes');
  await page.getByRole('button', { name: 'Change song' }).click();
  await library.getByRole('button', { name: /Keyboard Etude/ }).click();
  await expect(page.getByRole('region', { name: 'Current song' }).getByRole('heading')).toContainText('Keyboard Etude');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.learning-status')).toContainText('Your turn · E4');
});

test('malformed MIDI gives an actionable message and preserves the selected song', async ({ page }) => {
  await page.getByLabel('Import MIDI file').setInputFiles({ name: 'broken.mid', mimeType: 'audio/midi', buffer: Buffer.from('this is not MIDI') });
  await expect(page.getByRole('status')).toContainText('Choose a standard .mid or .midi file');
  await expect(page.getByRole('region', { name: 'Current song' }).getByRole('heading')).toContainText('First Light');
  await page.getByRole('button', { name: 'Dismiss notification' }).click();
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('fixed piano mapping and octave shortcuts change the notes played', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Keyboard layout' }).selectOption('fixed');
  await expect(page.getByRole('button', { name: 'Play C4', exact: true }).locator('.binding')).toHaveText('A');
  await expect(page.getByRole('button', { name: 'Play E4', exact: true }).locator('.binding')).toHaveText('D');
  await page.getByRole('button', { name: 'Higher octave' }).click();
  await expect(page.getByRole('button', { name: 'Play C5', exact: true }).locator('.binding')).toHaveText('A');
  await page.keyboard.press('[');
  await expect(page.getByRole('button', { name: 'Play C4', exact: true }).locator('.binding')).toHaveText('A');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.keyboard.down('d');
  await expect(page.getByRole('button', { name: 'Play E4', exact: true })).toHaveClass(/pressed/);
  await page.keyboard.up('d');
  await expect(page.getByRole('button', { name: 'Play E4', exact: true })).not.toHaveClass(/pressed/);
  await expect.poll(() => readPosition(page)).toBeGreaterThan(0.1);
});

test('help traps focus, suppresses piano shortcuts and restores focus on Escape', async ({ page }) => {
  const opener = page.getByRole('button', { name: 'Learn how to play', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Let’s play' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeFocused();
  await dialog.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test('keeps controls within the document width and supports tapping piano notes', async ({ page }) => {
    await expect(page.getByRole('region', { name: 'Piano practice studio' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.getByRole('button', { name: 'Play', exact: true }).tap();
    await expect(page.locator('.learning-status')).toContainText('Your turn · E4');
    await page.getByRole('button', { name: 'Play E4', exact: true }).tap();
    await expect.poll(() => readPosition(page)).toBeGreaterThan(0.1);
  });
});
