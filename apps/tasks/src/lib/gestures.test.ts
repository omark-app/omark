import { describe, expect, it } from 'vitest';
import { GestureTracker } from './gestures.ts';

/** A tracker with the finger down at (100, 100) at t = 0. */
function pressed(): GestureTracker {
  const g = new GestureTracker();
  g.down(100, 100, 0);
  return g;
}

describe('GestureTracker', () => {
  it('reads a quick press and release as a tap', () => {
    const g = pressed();
    expect(g.up(120)).toBe('tap');
  });

  it('reads a 120 px move to the right as swipeRight, and to the left as swipeLeft', () => {
    const right = pressed();
    expect(right.move(220, 100, 60)).toBe('swipe');
    expect(right.dx).toBe(120);
    expect(right.up(80)).toBe('swipeRight');

    const left = pressed();
    expect(left.move(-20, 100, 60)).toBe('swipe');
    expect(left.dx).toBe(-120);
    expect(left.up(80)).toBe('swipeLeft');
  });

  it('lets a swipe short of 90 px go with no result', () => {
    const g = pressed();
    expect(g.move(150, 100, 60)).toBe('swipe');
    expect(g.up(80)).toBe('none');
  });

  it('commits a swipe at exactly 90 px', () => {
    const g = pressed();
    g.move(190, 100, 60);
    expect(g.up(80)).toBe('swipeRight');
  });

  it('starts a swipe only once the move is mostly horizontal', () => {
    const g = pressed();
    expect(g.move(112, 110, 40)).toBe('scroll'); // 12 right, 10 down: not 1.3 times as wide as tall
  });

  it('treats a vertical move as a scroll, which ends with no result', () => {
    const g = pressed();
    expect(g.move(100, 130, 60)).toBe('scroll');
    expect(g.move(250, 130, 80)).toBe('scroll');
    expect(g.up(100)).toBe('none');
  });

  it('turns a still hold into a drag that stays a drag, and its release into a drop', () => {
    const g = pressed();
    expect(g.tick(399)).toBe('pending');
    expect(g.tick(420)).toBe('drag');
    expect(g.move(100, 300, 500)).toBe('drag');
    expect(g.move(300, 300, 520)).toBe('drag');
    expect(g.up(600)).toBe('drop');
  });

  it('counts a long still press released before any tick as a drop, not a tap', () => {
    const g = pressed();
    expect(g.up(450)).toBe('drop');
  });

  it('never drags after moving past the 8 px slop', () => {
    const sideways = pressed();
    expect(sideways.move(109, 100, 200)).toBe('pending');
    expect(sideways.tick(500)).toBe('pending');
    expect(sideways.up(520)).toBe('none');

    const down = pressed();
    expect(down.move(100, 109, 200)).toBe('scroll');
    expect(down.tick(500)).toBe('scroll');
  });

  it('allows small jitter within the slop while holding', () => {
    const g = pressed();
    expect(g.move(105, 104, 100)).toBe('pending');
    expect(g.tick(420)).toBe('drag');
  });

  it('never turns a swipe into a drag', () => {
    const g = pressed();
    expect(g.move(130, 100, 50)).toBe('swipe');
    expect(g.tick(500)).toBe('swipe');
    expect(g.move(130, 100, 900)).toBe('swipe');
    expect(g.up(1000)).toBe('none');
  });

  it('is ended after the release', () => {
    const g = pressed();
    g.up(100);
    expect(g.move(300, 100, 120)).toBe('ended');
    expect(g.tick(600)).toBe('ended');
    expect(g.up(700)).toBe('none');
  });

  it('takes custom thresholds', () => {
    const g = new GestureTracker({ holdMs: 200, slop: 4, swipeStart: 20, swipeCommit: 50 });
    g.down(0, 0, 0);
    expect(g.move(15, 0, 10)).toBe('pending');
    expect(g.move(60, 0, 20)).toBe('swipe');
    expect(g.up(30)).toBe('swipeRight');

    const hold = new GestureTracker({ holdMs: 200 });
    hold.down(0, 0, 0);
    expect(hold.tick(200)).toBe('drag');
  });
});
