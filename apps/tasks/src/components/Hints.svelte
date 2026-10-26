<div class="hints" data-testid="hints">
  <span><kbd>/</kbd> add</span><span><kbd>j</kbd><kbd>k</kbd> move</span><span><kbd>↵</kbd> edit</span>
  <span><kbd>t</kbd><kbd>m</kbd><kbd>w</kbd><kbd>e</kbd> today · tomorrow · week · next</span><span><kbd>d</kbd> date</span><span><kbd>s</kbd> someday</span>
  <span><kbd>r</kbd> repeat</span><span><kbd>i</kbd> important</span><span><kbd>x</kbd> done</span><span><kbd>del</kbd> delete</span><span><kbd>z</kbd> undo</span><span><kbd>f</kbd> search</span><span><kbd>esc</kbd> close</span><span><kbd>v</kbd> view</span><span><kbd>,</kbd> settings</span>
</div>

<style>
  .hints { display: flex; flex-wrap: wrap; gap: 6px 14px; font: 12px var(--mono); color: var(--muted); }
  /* Hints wrap as whole pieces; one too wide for a line by itself (the board rail) wraps its words. */
  span { display: inline-flex; gap: 5px; align-items: center; }
  kbd { font: 500 11px/1 var(--mono); color: var(--muted); background: var(--surface); border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 5px; padding: 3px 5px; }
</style>
