import type { KeysField, Schema } from '../src/index.ts';

export const keys: KeysField = {
  type: 'keys',
  path: ['shortcuts'],
  label: 'Shortcuts',
  commands: [
    { id: 'a', label: 'A', default: ['x'] },
    { id: 'b', label: 'B', default: ['y'] },
    { id: 'c', label: 'C', default: [','] },
  ],
  yielding: ['c'],
};

export const demo: Schema = {
  app: 'demo',
  file: 'config.yaml',
  sections: [
    {
      id: 'main',
      title: 'Main',
      fields: [
        {
          type: 'choice',
          path: ['theme'],
          label: 'Theme',
          options: [
            { value: 'system', label: 'System' },
            { value: 'dark', label: 'Dark' },
          ],
          default: 'system',
        },
        { type: 'number', path: ['delay'], label: 'Delay', default: 1, min: 0 },
        {
          type: 'set',
          path: ['folded'],
          label: 'Folded',
          options: [
            { value: 'x1', label: 'X1' },
            { value: 'x2', label: 'X2' },
          ],
          default: ['x2'],
          retired: ['overdue'],
        },
        { type: 'number', path: ['habits', 'goal'], label: 'Goal', default: 30, integer: true, min: 1, max: 999 },
        { type: 'number', path: ['habits', 'misses'], label: 'Misses', default: '10%', percent: true, min: 0, max: 100 },
        keys,
      ],
    },
  ],
};
