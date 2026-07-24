import {
  renderGraphicPng,
  type GraphicCompositionOptions,
} from "./compositions.js";

interface Rgb {
  red: number;
  green: number;
  blue: number;
}

const ANSI_PALETTE: readonly Rgb[] = [
  { red: 3, green: 3, blue: 3 },
  { red: 9, green: 8, blue: 7 },
  { red: 84, green: 12, blue: 18 },
  { red: 181, green: 18, blue: 36 },
  { red: 220, green: 44, blue: 31 },
  { red: 230, green: 0, blue: 3 },
  { red: 252, green: 59, blue: 22 },
  { red: 252, green: 132, blue: 22 },
  { red: 252, green: 174, blue: 22 },
  { red: 255, green: 194, blue: 71 },
  { red: 128, green: 111, blue: 95 },
  { red: 255, green: 248, blue: 232 },
] as const;

const QUADRANTS = [
  " ",
  "▘",
  "▝",
  "▀",
  "▖",
  "▌",
  "▞",
  "▛",
  "▗",
  "▚",
  "▐",
  "▜",
  "▄",
  "▙",
  "▟",
  "█",
] as const;

const ansiCache = new Map<string, Promise<string>>();

function distance(left: Rgb, right: Rgb): number {
  const red = left.red - right.red;
  const green = left.green - right.green;
  const blue = left.blue - right.blue;
  return red * red * 0.3 + green * green * 0.59 + blue * blue * 0.11;
}

function nearestPaletteColor(color: Rgb): Rgb {
  let nearest = ANSI_PALETTE[0] as Rgb;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of ANSI_PALETTE) {
    const candidateDistance = distance(color, candidate);
    if (candidateDistance < nearestDistance) {
      nearest = candidate;
      nearestDistance = candidateDistance;
    }
  }
  return nearest;
}

function colorKey(color: Rgb): string {
  return `${color.red},${color.green},${color.blue}`;
}

function sameColor(left: Rgb, right: Rgb): boolean {
  return (
    left.red === right.red &&
    left.green === right.green &&
    left.blue === right.blue
  );
}

function ansiColor(layer: 38 | 48, color: Rgb): string {
  return `\u001b[${layer};2;${color.red};${color.green};${color.blue}m`;
}

function bestColorPair(colors: readonly Rgb[]): readonly [Rgb, Rgb] {
  const unique = [...new Map(colors.map((color) => [colorKey(color), color])).values()];
  if (unique.length === 1) {
    const only = unique[0] as Rgb;
    return [only, only];
  }

  let best = [unique[0] as Rgb, unique[1] as Rgb] as const;
  let bestError = Number.POSITIVE_INFINITY;
  for (let left = 0; left < unique.length; left += 1) {
    for (let right = left + 1; right < unique.length; right += 1) {
      const first = unique[left];
      const second = unique[right];
      if (!first || !second) continue;
      const error = colors.reduce(
        (sum, color) =>
          sum + Math.min(distance(color, first), distance(color, second)),
        0,
      );
      if (error < bestError) {
        best = [first, second];
        bestError = error;
      }
    }
  }
  return best;
}

function encodeCell(colors: readonly [Rgb, Rgb, Rgb, Rgb]): {
  char: string;
  foreground: Rgb;
  background: Rgb;
} {
  const [first, second] = bestColorPair(colors);
  if (sameColor(first, second)) {
    return { char: " ", foreground: first, background: first };
  }

  let foreground = first;
  let background = second;
  let mask = 0;
  let foregroundCount = 0;
  colors.forEach((color, index) => {
    if (distance(color, foreground) <= distance(color, background)) {
      mask |= 1 << index;
      foregroundCount += 1;
    }
  });

  if (foregroundCount > 2) {
    [foreground, background] = [background, foreground];
    mask = 15 ^ mask;
  }

  return {
    char: QUADRANTS[mask] ?? " ",
    foreground,
    background,
  };
}

export function rgbaToAnsiQuadrants(
  data: Uint8Array,
  pixelWidth: number,
  pixelHeight: number,
  channels: number,
): string {
  if (
    pixelWidth < 2 ||
    pixelHeight < 2 ||
    pixelWidth % 2 !== 0 ||
    pixelHeight % 2 !== 0 ||
    channels < 3
  ) {
    throw new RangeError("ANSI quadrant input must be an even-sized RGB image.");
  }

  const pixel = (x: number, y: number): Rgb => {
    const offset = (y * pixelWidth + x) * channels;
    return nearestPaletteColor({
      red: data[offset] ?? 0,
      green: data[offset + 1] ?? 0,
      blue: data[offset + 2] ?? 0,
    });
  };

  const lines: string[] = [];
  for (let y = 0; y < pixelHeight; y += 2) {
    let line = "";
    let activeForeground = "";
    let activeBackground = "";
    for (let x = 0; x < pixelWidth; x += 2) {
      const cell = encodeCell([
        pixel(x, y),
        pixel(x + 1, y),
        pixel(x, y + 1),
        pixel(x + 1, y + 1),
      ]);
      const foregroundKey = colorKey(cell.foreground);
      const backgroundKey = colorKey(cell.background);
      if (cell.char !== " " && foregroundKey !== activeForeground) {
        line += ansiColor(38, cell.foreground);
        activeForeground = foregroundKey;
      }
      if (backgroundKey !== activeBackground) {
        line += ansiColor(48, cell.background);
        activeBackground = backgroundKey;
      }
      line += cell.char;
    }
    lines.push(`${line}\u001b[0m`);
  }
  return lines.join("\n");
}

function cacheKey(options: GraphicCompositionOptions): string {
  const stationKey = (options.stations ?? [])
    .map((station) =>
      [station.id, station.label, station.status, station.eventCount].join(":"),
    )
    .join("|");
  return [
    options.scene,
    Math.floor(options.columns),
    Math.floor(options.rows),
    options.selectedIndex ?? 0,
    options.simulation ?? true,
    options.incidentDetail ?? "",
    stationKey,
  ].join("::");
}

async function renderGraphicAnsiUncached(
  options: GraphicCompositionOptions,
): Promise<string> {
  const columns = Math.max(24, Math.floor(options.columns));
  const rows = Math.max(6, Math.floor(options.rows));
  const png = await renderGraphicPng({ ...options, columns, rows });
  const { default: sharp } = await import("sharp");
  const { data, info } = await sharp(png)
    .flatten({ background: "#030303" })
    .resize(columns * 2, rows * 2, {
      fit: "fill",
      kernel: "lanczos3",
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return rgbaToAnsiQuadrants(data, info.width, info.height, info.channels);
}

export function renderGraphicAnsi(
  options: GraphicCompositionOptions,
): Promise<string> {
  const key = cacheKey(options);
  const cached = ansiCache.get(key);
  if (cached) return cached;

  const rendered = renderGraphicAnsiUncached(options).catch((error: unknown) => {
    ansiCache.delete(key);
    throw error;
  });
  ansiCache.set(key, rendered);
  if (ansiCache.size > 16) {
    const oldest = ansiCache.keys().next().value as string | undefined;
    if (oldest) ansiCache.delete(oldest);
  }
  return rendered;
}
