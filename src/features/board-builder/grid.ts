export const BOARD_ROWS = 4;
export const BOARD_COLS = 7;
export const BOARD_SIZE = BOARD_ROWS * BOARD_COLS; // 28

export function positionToCoords(position: number): { row: number; col: number } {
  return { row: Math.floor(position / BOARD_COLS), col: position % BOARD_COLS };
}

export function coordsToPosition(row: number, col: number): number {
  return row * BOARD_COLS + col;
}

export function isValidPosition(position: number): boolean {
  return Number.isInteger(position) && position >= 0 && position < BOARD_SIZE;
}

export function allPositions(): number[] {
  return Array.from({ length: BOARD_SIZE }, (_, i) => i);
}
