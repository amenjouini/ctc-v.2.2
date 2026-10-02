/**
 * How many dialogs are open right now. Game keys are ignored while any is.
 * Counted explicitly because a closing dialog stays in the DOM for its fade
 * out, and keys typed in that moment must reach the board.
 */
let open = 0;

export const dialogs = {
  opened() {
    open++;
  },
  closed() {
    open = Math.max(0, open - 1);
  },
  get anyOpen() {
    return open > 0;
  },
};
