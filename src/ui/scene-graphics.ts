import type { CanvasFrame, Point } from "./cell-canvas.js";
import { CellCanvas } from "./cell-canvas.js";
import type { Station } from "./operations-model.js";
import { statusColor, theme } from "./theme.js";

function stampText(
  frame: CanvasFrame,
  x: number,
  y: number,
  text: string,
  color: string,
  background: string | null = null,
): void {
  const row = frame[Math.max(0, Math.min(frame.length - 1, Math.round(y)))];
  if (!row) return;
  const characters = Array.from(text);
  const start = Math.max(0, Math.round(x));
  for (let index = 0; index < characters.length; index += 1) {
    const column = start + index;
    if (column >= row.length) break;
    row[column] = {
      char: characters[index] ?? " ",
      color,
      background,
    };
  }
}

function stampCentered(
  frame: CanvasFrame,
  y: number,
  text: string,
  color: string,
  background: string | null = null,
): void {
  const width = frame[0]?.length ?? 0;
  stampText(frame, Math.floor((width - text.length) / 2), y, text, color, background);
}

function hexagon(center: Point, radiusX: number, radiusY: number): Point[] {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 3) * index;
    return {
      x: center.x + Math.cos(angle) * radiusX,
      y: center.y + Math.sin(angle) * radiusY,
    };
  });
}

function skewNode(center: Point, side: -1 | 1, width: number, height: number): Point[] {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const skew = side * Math.max(2, width * 0.22);
  return [
    { x: center.x - halfWidth + skew, y: center.y - halfHeight },
    { x: center.x + halfWidth + skew, y: center.y - halfHeight },
    { x: center.x + halfWidth - skew, y: center.y + halfHeight },
    { x: center.x - halfWidth - skew, y: center.y + halfHeight },
  ];
}

export function earthquakeGraphic(
  columns: number,
  rows: number,
  phase: number,
): CanvasFrame {
  const canvas = new CellCanvas(columns, rows);
  const width = canvas.pixelWidth;
  const height = canvas.pixelHeight;
  const pulse = phase % 4 < 2 ? theme.red : theme.amber;
  const railHeight = Math.max(2, Math.floor(height * 0.08));

  for (let x = -railHeight; x < width + railHeight; x += railHeight * 2) {
    canvas.line(
      { x: x + (phase % (railHeight * 2)), y: 0 },
      { x: x + railHeight + (phase % (railHeight * 2)), y: railHeight },
      theme.amber,
      2,
    );
    canvas.line(
      { x: x - (phase % (railHeight * 2)), y: height - railHeight },
      { x: x + railHeight - (phase % (railHeight * 2)), y: height - 1 },
      theme.amber,
      2,
    );
  }
  canvas.line({ x: 0, y: railHeight + 1 }, { x: width - 1, y: railHeight + 1 }, pulse);
  canvas.line(
    { x: 0, y: height - railHeight - 2 },
    { x: width - 1, y: height - railHeight - 2 },
    pulse,
  );

  const headerCenter = { x: width / 2, y: height * 0.36 };
  const headerWidth = Math.min(width * 0.42, 62);
  const headerHeight = Math.max(8, height * 0.18);
  canvas.polygon(
    hexagon(headerCenter, headerWidth / 2, headerHeight / 2),
    theme.crimson,
    true,
  );
  canvas.polygon(
    hexagon(headerCenter, headerWidth / 2, headerHeight / 2),
    theme.amber,
  );

  const warningOffset = headerWidth * 0.72;
  for (const side of [-1, 1] as const) {
    const warning = {
      x: headerCenter.x + warningOffset * side,
      y: headerCenter.y + headerHeight * 0.45,
    };
    canvas.polygon(
      hexagon(warning, headerHeight * 0.62, headerHeight * 0.56),
      pulse,
    );
    canvas.polygon(
      skewNode(
        {
          x: warning.x,
          y: warning.y + headerHeight * 1.4,
        },
        side,
        headerHeight * 0.65,
        headerHeight * 1.5,
      ),
      theme.red,
    );
  }

  const dataY = height * 0.66;
  const dataRadiusX = Math.max(7, Math.min(13, width * 0.07));
  const dataRadiusY = Math.max(5, dataRadiusX * 0.72);
  for (const [index, offset] of [-1, 0, 1].entries()) {
    canvas.polygon(
      hexagon(
        {
          x: width / 2 + offset * dataRadiusX * 1.65,
          y: dataY + (index === 1 ? dataRadiusY * 1.1 : 0),
        },
        dataRadiusX,
        dataRadiusY,
      ),
      index === 1 ? theme.red : theme.crimson,
      true,
    );
  }

  const frame = canvas.toFrame();
  stampCentered(frame, Math.max(1, Math.floor(rows * 0.3)), " EARTHQUAKE ", theme.black, pulse);
  stampCentered(frame, Math.min(rows - 2, Math.floor(rows * 0.68)), "MAG 6.2 / TEST", theme.amber, theme.black);
  return frame;
}

export function tsunamiGraphic(
  columns: number,
  rows: number,
  phase: number,
): CanvasFrame {
  const canvas = new CellCanvas(columns, rows);
  const width = canvas.pixelWidth;
  const height = canvas.pixelHeight;
  const tileWidth = Math.max(9, Math.floor(width / 12));
  const tileHeight = Math.max(5, Math.floor(tileWidth * 0.7));
  const reveal = Math.max(1, Math.floor(((phase % 24) / 24) * 6));

  for (let row = 0; row < Math.ceil(height / tileHeight) + 1; row += 1) {
    for (let column = -1; column < Math.ceil(width / (tileWidth * 1.5)) + 1; column += 1) {
      const center = {
        x:
          column * tileWidth * 1.5 +
          (row % 2 === 0 ? 0 : tileWidth * 0.75),
        y: row * tileHeight,
      };
      canvas.polygon(
        hexagon(center, tileWidth * 0.58, tileHeight * 0.52),
        (row + column + reveal) % 4 === 0 ? theme.crimson : theme.red,
      );
    }
  }

  const header = { x: width / 2, y: height * 0.27 };
  canvas.polygon(
    hexagon(header, Math.min(34, width * 0.25), Math.max(7, height * 0.1)),
    theme.crimson,
    true,
  );
  canvas.polygon(
    hexagon(header, Math.min(34, width * 0.25), Math.max(7, height * 0.1)),
    theme.amber,
  );

  const dossierWidth = Math.min(width * 0.48, 66);
  const dossierHeight = Math.max(13, height * 0.34);
  const dossierOrigin = {
    x: width / 2 - dossierWidth / 2,
    y: height * 0.46,
  };
  canvas.rectangle(
    dossierOrigin,
    dossierWidth,
    dossierHeight,
    theme.red,
    true,
  );
  canvas.rectangle(
    {
      x: dossierOrigin.x + 3,
      y: dossierOrigin.y + 3,
    },
    dossierWidth - 6,
    dossierHeight - 6,
    theme.black,
    true,
  );
  for (let x = dossierOrigin.x + 4; x < dossierOrigin.x + dossierWidth - 4; x += 6) {
    canvas.line(
      { x, y: dossierOrigin.y + 5 },
      { x: x + 4, y: dossierOrigin.y + 9 },
      theme.amber,
      2,
    );
    canvas.line(
      { x: x + 2, y: dossierOrigin.y + dossierHeight - 9 },
      { x: x + 6, y: dossierOrigin.y + dossierHeight - 5 },
      theme.red,
      2,
    );
  }

  const placards = [
    { x: width * 0.1, y: height * 0.16 },
    { x: width * 0.9, y: height * 0.16 },
    { x: width * 0.24, y: height * 0.48 },
    { x: width * 0.76, y: height * 0.48 },
    { x: width * 0.1, y: height * 0.79 },
    { x: width * 0.9, y: height * 0.79 },
  ];
  for (const [index, placard] of placards.entries()) {
    canvas.rectangle(
      { x: placard.x - 4, y: placard.y - 6 },
      8,
      12,
      theme.black,
      true,
    );
    canvas.rectangle(
      { x: placard.x - 4, y: placard.y - 6 },
      8,
      12,
      theme.red,
    );
    canvas.line(
      { x: placard.x - 2, y: placard.y - 3 },
      { x: placard.x + 2, y: placard.y + 3 },
      theme.amber,
      2,
    );
  }

  const frame = canvas.toFrame();
  stampCentered(frame, Math.max(1, Math.floor(rows * 0.2)), " TSUNAMI WARNING ", theme.black, theme.amber);
  stampCentered(frame, Math.floor(rows * 0.5), "PACIFIC FIXTURE GRID", theme.white, theme.crimson);
  stampCentered(frame, Math.min(rows - 2, Math.floor(rows * 0.66)), "06 MODULES / SIMULATION", theme.amber, theme.black);
  placards.forEach((placard, index) => {
    stampText(
      frame,
      Math.floor(placard.x / 2) - 1,
      Math.floor(placard.y / 4),
      String(index + 1).padStart(2, "0"),
      theme.amber,
      theme.black,
    );
  });
  return frame;
}

export function stationGraphic(
  stations: Station[],
  selectedIndex: number,
  columns: number,
  rows: number,
  phase: number,
): CanvasFrame {
  const canvas = new CellCanvas(columns, rows);
  const branchCount = columns >= 100 && stations.length > 8 ? 3 : 2;
  const perBranch = Math.ceil(stations.length / branchCount);
  const pulse = 2 + (phase % 5);
  const labels: Array<{
    x: number;
    y: number;
    text: string;
    color: string;
    selected: boolean;
  }> = [];

  for (let branch = 0; branch < branchCount; branch += 1) {
    const branchStations = stations.slice(
      branch * perBranch,
      (branch + 1) * perBranch,
    );
    if (branchStations.length === 0) continue;
    const spineX = ((branch + 1) * canvas.pixelWidth) / (branchCount + 1);
    const top = 2;
    const bottom = canvas.pixelHeight - 3;
    canvas.line({ x: spineX, y: top }, { x: spineX, y: bottom }, theme.orange, 3);
    canvas.polygon(
      hexagon({ x: spineX, y: top }, 4, 2),
      theme.orange,
      true,
    );

    branchStations.forEach((station, localIndex) => {
      const globalIndex = branch * perBranch + localIndex;
      const selected = globalIndex === selectedIndex;
      const side = localIndex % 2 === 0 ? -1 : 1;
      const y =
        top +
        4 +
        ((localIndex + 0.5) / Math.max(1, branchStations.length)) *
          Math.max(4, bottom - top - 7);
      const arm = Math.min(
        canvas.pixelWidth / (branchCount * 2.6),
        24 + (localIndex % 3) * 4,
      );
      const node = { x: spineX + side * arm, y };
      const color = statusColor(station.status);

      canvas.line({ x: spineX, y }, node, color);
      canvas.polygon(
        skewNode(node, side, selected ? 15 : 11, selected ? 7 : 5),
        color,
        true,
      );
      if (selected) {
        canvas.circle(node, pulse, theme.white);
        canvas.line(
          { x: node.x - side * 2, y: node.y },
          { x: node.x - side * 8, y: node.y },
          theme.white,
        );
      }
      labels.push({
        x: node.x / 2 + (side < 0 ? -9 : 2),
        y: node.y / 4,
        text: station.label.toUpperCase().replaceAll(/\s+/g, "").slice(0, 7),
        color,
        selected,
      });
    });
  }

  const frame = canvas.toFrame();
  for (const label of labels) {
    stampText(
      frame,
      label.x,
      label.y,
      label.selected ? `>${label.text}` : label.text,
      label.selected ? theme.black : label.color,
      label.selected ? theme.white : theme.black,
    );
  }
  return frame;
}
