/**
 * Web Serial utilities using esptool-js.
 *
 * Handles chip detection and firmware flashing via the browser's
 * Web Serial API. No backend involvement — talks directly to the
 * USB-connected ESP device.
 */
import { ESPLoader, Transport } from "esptool-js";

export interface DetectedChip {
  chipName: string;
  port: SerialPort;
  transport: Transport;
  loader: ESPLoader;
}

export interface FlashProgress {
  fileIndex: number;
  written: number;
  total: number;
  percent: number;
}

export type LogCallback = (line: string) => void;

/** Check if Web Serial is supported in this browser. */
export function isWebSerialSupported(): boolean {
  return "serial" in navigator;
}

/**
 * Prompt the user to select a serial port and detect the connected chip.
 * Returns chip info + the open connection for subsequent operations.
 */
export async function detectChip(onLog?: LogCallback): Promise<DetectedChip> {
  const port = await navigator.serial.requestPort();

  const transport = new Transport(port, false);

  const loader = new ESPLoader({
    transport,
    baudrate: 115200,
    terminal: onLog
      ? {
          clean: () => {},
          writeLine: (line: string) => onLog(line),
          write: (text: string) => onLog(text),
        }
      : undefined,
  });

  try {
    const chipName = await loader.main();
    return { chipName, port, transport, loader };
  } catch (error) {
    try {
      await transport.disconnect();
    } catch {
      try {
        await port.close();
      } catch {
        // Best-effort cleanup; rethrow the original detection error below.
      }
    }
    throw error;
  }
}

/**
 * Reconnect to an already-authorized serial port (no browser picker).
 * Use after disconnect + compile to resume the connection for flashing.
 */
export async function connectToPort(port: SerialPort, onLog?: LogCallback): Promise<DetectedChip> {
  const transport = new Transport(port, false);

  const loader = new ESPLoader({
    transport,
    baudrate: 115200,
    terminal: onLog
      ? {
          clean: () => {},
          writeLine: (line: string) => onLog(line),
          write: (text: string) => onLog(text),
        }
      : undefined,
  });

  const chipName = await loader.main();
  return { chipName, port, transport, loader };
}

/**
 * Flash firmware binary data to a connected ESP device.
 * Assumes detectChip() was already called and the loader is connected.
 */
export async function flashFirmware(
  loader: ESPLoader,
  data: Uint8Array,
  address: number,
  onProgress?: (progress: FlashProgress) => void
): Promise<void> {
  await loader.writeFlash({
    fileArray: [{ data, address }],
    flashSize: "keep",
    flashMode: "keep",
    flashFreq: "keep",
    eraseAll: false,
    compress: true,
    reportProgress: (fileIndex, written, total) => {
      onProgress?.({
        fileIndex,
        written,
        total,
        percent: Math.round((written / total) * 100),
      });
    },
  });
}

/** Hard-reset the device and disconnect. */
export async function resetAndDisconnect(
  loader: ESPLoader,
  transport: Transport
): Promise<void> {
  try {
    await loader.after("hard_reset");
  } finally {
    await transport.disconnect();
  }
}

/** Disconnect without resetting. */
export async function disconnect(transport: Transport): Promise<void> {
  await transport.disconnect();
}
