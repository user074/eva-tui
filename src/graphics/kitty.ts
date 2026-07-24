export type GraphicsMode = "auto" | "kitty" | "text";
export type GraphicsBackend = "kitty" | "text";

const ESC = "\u001b";
const ST = `${ESC}\\`;
const PLACEHOLDER = String.fromCodePoint(0x10eeee);

// First entries from kitty's canonical rowcolumn-diacritics.txt. The compact
// placeholder form only needs one diacritic per rendered row.
const DIACRITICS = [
  0x0305, 0x030d, 0x030e, 0x0310, 0x0312, 0x033d, 0x033e, 0x033f,
  0x0346, 0x034a, 0x034b, 0x034c, 0x0350, 0x0351, 0x0352, 0x0357,
  0x035b, 0x0363, 0x0364, 0x0365, 0x0366, 0x0367, 0x0368, 0x0369,
  0x036a, 0x036b, 0x036c, 0x036d, 0x036e, 0x036f, 0x0483, 0x0484,
  0x0485, 0x0486, 0x0487, 0x0592, 0x0593, 0x0594, 0x0595, 0x0597,
  0x0598, 0x0599, 0x059c, 0x059d, 0x059e, 0x059f, 0x05a0, 0x05a1,
  0x05a8, 0x05a9, 0x05ab, 0x05ac, 0x05af, 0x05c4, 0x0610, 0x0611,
  0x0612, 0x0613, 0x0614, 0x0615, 0x0616, 0x0617, 0x0657, 0x0658,
] as const;

type Environment = Readonly<Record<string, string | undefined>>;

export function supportsKittyGraphicsEnvironment(
  environment: Environment = process.env,
): boolean {
  const term = environment.TERM?.toLowerCase() ?? "";
  const program = environment.TERM_PROGRAM?.toLowerCase() ?? "";
  return (
    Boolean(environment.KITTY_WINDOW_ID) ||
    term.includes("kitty") ||
    term.includes("ghostty") ||
    term.includes("wezterm") ||
    ["kitty", "ghostty", "wezterm"].includes(program)
  );
}

export function resolveGraphicsBackend(
  mode: GraphicsMode,
  environment: Environment = process.env,
): GraphicsBackend {
  if (mode === "text") return "text";
  if (mode === "kitty") return "kitty";

  // tmux requires explicit passthrough configuration. Auto mode stays
  // conservative; --graphics kitty remains available when it is configured.
  if (environment.TMUX) return "text";

  return supportsKittyGraphicsEnvironment(environment) ? "kitty" : "text";
}

function tmuxPassthrough(sequence: string): string {
  return `${ESC}Ptmux;${sequence.replaceAll(ESC, `${ESC}${ESC}`)}${ST}`;
}

function command(
  control: string,
  payload = "",
  tmux = false,
): string {
  const sequence = `${ESC}_G${control};${payload}${ST}`;
  return tmux ? tmuxPassthrough(sequence) : sequence;
}

export interface KittyImageOptions {
  imageId: number;
  columns: number;
  rows: number;
  tmux?: boolean;
}

export function kittyTransmitPng(
  png: Uint8Array,
  options: KittyImageOptions,
): string {
  if (options.imageId <= 0 || options.imageId > 255) {
    throw new RangeError("Kitty placeholder image IDs must be between 1 and 255.");
  }
  if (options.columns < 1 || options.rows < 1) {
    throw new RangeError("Kitty image placements require positive dimensions.");
  }
  if (options.rows > DIACRITICS.length) {
    throw new RangeError(
      `Kitty placeholder supports at most ${DIACRITICS.length} rows.`,
    );
  }

  const encoded = Buffer.from(png).toString("base64");
  const chunks: string[] = [];
  for (let offset = 0; offset < encoded.length; offset += 4096) {
    chunks.push(encoded.slice(offset, offset + 4096));
  }
  if (chunks.length === 0) chunks.push("");

  const transmitted = chunks
    .map((chunk, index) => {
      const more = index < chunks.length - 1 ? 1 : 0;
      const control =
        index === 0
          ? `a=t,f=100,i=${options.imageId},q=2,N=1,m=${more}`
          : `q=2,m=${more}`;
      return command(control, chunk, options.tmux ?? false);
    })
    .join("");

  const placement = command(
    `a=p,U=1,i=${options.imageId},c=${options.columns},r=${options.rows},q=2`,
    "",
    options.tmux ?? false,
  );
  return `${transmitted}${placement}`;
}

export function kittyDeleteImage(imageId: number, tmux = false): string {
  return command(`a=d,d=I,i=${imageId},q=2`, "", tmux);
}

export function kittyPlaceholder(
  imageId: number,
  columns: number,
  rows: number,
): string {
  if (imageId <= 0 || imageId > 255) {
    throw new RangeError("Kitty placeholder image IDs must be between 1 and 255.");
  }
  if (columns < 1 || rows < 1 || rows > DIACRITICS.length) {
    throw new RangeError("Invalid Kitty placeholder dimensions.");
  }

  const color = `${ESC}[38;5;${imageId}m`;
  const reset = `${ESC}[39m`;
  return Array.from({ length: rows }, (_, row) => {
    const rowMark = String.fromCodePoint(DIACRITICS[row] ?? DIACRITICS[0]);
    return `${color}${PLACEHOLDER}${rowMark}${PLACEHOLDER.repeat(columns - 1)}${reset}`;
  }).join("\n");
}
