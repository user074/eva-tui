import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const cargoFromRustup = join(
  homedir(),
  ".cargo",
  "bin",
  process.platform === "win32" ? "cargo.exe" : "cargo",
);
const cargo = process.env.CARGO || (existsSync(cargoFromRustup) ? cargoFromRustup : "cargo");
const argumentsForCargo = [
  "run",
  "--manifest-path",
  "crates/eva-ratatui/Cargo.toml",
  "--",
  ...process.argv.slice(2),
];

const child = spawn(cargo, argumentsForCargo, {
  cwd: process.cwd(),
  stdio: "inherit",
});

child.once("error", (error) => {
  if (error.code === "ENOENT") {
    console.error(
      "Rust Cargo was not found. Install Rust from https://rustup.rs and reopen your shell.",
    );
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
