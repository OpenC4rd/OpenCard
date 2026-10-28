#!/usr/bin/env node
// Restyles the DMG produced by Tauri so it actually shows the background image.
//
// Tauri's bundled bundle_dmg.sh sets the Finder background with a relative HFS
// reference (`.background:background.png`). On macOS 26+ Finder accepts that
// AppleScript without error but never records the background, so the disk image
// ships with a plain window. Setting the picture through an absolute POSIX path
// does persist, so we mount the image read-write, redo the Finder cosmetics and
// convert it back to a compressed read-only image.
//
// macOS only; a no-op elsewhere.

import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const configDir = join(import.meta.dirname, "..", "src-tauri");

function readConfig(name) {
  return JSON.parse(readFileSync(join(configDir, name), "utf8"));
}

function readBackground() {
  const base = readConfig("tauri.conf.json");
  const macos = existsSync(join(configDir, "tauri.macos.conf.json"))
    ? readConfig("tauri.macos.conf.json")
    : {};
  return macos.bundle?.macOS?.dmg?.background ?? base.bundle?.macOS?.dmg?.background;
}

function findDmg() {
  for (const profile of ["release", "debug"]) {
    const directory = join(configDir, "target", profile, "bundle", "dmg");
    if (!existsSync(directory)) {
      continue;
    }
    const image = readdirSync(directory).find((entry) => entry.endsWith(".dmg"));
    if (image) {
      return join(directory, image);
    }
  }
  return null;
}

function main(argument) {
  if (process.platform !== "darwin") {
    console.log("restyle-dmg: not macOS, nothing to do");
    return;
  }

  const dmg = argument ?? findDmg();
  if (!dmg || !existsSync(dmg)) {
    throw new Error(`restyle-dmg: no dmg found (looked for ${dmg ?? "target/*/bundle/dmg/*.dmg"})`);
  }

  const background = readBackground();
  if (!background) {
    console.log("restyle-dmg: no background configured, nothing to do");
    return;
  }

  const workdir = mkdtempSync(join(tmpdir(), "opencard-dmg-"));
  const writable = join(workdir, "writable");
  let mountPoint = null;

  try {
    run("hdiutil", ["convert", dmg, "-format", "UDRW", "-o", writable]);
    mountPoint = attach(`${writable}.dmg`);
    styleVolume(mountPoint, background);
  } finally {
    if (mountPoint) {
      detach(mountPoint);
    }
  }

  const styled = join(workdir, "styled");
  run("hdiutil", ["convert", `${writable}.dmg`, "-format", "UDBZ", "-o", styled]);
  copyFileSync(`${styled}.dmg`, dmg);
  rmSync(workdir, { recursive: true, force: true });
  console.log(`restyle-dmg: styled ${basename(dmg)}`);
}

function attach(image) {
  const output = run("hdiutil", ["attach", "-nobrowse", "-readwrite", image]);
  const mountPoint = output
    .split("\n")
    .map((line) => line.split("\t").at(-1)?.trim())
    .find((path) => path?.startsWith("/Volumes/"));

  if (!mountPoint) {
    throw new Error("restyle-dmg: hdiutil attach reported no mount point");
  }
  return mountPoint;
}

function detach(mountPoint) {
  for (const args of [["detach", mountPoint], ["detach", "-force", mountPoint]]) {
    const result = spawnSync("hdiutil", args, { encoding: "utf8" });
    if (result.status === 0) {
      return;
    }
  }
  throw new Error(`restyle-dmg: could not detach ${mountPoint}`);
}

function styleVolume(mountPoint, backgroundName) {
  const volumeName = basename(mountPoint);
  const background = join(mountPoint, ".background", basename(backgroundName));
  if (!existsSync(background)) {
    throw new Error(`restyle-dmg: ${background} is missing from the image`);
  }

  const script = `
on run argv
  set volumeName to item 1 of argv
  set backgroundPath to item 2 of argv
  tell application "Finder"
    tell disk volumeName
      open
      set containerWindow to container window
      set background picture of icon view options of containerWindow to (POSIX file backgroundPath)
      delay 1
      close
      open
      delay 1
    end tell
  end tell
end run
`;

  const result = spawnSync("osascript", ["-", volumeName, background], {
    input: script,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`restyle-dmg: Finder rejected the layout: ${result.stderr.trim()}`);
  }
}

function run(command, args) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

main(process.argv[2]);
