export interface RedactionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PageRedactions = Record<number, RedactionRect[]>;
