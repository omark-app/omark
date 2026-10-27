/** Where a setting sits in the file: ['theme'], ['habits', 'goal'], ['shortcuts', 'complete']. */
export type Path = readonly string[];

interface Base {
  path: Path;
  label: string;
  hint?: string;
}

export interface ChoiceField extends Base {
  type: 'choice';
  options: { value: string; label: string }[];
  default: string;
  ignoreCase?: boolean;
  /** Replaces "one of: a, b" in the error message. */
  describe?: string;
  display?: 'segmented' | 'select';
}

export interface NumberField extends Base {
  type: 'number';
  default: number | string;
  min?: number;
  max?: number;
  integer?: boolean;
  /** Also accepts '0%' to '100%' strings. */
  percent?: boolean;
}

export interface SetField extends Base {
  type: 'set';
  options: { value: string; label: string }[];
  default: string[];
  /** Names an older file may still hold; they read without an error and are dropped. */
  retired?: string[];
}

export interface KeysField extends Base {
  type: 'keys';
  commands: { id: string; label: string; default: string[] }[];
  /** Commands whose default keys give way to a key the file binds to another command. */
  yielding?: string[];
  /** Rows shown before "Show all". */
  visible?: number;
}

export type Field = ChoiceField | NumberField | SetField | KeysField;

export interface Section {
  id: string;
  title: string;
  fields: Field[];
  accent?: string;
}

export interface Schema {
  app: string;
  file: string;
  sections: Section[];
}

/** Keyed by `fieldId`; a keys field holds Record<command, string[]>. */
export type Values = Record<string, unknown>;

export interface SettingsError {
  /** 1-based, null if unknown. */
  line: number | null;
  message: string;
}

export const fieldId = (f: Field): string => f.path.join('.');

export const allFields = (s: Schema): Field[] => s.sections.flatMap((sec) => sec.fields);

function defaultOf(f: Field): unknown {
  switch (f.type) {
    case 'set':
      return [...f.default];
    case 'keys':
      return Object.fromEntries(f.commands.map((c) => [c.id, [...c.default]]));
    default:
      return f.default;
  }
}

export const defaults = (s: Schema): Values => Object.fromEntries(allFields(s).map((f) => [fieldId(f), defaultOf(f)]));
