export interface Point {
  x: number;
  y: number;
}

export interface CanvasCell {
  char: string;
  color: string | null;
}

export type CanvasFrame = CanvasCell[][];

interface Pixel {
  color: string;
  order: number;
}

const BRAILLE_BITS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
] as const;

export class CellCanvas {
  readonly columns: number;
  readonly rows: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  private readonly pixels: Array<Pixel | null>;
  private drawOrder = 0;

  constructor(columns: number, rows: number) {
    this.columns = Math.max(1, Math.floor(columns));
    this.rows = Math.max(1, Math.floor(rows));
    this.pixelWidth = this.columns * 2;
    this.pixelHeight = this.rows * 4;
    this.pixels = Array.from(
      { length: this.pixelWidth * this.pixelHeight },
      () => null,
    );
  }

  plot(x: number, y: number, color: string): this {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= this.pixelWidth || py >= this.pixelHeight) {
      return this;
    }
    this.drawOrder += 1;
    this.pixels[py * this.pixelWidth + px] = {
      color,
      order: this.drawOrder,
    };
    return this;
  }

  line(from: Point, to: Point, color: string, thickness = 1): this {
    let x0 = Math.round(from.x);
    let y0 = Math.round(from.y);
    const x1 = Math.round(to.x);
    const y1 = Math.round(to.y);
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;

    for (;;) {
      this.brush(x0, y0, color, thickness);
      if (x0 === x1 && y0 === y1) break;
      const twice = 2 * error;
      if (twice >= dy) {
        error += dy;
        x0 += sx;
      }
      if (twice <= dx) {
        error += dx;
        y0 += sy;
      }
    }
    return this;
  }

  polyline(points: Point[], color: string, closed = false, thickness = 1): this {
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1];
      const to = points[index];
      if (from && to) this.line(from, to, color, thickness);
    }
    if (closed && points.length > 2) {
      const first = points[0];
      const last = points.at(-1);
      if (first && last) this.line(last, first, color, thickness);
    }
    return this;
  }

  polygon(points: Point[], color: string, fill = false): this {
    if (points.length < 3) return this;
    if (fill) this.fillPolygon(points, color);
    this.polyline(points, color, true);
    return this;
  }

  circle(
    center: Point,
    radius: number,
    color: string,
    fill = false,
  ): this {
    const r = Math.max(0, Math.round(radius));
    if (fill) {
      for (let y = -r; y <= r; y += 1) {
        const halfWidth = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)));
        this.line(
          { x: center.x - halfWidth, y: center.y + y },
          { x: center.x + halfWidth, y: center.y + y },
          color,
        );
      }
      return this;
    }

    let x = r;
    let y = 0;
    let error = 1 - x;
    while (x >= y) {
      const points = [
        [x, y],
        [y, x],
        [-y, x],
        [-x, y],
        [-x, -y],
        [-y, -x],
        [y, -x],
        [x, -y],
      ] as const;
      for (const [offsetX, offsetY] of points) {
        this.plot(center.x + offsetX, center.y + offsetY, color);
      }
      y += 1;
      if (error < 0) {
        error += 2 * y + 1;
      } else {
        x -= 1;
        error += 2 * (y - x + 1);
      }
    }
    return this;
  }

  rectangle(
    origin: Point,
    width: number,
    height: number,
    color: string,
    fill = false,
  ): this {
    const x2 = origin.x + width - 1;
    const y2 = origin.y + height - 1;
    if (fill) {
      for (let y = origin.y; y <= y2; y += 1) {
        this.line({ x: origin.x, y }, { x: x2, y }, color);
      }
      return this;
    }
    return this.polyline(
      [
        origin,
        { x: x2, y: origin.y },
        { x: x2, y: y2 },
        { x: origin.x, y: y2 },
      ],
      color,
      true,
    );
  }

  toFrame(): CanvasFrame {
    const frame: CanvasFrame = [];
    for (let cellY = 0; cellY < this.rows; cellY += 1) {
      const row: CanvasCell[] = [];
      for (let cellX = 0; cellX < this.columns; cellX += 1) {
        let bits = 0;
        let newest: Pixel | null = null;
        for (let dotY = 0; dotY < 4; dotY += 1) {
          for (let dotX = 0; dotX < 2; dotX += 1) {
            const pixel = this.pixelAt(cellX * 2 + dotX, cellY * 4 + dotY);
            if (!pixel) continue;
            bits |= BRAILLE_BITS[dotY]?.[dotX] ?? 0;
            if (!newest || pixel.order > newest.order) newest = pixel;
          }
        }
        row.push({
          char: bits === 0 ? " " : String.fromCodePoint(0x2800 + bits),
          color: newest?.color ?? null,
        });
      }
      frame.push(row);
    }
    return frame;
  }

  toText(): string {
    return this.toFrame()
      .map((row) => row.map((cell) => cell.char).join(""))
      .join("\n");
  }

  private pixelAt(x: number, y: number): Pixel | null {
    return this.pixels[y * this.pixelWidth + x] ?? null;
  }

  private brush(x: number, y: number, color: string, thickness: number): void {
    const radius = Math.max(0, Math.floor((thickness - 1) / 2));
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        this.plot(x + offsetX, y + offsetY, color);
      }
    }
  }

  private fillPolygon(points: Point[], color: string): void {
    const minY = Math.max(0, Math.ceil(Math.min(...points.map((point) => point.y))));
    const maxY = Math.min(
      this.pixelHeight - 1,
      Math.floor(Math.max(...points.map((point) => point.y))),
    );

    for (let y = minY; y <= maxY; y += 1) {
      const intersections: number[] = [];
      for (let index = 0; index < points.length; index += 1) {
        const a = points[index];
        const b = points[(index + 1) % points.length];
        if (!a || !b || a.y === b.y) continue;
        const low = a.y < b.y ? a : b;
        const high = a.y < b.y ? b : a;
        if (y < low.y || y >= high.y) continue;
        intersections.push(
          low.x + ((y - low.y) / (high.y - low.y)) * (high.x - low.x),
        );
      }
      intersections.sort((a, b) => a - b);
      for (let index = 0; index < intersections.length; index += 2) {
        const start = intersections[index];
        const end = intersections[index + 1];
        if (start === undefined || end === undefined) continue;
        for (let x = Math.ceil(start); x <= Math.floor(end); x += 1) {
          this.plot(x, y, color);
        }
      }
    }
  }
}
