import { EventEmitter } from 'events';
import * as nodePath from 'path';

// Minimal stream-like classes for environments without Node stream module
class FakeReadable extends EventEmitter {
  push(chunk: Buffer | null): void {
    if (chunk === null) {
      this.emit('end');
    } else {
      this.emit('data', chunk);
    }
  }
}

class FakeWritable extends EventEmitter {
  write(chunk: Buffer | string): boolean {
    this.emit('data', chunk);
    return true;
  }
  end(): void {
    this.emit('finish');
  }
}

function makeStreams(): {
  stdin: FakeWritable;
  stdout: FakeReadable;
  stderr: FakeReadable;
} {
  // Try Node.js PassThrough; fall back to manual EventEmitter streams on mobile
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PassThrough } = require('stream') as typeof import('stream');
    return {
      stdin: new PassThrough() as unknown as FakeWritable,
      stdout: new PassThrough() as unknown as FakeReadable,
      stderr: new PassThrough() as unknown as FakeReadable,
    };
  } catch {
    return {
      stdin: new FakeWritable(),
      stdout: new FakeReadable(),
      stderr: new FakeReadable(),
    };
  }
}

export interface AndroidBridgeSpawnOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  args?: string[];
  signal?: AbortSignal;
}

/**
 * Returns a spawn function that routes Claude CLI stdio over a WebSocket to the
 * Python bridge server running inside OperitAI on the Android device.
 *
 * The server prepends /sdcard/ to the vault folder name to build the cwd.
 */
export function createAndroidBridgeSpawnFunction(
  host: string,
  port: number,
): (options: AndroidBridgeSpawnOptions) => unknown {
  return (spawnOptions: AndroidBridgeSpawnOptions): unknown => {
    const { cwd = '', env, args = [], signal } = spawnOptions;
    // Send only the vault folder name; server prepends /sdcard/
    const vaultPath = nodePath.basename(cwd);

    const { stdin, stdout, stderr } = makeStreams();
    const emitter = new EventEmitter();
    let exited = false;
    let sendSignal = (_sig: string): void => { /* no-op until WS opens */ };

    const fakeProcess = Object.assign(emitter, {
      pid: -1,
      stdin,
      stdout,
      stderr,
      kill: (sig?: string): boolean => {
        sendSignal(sig ?? 'SIGTERM');
        return true;
      },
    });

    // Filter env to only custom keys to avoid sending all of process.env
    const customEnv: Record<string, string> = {};
    if (env) {
      for (const [k, v] of Object.entries(env)) {
        if (v !== undefined) customEnv[k] = v;
      }
    }

    // Use global WebSocket (available in Obsidian's Chromium runtime)
    const ws = new WebSocket(`ws://${host}:${port}/spawn`);

    ws.onopen = (): void => {
      ws.send(JSON.stringify({
        type: 'spawn',
        cmd: 'claude',
        args,
        vaultPath,
        env: customEnv,
      }));

      // Forward stdin writes → WebSocket
      stdin.on('data', (chunk: Buffer | string): void => {
        if (ws.readyState === WebSocket.OPEN) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
          ws.send(JSON.stringify({ type: 'stdin', data: buf.toString('base64') }));
        }
      });

      sendSignal = (sig: string): void => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'signal', signal: sig }));
        }
      };
    };

    ws.onmessage = (event: MessageEvent): void => {
      const msg = JSON.parse(event.data as string) as {
        type: string;
        data?: string;
        code?: number;
      };
      if (msg.type === 'stdout' && msg.data) {
        stdout.push(Buffer.from(msg.data, 'base64'));
      } else if (msg.type === 'stderr' && msg.data) {
        stderr.push(Buffer.from(msg.data, 'base64'));
      } else if (msg.type === 'exit') {
        if (!exited) {
          exited = true;
          stdout.push(null);
          stderr.push(null);
          emitter.emit('exit', msg.code ?? 0, null);
          emitter.emit('close', msg.code ?? 0, null);
        }
        ws.close();
      }
    };

    const handleClose = (): void => {
      if (!exited) {
        exited = true;
        stdout.push(null);
        stderr.push(null);
        emitter.emit('exit', 1, null);
      }
    };

    ws.onerror = handleClose;
    ws.onclose = handleClose;

    if (signal) {
      const onAbort = (): void => {
        sendSignal('SIGTERM');
        ws.close();
      };
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    }

    return fakeProcess;
  };
}
