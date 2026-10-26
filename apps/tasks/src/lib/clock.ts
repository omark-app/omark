/** The time source of the store; tests pass a fixed one. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
