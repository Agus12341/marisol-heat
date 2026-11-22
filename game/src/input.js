// Marisol Heat - keyboard input. Produces the plain input object the sim
// consumes, so the headless harness can feed the same shape by hand.

export function createInput() {
  const keys = new Set();
  const input = {
    up: false, down: false, left: false, right: false,
    run: false, act: false, atk: false, pause: false, confirm: false,
    snapshot() {
      return {
        up: keys.has('KeyW') || keys.has('ArrowUp'),
        down: keys.has('KeyS') || keys.has('ArrowDown'),
        left: keys.has('KeyA') || keys.has('ArrowLeft'),
        right: keys.has('KeyD') || keys.has('ArrowRight'),
        run: keys.has('ShiftLeft') || keys.has('ShiftRight'),
        act: keys.has('KeyE'),
        atk: keys.has('KeyF') || keys.has('Space'),
        pause: keys.has('KeyP') || keys.has('Escape'),
        confirm: keys.has('Enter'),
      };
    },
    attach(target) {
      target.addEventListener('keydown', (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
        keys.add(e.code);
      });
      target.addEventListener('keyup', (e) => keys.delete(e.code));
      target.addEventListener('blur', () => keys.clear());
    },
  };
  return input;
}
