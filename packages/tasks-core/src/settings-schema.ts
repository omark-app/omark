import type { Schema } from '@omark/settings';

/** Every setting of Omark Tasks. The config reader and the Settings page both read this. */
export const TASKS_SCHEMA: Schema = {
  app: 'Omark Tasks',
  file: 'Apps/Omark Tasks/config.yaml',
  sections: [
    {
      id: 'general',
      title: 'General',
      fields: [
        {
          type: 'choice',
          path: ['theme'],
          label: 'Theme',
          options: [
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ],
          default: 'system',
          display: 'segmented',
        },
        {
          type: 'choice',
          path: ['defaultView'],
          label: 'Desktop view on open',
          options: [
            { value: 'list', label: 'Task list' },
            { value: 'board', label: 'Week board' },
          ],
          default: 'list',
          display: 'segmented',
        },
        {
          type: 'choice',
          path: ['firstDayOfWeek'],
          label: 'First day of the week',
          options: [
            { value: 'monday', label: 'Monday' },
            { value: 'tuesday', label: 'Tuesday' },
            { value: 'wednesday', label: 'Wednesday' },
            { value: 'thursday', label: 'Thursday' },
            { value: 'friday', label: 'Friday' },
            { value: 'saturday', label: 'Saturday' },
            { value: 'sunday', label: 'Sunday' },
          ],
          default: 'monday',
          ignoreCase: true,
          describe: 'a day name: monday, tuesday, wednesday, thursday, friday, saturday, sunday',
          display: 'select',
        },
        {
          type: 'choice',
          path: ['dateLabels'],
          label: 'Date labels',
          options: [
            { value: 'short', label: 'Thu · 12 Nov' },
            { value: 'iso', label: '2026-11-12' },
          ],
          default: 'short',
          display: 'segmented',
        },
        {
          type: 'choice',
          path: ['newTaskBucket'],
          label: 'New tasks go to',
          options: [
            { value: 'today', label: 'Today' },
            { value: 'tomorrow', label: 'Tomorrow' },
            { value: 'week', label: 'This week' },
            { value: 'next', label: 'Next week' },
            { value: 'someday', label: 'Someday' },
          ],
          default: 'today',
          display: 'select',
        },
        {
          type: 'number',
          path: ['saveDelaySeconds'],
          label: 'Save after typing stops',
          hint: 'seconds',
          default: 1,
          min: 0,
        },
      ],
    },
    {
      id: 'buckets',
      title: 'Buckets',
      fields: [
        {
          type: 'set',
          path: ['foldedOnOpen'],
          label: 'Folded when the app opens',
          hint: 'Empty buckets start folded anyway.',
          options: [
            { value: 'today', label: 'Today' },
            { value: 'tomorrow', label: 'Tomorrow' },
            { value: 'week', label: 'This week' },
            { value: 'next', label: 'Next week' },
            { value: 'later', label: 'Later' },
            { value: 'someday', label: 'Someday' },
          ],
          default: ['later', 'someday'],
          // Overdue is in Today since #26; older files may still name it.
          retired: ['overdue'],
        },
      ],
    },
    {
      id: 'keyboard',
      title: 'Keyboard',
      fields: [
        {
          type: 'keys',
          path: ['shortcuts'],
          label: 'Keyboard shortcuts',
          commands: [
            { id: 'focusAdd', label: 'Focus the add box', default: ['/', 'n'] },
            { id: 'down', label: 'Down', default: ['j', 'ArrowDown'] },
            { id: 'up', label: 'Up', default: ['k', 'ArrowUp'] },
            { id: 'today', label: 'Today', default: ['t'] },
            { id: 'tomorrow', label: 'Tomorrow', default: ['m'] },
            { id: 'thisWeek', label: 'This week', default: ['w'] },
            { id: 'nextWeek', label: 'Next week', default: ['e'] },
            { id: 'pickDate', label: 'Pick a date', default: ['d'] },
            { id: 'someday', label: 'Someday', default: ['s'] },
            { id: 'repeat', label: 'Repeat', default: ['r'] },
            { id: 'important', label: 'Important on or off', default: ['i'] },
            { id: 'complete', label: 'Complete', default: ['x'] },
            { id: 'edit', label: 'Edit', default: ['Enter'] },
            { id: 'delete', label: 'Delete', default: ['Delete', 'Backspace'] },
            { id: 'deselect', label: 'Deselect', default: ['Escape'] },
            { id: 'undo', label: 'Undo', default: ['z'] },
            { id: 'switchView', label: 'Switch view', default: ['v'] },
            { id: 'search', label: 'Search', default: ['f'] },
            { id: 'settings', label: 'Open settings', default: [','] },
          ],
          // Commands added after configs were already written (#19, settings page): left unset, their
          // default keys give way to a key the file binds to another command, so an older config never fails.
          yielding: ['tomorrow', 'important', 'settings'],
          visible: 4,
        },
      ],
    },
  ],
};
