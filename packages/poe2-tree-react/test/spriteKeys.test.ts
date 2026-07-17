import { describe, expect, it } from 'vitest';
import { arcConnectorKeyFor, effectKeyFor, frameKeyFor, iconKeyFor, lineConnectorKeyFor } from '../src/spriteKeys.js';

const ICON = 'Art/2DArt/SkillIcons/passives/Foo.png';

describe('iconKeyFor', () => {
  it('picks the icon variant from the node kind', () => {
    expect(iconKeyFor('keystone', ICON)).toBe(`keystoneActive:${ICON}`);
    expect(iconKeyFor('notable', ICON)).toBe(`notableActive:${ICON}`);
    expect(iconKeyFor('ascendancyNotable', ICON)).toBe(`notableActive:${ICON}`);
    expect(iconKeyFor('normal', ICON)).toBe(`normalActive:${ICON}`);
    expect(iconKeyFor('attribute', ICON)).toBe(`normalActive:${ICON}`);
  });

  it('yields null for kinds drawn without a skill icon and for an empty path', () => {
    expect(iconKeyFor('mastery', ICON)).toBeNull(); //         drawn as an effect pattern
    expect(iconKeyFor('ascendancyStart', ICON)).toBeNull(); // frame-only node
    expect(iconKeyFor('normal', '')).toBeNull(); //            no icon path at all
  });
});

describe('connector keys', () => {
  it('keys an orbit arc by orbit number and allocation state', () => {
    expect(arcConnectorKeyFor(2, true)).toBe('Orbit2Active');
    expect(arcConnectorKeyFor(4, false)).toBe('Orbit4Normal');
  });

  it('keys a straight line by allocation state', () => {
    expect(lineConnectorKeyFor(true)).toBe('LineConnectorActive');
    expect(lineConnectorKeyFor(false)).toBe('LineConnectorNormal');
  });
});

describe('frameKeyFor', () => {
  it('keys the framed kinds by kind and allocation state', () => {
    expect(frameKeyFor('keystone', true)).toBe('KeystoneFrameAllocated');
    expect(frameKeyFor('keystone', false)).toBe('KeystoneFrameUnallocated');
    expect(frameKeyFor('notable', true)).toBe('NotableFrameAllocated');
    expect(frameKeyFor('jewel', false)).toBe('JewelFrameUnallocated');
    expect(frameKeyFor('ascendancyNotable', true)).toBe('AscendancyFrameNotableAllocated');
    expect(frameKeyFor('ascendancyNormal', false)).toBe('AscendancyFrameNormalUnallocated');
  });

  it('gives the ascendancy start its single stateless frame', () => {
    expect(frameKeyFor('ascendancyStart', true)).toBe('AscendancyStartNode');
    expect(frameKeyFor('ascendancyStart', false)).toBe('AscendancyStartNode');
  });

  it('gives masteries no frame', () => {
    expect(frameKeyFor('mastery', true)).toBeNull();
    expect(frameKeyFor('mastery', false)).toBeNull();
  });

  it('falls back to the small-node frame naming for the remaining kinds', () => {
    expect(frameKeyFor('normal', true)).toBe('PSSkillFrameActive');
    expect(frameKeyFor('normal', false)).toBe('PSSkillFrame');
    expect(frameKeyFor('attribute', true)).toBe('PSSkillFrameActive');
    expect(frameKeyFor('classStart', false)).toBe('PSSkillFrame');
  });
});

describe('effectKeyFor', () => {
  it('keys a GGG-sourced pattern path (already carrying .png) without doubling the extension', () => {
    // Regression: GGG `activeEffectImage` values include the `.png` extension,
    // whereas PoB-era values did not. Appending `.png` unconditionally produced
    // `...Pattern.png.png`, which no atlas frame matched - masteries went blank.
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
