import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function writeAscii(buffer: Buffer, offset: number, value: string): void {
  buffer.write(value, offset, value.length, "ascii");
}

/**
 * Writes a short, original ambient loop. It intentionally contains no sampled
 * or transcribed material; it is only a low drone with filtered noise.
 */
export function createAmbientLoop(): string {
  const sampleRate = 22_050;
  const durationSeconds = 12;
  const sampleCount = sampleRate * durationSeconds;
  const dataBytes = sampleCount * 2;
  const wav = Buffer.alloc(44 + dataBytes);

  writeAscii(wav, 0, "RIFF");
  wav.writeUInt32LE(36 + dataBytes, 4);
  writeAscii(wav, 8, "WAVE");
  writeAscii(wav, 12, "fmt ");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  writeAscii(wav, 36, "data");
  wav.writeUInt32LE(dataBytes, 40);

  let filteredNoise = 0;
  let seed = 0x4d414749;
  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    const noise = (seed / 0xffff_ffff) * 2 - 1;
    filteredNoise = filteredNoise * 0.985 + noise * 0.015;

    const pulse = 0.72 + Math.sin((Math.PI * 2 * time) / 8) * 0.12;
    const fade = Math.min(1, time / 0.6, (durationSeconds - time) / 0.6);
    const drone =
      Math.sin(Math.PI * 2 * 55 * time) * 0.5 +
      Math.sin(Math.PI * 2 * 82.5 * time + 0.6) * 0.22 +
      Math.sin(Math.PI * 2 * 110 * time + 1.4) * 0.1;
    const sample = Math.max(
      -1,
      Math.min(1, (drone * pulse + filteredNoise * 0.18) * fade * 0.16),
    );
    wav.writeInt16LE(Math.round(sample * 32_767), 44 + index * 2);
  }

  const output = join(tmpdir(), `eva-tui-ambient-${process.pid}.wav`);
  writeFileSync(output, wav);
  return output;
}
