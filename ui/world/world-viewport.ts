// iOS can shrink and pan the visual viewport without resizing the layout viewport.
// Follow its actual bounds while typing; never subtract a guessed keyboard height.
export function bindWorldViewport(root) {
  const viewport = window.visualViewport;
  if (!viewport) return;
  let frame,restingHeight=viewport.height;
  function update() {
    frame = null;
    const typing = root.contains(document.activeElement) && document.activeElement.matches('input,textarea,[contenteditable="true"]');
    if(!typing)restingHeight=Math.max(viewport.height,window.innerHeight);
    const keyboard = typing && Math.abs(viewport.scale - 1) < .05 && Math.max(window.innerHeight,restingHeight) - viewport.height > 100;
    root.classList.toggle('is-typing', keyboard);
    if (keyboard) {
      root.style.setProperty('--visible-top', `${viewport.offsetTop}px`);
      root.style.setProperty('--visible-height', `${viewport.height}px`);
    } else {
      root.style.removeProperty('--visible-top');
      root.style.removeProperty('--visible-height');
    }
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(update); }
  viewport.addEventListener('resize', schedule);
  viewport.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  root.addEventListener('focusin', schedule);
  root.addEventListener('focusout', schedule);
  update();
}
