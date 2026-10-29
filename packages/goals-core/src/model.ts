/** Calendar date as `YYYY-MM-DD`. */
export type ISODate = string;

/**
 * A checkbox line in an area (Goals spec 5.1). `line` is its index in the area's `lines`. `text` is the line
 * without its checkbox, dates and project code; `code` is upper case. `doneOn` is only read on achieved goals.
 */
export interface Goal {
  line: number;
  text: string;
  achieved: boolean;
  /** 📅 */
  due: ISODate | null;
  /** ➕ */
  setOn: ISODate | null;
  /** ✏️ */
  changedOn: ISODate | null;
  /** ✅ */
  doneOn: ISODate | null;
  code: string | null;
}

/** An area's picture: the first line in it that is only a Markdown image. `path` is relative to `goals.md`. */
export interface Picture {
  alt: string;
  path: string;
}

/**
 * A `##` section other than Not now. `lines` are its heading and every line up to the next `##`, as read
 * or as last edited; the other fields are read from them. `tag` is as written (compare ignoring case).
 */
export interface Area {
  kind: 'area';
  lines: string[];
  name: string;
  tag: string | null;
  picture: Picture | null;
  /** The area's other text before its first goal, on one line. */
  vision: string;
  goals: Goal[];
}

/** A top-level list line in Not now; `line` is its index in the section's `lines`. */
export interface NotNowItem {
  line: number;
  text: string;
}

export interface NotNow {
  kind: 'notNow';
  lines: string[];
  items: NotNowItem[];
}

export type Section = Area | NotNow;

/**
 * A parsed `goals.md`. `head` is every line before the first `##`; `vision` is read from it (the text under
 * its first `#` heading). `sections` are in file order.
 */
export interface GoalsDoc {
  head: string[];
  vision: string;
  sections: Section[];
}
