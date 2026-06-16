// Minimal inline EventEmitter — does not depend on Node.js 'events' module
class BridgeEmitter {
  private _e: Record<string, Array<(...args: unknown[]) => void>> = Object.create(null);

  on(type: string, fn: (...args: unknown[]) => void): this {
    if (!this._e[type]) this._e[type] = [];
    this._e[type].push(fn);
    return this;
  }

  once(type: string, fn: (...args: unknown[]) => void): this {
    const wrapper = (...args: unknown[]): void => {
      this.off(type, wrapper);
      fn(...args);
    };
    (wrapper as { _f?: typeof fn })._f = fn;
    return this.on(type, wrapper);
  }

  off(type: string, fn: (...args: unknown[]) => void): this {
    if (this._e[type]) {
      this._e[type] = this._e[type].filter(
        (f) => f !== fn && (f as { _f?: typeof fn })._f !== fn,
      );
    }
    return this;
  }

  emit(type: string, ...args: unknown[]): boolean {
    const listeners = (this._e[type] || []).slice();
    for (const fn of listeners) fn(...args);
    return listeners.length > 0;
  }

  removeAllListeners(type?: string): this {
    if (type) delete this._e[type];
    else this._e = Object.create(null);
    return this;
  }

  setMaxListeners(): this { return this; }
  listenerCount(type: string): number { return (this._e[type] || []).length; }
}

// Minimal inline stream-like classes — no Node.js 'stream' module needed
class BridgeReadable extends BridgeEmitter {
  push(chunk: Uint8Array | null): void {
    if (chunk === null) this.emit('end');
    else this.emit('data', chunk);
  }
}

class BridgeWritable extends BridgeEmitter {
  write(chunk: Buffer | string): boolean {
    this.emit('data', chunk);
    return true;
  }
  end(): void {
    this.emit('finish');
    this.emit('end_called');
  }
}

// Inline path.basename — no Node.js 'path' module needed
function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p;
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
 * Uses only browser-native APIs (WebSocket, Buffer/Uint8Array) — no Node.js deps.
 */
export function createAndroidBridgeSpawnFunction(
  host: string,
  port: number,
): (options: AndroidBridgeSpawnOptions) => unknown {
  return (spawnOptions: AndroidBridgeSpawnOptions): unknown => {
    const { cwd = '', env, args = [], signal } = spawnOptions;
    // Send only the vault folder name; server prepends /sdcard/
    const vaultPath = basename(cwd);

    const stdin = new BridgeWritable();
    const stdout = new BridgeReadable();
    const stderr = new BridgeReadable();
    const emitter = new BridgeEmitter();

    let exited = false;
    let sendSignal = (_sig: string): void => { /* no-op until WS opens */ };

    let killed = false;
    const fakeProcess = Object.assign(emitter, {
      pid: -1,
      stdin,
      stdout,
      stderr,
      // exitCode must stay null while alive; SDK throws if exitCode !== null
      exitCode: null as number | null,
      killed: false,
      kill: (sig?: string): boolean => {
        killed = true;
        fakeProcess.killed = true;
        sendSignal(sig ?? 'SIGTERM');
        return true;
      },
    });

    // Filter env to only custom keys to avoid sending entire process.env
    const customEnv: Record<string, string> = {};
    if (env) {
      for (const [k, v] of Object.entries(env)) {
        if (v !== undefined) customEnv[k] = v;
      }
    }

    // Use global WebSocket (available in Obsidian's Chromium/WebView runtime)
    const ws = new WebSocket(`ws://${host}:${port}/spawn`);

    // Buffer stdin writes until the WebSocket connects.
    // The SDK may write to stdin and call .end() BEFORE ws.onopen fires,
    // because spawn() returns immediately while WebSocket connects async.
    const stdinBuffer: Array<{ type: 'data'; b64: string } | { type: 'end' }> = [];
    let wsReady = false;

    function flushStdinBuffer(): void {
      while (stdinBuffer.length > 0) {
        const item = stdinBuffer.shift()!;
        if (item.type === 'data') {
          ws.send(JSON.stringify({ type: 'stdin', data: item.b64 }));
        } else if (item.type === 'end') {
          ws.send(JSON.stringify({ type: 'stdin_end' }));
        }
      }
    }

    // Register stdin listeners immediately — buffer everything until WS opens
    stdin.on('data', (chunk: unknown): void => {
      let b64: string;
      if (typeof chunk === 'string') {
        b64 = btoa(unescape(encodeURIComponent(chunk)));
      } else if (chunk instanceof Uint8Array) {
        b64 = uint8ToBase64(chunk);
      } else {
        b64 = '';
      }
      if (wsReady) {
        ws.send(JSON.stringify({ type: 'stdin', data: b64 }));
      } else {
        stdinBuffer.push({ type: 'data', b64 });
      }
    });

    stdin.on('end_called', (): void => {
      if (wsReady) {
        ws.send(JSON.stringify({ type: 'stdin_end' }));
      } else {
        stdinBuffer.push({ type: 'end' });
      }
    });

    sendSignal = (sig: string): void => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'signal', signal: sig }));
      }
    };

    ws.onopen = (): void => {
      ws.send(JSON.stringify({
        type: 'spawn',
        cmd: 'claude',
        args,
        vaultPath,
        env: customEnv,
      }));
      wsReady = true;
      flushStdinBuffer();
    };

    ws.onmessage = (event: MessageEvent): void => {
      const msg = JSON.parse(event.data as string) as {
        type: string;
        data?: string;
        code?: number;
      };
      if (msg.type === 'stdout' && msg.data) {
        stdout.push(base64ToUint8(msg.data));
      } else if (msg.type === 'stderr' && msg.data) {
        stderr.push(base64ToUint8(msg.data));
      } else if (msg.type === 'exit') {
        if (!exited) {
          exited = true;
          fakeProcess.exitCode = msg.code ?? 0;
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
        fakeProcess.exitCode = 1;
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

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
