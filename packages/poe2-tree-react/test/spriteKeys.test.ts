import { describe, expect, it } from 'vitest';
import { effectKeyFor } from '../src/spriteKeys.js';

describe('effectKeyFor', () => {
  it('keys a GGG-sourced pattern path (already carrying .png) without doubling the extension', () => {
    // Regression: GGG `activeEffectImage` values include the `.png` extension,
    // whereas PoB-era values did not. Appending `.png` unconditionally produced
    // `...Pattern.png.png`, which no atlas frame matched — masteries went blank.
    expect(effectKeyFor('Art/2DArt/UIImages/InGame/PassiveMastery/MasteryLightningPattern.png')).toBe(
      'masteryEffectActive:Art/2DArt/UIImages/InGame/PassiveMastery/MasteryLightningPattern.png',
    );
  });

  it('appends .png for an extension-less (PoB-era) pattern key', () => {
    expect(effectKeyFor('Art/2DArt/MasteryLightningPattern')).toBe(
      'masteryEffectActive:Art/2DArt/MasteryLightningPattern.png',
    );
  });
});
