/**
 * Grows a textarea to fit its text, so the pane or sheet around it scrolls instead of the box itself.
 * Pass the bound value as the parameter so a change from code (e.g. a remote refresh) refits too.
 */
export function autogrow(el: HTMLTextAreaElement, _value?: string) {
  function fit(): void {
    // Shrinking to `auto` first can clamp the scroll of the pane around the box; put it back afterwards.
    const scrolled: [Element, number][] = [];
    for (let p = el.parentElement; p; p = p.parentElement) if (p.scrollTop > 0) scrolled.push([p, p.scrollTop]);
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
    for (const [p, top] of scrolled) p.scrollTop = top;
  }

  fit();
  el.addEventListener('input', fit);
  // A new width rewraps the text. Only width counts: the height is ours to set.
  let width = el.clientWidth;
  const ro = new ResizeObserver(() => {
    if (el.clientWidth === width) return;
    width = el.clientWidth;
    fit();
  });
  ro.observe(el);

  return {
    update: fit,
    destroy() {
      el.removeEventListener('input', fit);
      ro.disconnect();
    },
  };
}
