#!/usr/bin/env node
/**
 * Wraps main.js so that Node.js built-in modules that don't exist in
 * Obsidian Mobile (Android / iOS) are replaced with minimal stubs.
 *
 * On desktop (Electron), Node.js modules ARE available, so the stubs are
 * never used — behavior is identical to the unpatched bundle.
 *
 * Run after `npm run build`:  node scripts/patch-mobile.js
 */

const fs = require('fs');
const path = require('path');

const mainJsPath = path.join(__dirname, '..', 'main.js');
const original = fs.readFileSync(mainJsPath, 'utf-8');

if (original.startsWith('/* aidian-mobile-polyfill */')) {
  console.log('[patch-mobile] main.js already patched, skipping.');
  process.exit(0);
}

// ------------------------------------------------------------------
// EventEmitter stub — must be fully functional because the Claude SDK
// extends it.  Written in vanilla ES5 for maximum compatibility.
// ------------------------------------------------------------------
const eventsStub = `(function() {
  function EE() { this._e = Object.create(null); }
  EE.prototype.on = EE.prototype.addListener = function(t, fn) {
    (this._e[t] = this._e[t] || []).push(fn); return this;
  };
  EE.prototype.once = function(t, fn) {
    var self = this;
    function w() { self.removeListener(t, w); fn.apply(this, arguments); }
    w.__f = fn; return this.on(t, w);
  };
  EE.prototype.removeListener = EE.prototype.off = function(t, fn) {
    if (this._e[t]) this._e[t] = this._e[t].filter(function(f) { return f !== fn && f.__f !== fn; });
    return this;
  };
  EE.prototype.emit = function(t) {
    var a = Array.prototype.slice.call(arguments, 1);
    (this._e[t] || []).slice().forEach(function(f) { f.apply(null, a); });
    return !!(this._e[t] && this._e[t].length);
  };
  EE.prototype.removeAllListeners = function(t) {
    if (t) delete this._e[t]; else this._e = Object.create(null); return this;
  };
  EE.prototype.setMaxListeners = function() { return this; };
  EE.prototype.getMaxListeners = function() { return 10; };
  EE.prototype.listenerCount = function(t) { return (this._e[t] || []).length; };
  EE.prototype.listeners = function(t) { return (this._e[t] || []).slice(); };
  EE.prototype.eventNames = function() { return Object.keys(this._e); };
  EE.EventEmitter = EE;
  EE.setMaxListeners = function() {};
  return EE;
})()`;

const polyfill = `/* aidian-mobile-polyfill */
(function(__outer_require__) {
  // ----------------------------------------------------------------
  // Node.js built-in stubs — only used on Obsidian Mobile where
  // these modules do not exist.  On desktop Electron they are
  // available for real via the __outer_require__ fallback.
  // ----------------------------------------------------------------
  var _EE = ${eventsStub};

  var _stubs = {
    'events': _EE,
    'node:events': _EE,
    'fs': {
      existsSync: function() { return false; },
      statSync: function() { var e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; },
      readFileSync: function() { var e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; },
      writeFileSync: function() {},
      mkdirSync: function() {},
      readdirSync: function() { return []; },
      promises: {
        readFile: function() { return Promise.reject(Object.assign(new Error('ENOENT'), {code:'ENOENT'})); },
        writeFile: function() { return Promise.resolve(); },
        mkdir: function() { return Promise.resolve(); },
        readdir: function() { return Promise.resolve([]); },
      },
    },
    'fs/promises': {
      readFile: function() { return Promise.reject(Object.assign(new Error('ENOENT'), {code:'ENOENT'})); },
      writeFile: function() { return Promise.resolve(); },
      mkdir: function() { return Promise.resolve(); },
      readdir: function() { return Promise.resolve([]); },
    },
    'node:fs': null, // filled below
    'node:fs/promises': null,
    'path': {
      sep: '/', delimiter: ':',
      join: function() { return Array.prototype.slice.call(arguments).join('/').replace(/\\/+/g, '/'); },
      basename: function(p, e) { var b = (p || '').replace(/\\\\/g, '/').split('/').filter(Boolean).pop() || ''; return (e && b.slice(-e.length) === e) ? b.slice(0, -e.length) : b; },
      dirname: function(p) { var d = (p || '').replace(/\\\\/g, '/').split('/'); d.pop(); return d.join('/') || '/'; },
      resolve: function() { return Array.prototype.slice.call(arguments).join('/'); },
      normalize: function(p) { return (p || '').replace(/\\/+/g, '/'); },
      isAbsolute: function(p) { return !!(p && (p[0] === '/' || /^[A-Za-z]:/.test(p))); },
      extname: function(p) { var i = (p || '').lastIndexOf('.'); return i < 0 ? '' : p.slice(i); },
      relative: function(f, t) { return t || ''; },
      posix: { sep: '/', join: function() { return Array.prototype.slice.call(arguments).join('/'); } },
      win32: { sep: '\\\\', join: function() { return Array.prototype.slice.call(arguments).join('\\\\'); } },
    },
    'node:path': null,
    'child_process': {
      spawn: function() {
        // Full EventEmitter-like stream stub so callers can use .on()/.off()/.removeListener()
        function fakeStream() { this._h = {}; }
        fakeStream.prototype.on = fakeStream.prototype.addListener = function(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); return this; };
        fakeStream.prototype.off = fakeStream.prototype.removeListener = function(ev, fn) { if (this._h[ev]) this._h[ev] = this._h[ev].filter(function(f) { return f !== fn; }); return this; };
        fakeStream.prototype.emit = function(ev) { var a = Array.prototype.slice.call(arguments, 1); (this._h[ev] || []).forEach(function(f) { f.apply(null, a); }); return this; };
        fakeStream.prototype.write = function() { return true; };
        fakeStream.prototype.end = function() { return this; };
        fakeStream.prototype.destroy = function() { return this; };
        fakeStream.prototype.toString = function() { return ''; };
        var stdin = new fakeStream(), stdout = new fakeStream(), stderr = new fakeStream();
        var proc = new fakeStream();
        proc.stdin = stdin; proc.stdout = stdout; proc.stderr = stderr;
        proc.pid = -1;
        proc.kill = function() { return true; };
        proc.shutdown = function() { return Promise.resolve(); };
        return proc;
      },
      exec: function(c, cb) { if (cb) cb(new Error('unavailable'), '', ''); },
      execSync: function() { throw new Error('unavailable'); },
      execFile: function(f, a, cb) { if (typeof a === 'function') a(new Error('unavailable')); else if (cb) cb(new Error('unavailable')); },
      spawnSync: function() { return { pid: -1, status: 1, stderr: new Uint8Array(0), stdout: new Uint8Array(0), error: new Error('unavailable') }; },
    },
    'node:child_process': null,
    'os': {
      homedir: function() { return '/'; },
      platform: function() { return 'linux'; },
      hostname: function() { return 'localhost'; },
      type: function() { return 'Linux'; },
      arch: function() { return 'arm64'; },
      tmpdir: function() { return '/tmp'; },
      EOL: '\\n',
      cpus: function() { return []; },
      networkInterfaces: function() { return {}; },
      totalmem: function() { return 0; },
      freemem: function() { return 0; },
    },
    'node:os': null,
    'crypto': {
      randomBytes: function(n) {
        var b = new Uint8Array(n);
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b);
        return typeof Buffer !== 'undefined' ? Buffer.from(b) : b;
      },
      createHash: function() { return { update: function() { return this; }, digest: function(e) { return e === 'hex' ? '' : (typeof Buffer !== 'undefined' ? Buffer.alloc(0) : new Uint8Array(0)); } }; },
      createHmac: function() { return { update: function() { return this; }, digest: function() { return ''; } }; },
      randomUUID: function() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) { var r = Math.random()*16|0; return (c==='x'?r:r&0x3|0x8).toString(16); }); },
    },
    'node:crypto': null,
    'readline': {
      createInterface: function(opts) {
        var input = opts && opts.input;
        var lines = [], waiters = [], ended = false, buf = '';
        var dec = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
        function processChunk(chunk) {
          if (chunk instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(chunk))) {
            buf += dec ? dec.decode(chunk, {stream:true}) : String.fromCharCode.apply(null, chunk);
          } else if (typeof chunk === 'string') { buf += chunk; }
          var parts = buf.split('\\n'); buf = parts.pop();
          for (var i = 0; i < parts.length; i++) {
            var line = parts[i];
            if (waiters.length > 0) { waiters.shift()({value:line, done:false}); }
            else { lines.push(line); }
          }
        }
        function onEnd() {
          ended = true;
          if (buf.length > 0) { var rem = buf; buf = '';
            if (waiters.length > 0) waiters.shift()({value:rem, done:false});
            else lines.push(rem); }
          while (waiters.length > 0) waiters.shift()({value:undefined, done:true});
        }
        if (input && typeof input.on === 'function') {
          input.on('data', processChunk); input.on('end', onEnd);
        }
        return {
          on: function() { return this; }, off: function() { return this; },
          close: function() {
            ended = true;
            if (input && typeof input.off === 'function') { input.off('data', processChunk); input.off('end', onEnd); }
            while (waiters.length > 0) waiters.shift()({value:undefined, done:true});
          },
          question: function(q, cb) { if (cb) cb(''); },
          [Symbol.asyncIterator]: function() {
            return { next: function() {
              if (lines.length > 0) return Promise.resolve({value:lines.shift(), done:false});
              if (ended) return Promise.resolve({value:undefined, done:true});
              return new Promise(function(resolve) { waiters.push(resolve); });
            }};
          }
        };
      },
    },
    'node:readline': null,
    'module': { createRequire: function() { return _pRequire; } },
    'node:module': { createRequire: function() { return _pRequire; } },
    'url': {
      fileURLToPath: function(u) { var s = typeof u === 'string' ? u : (u && u.href) || ''; return s.replace(/^file:\\/\\//, ''); },
      pathToFileURL: function(p) { return { href: 'file://' + p, toString: function() { return this.href; } }; },
      URL: typeof URL !== 'undefined' ? URL : function(u) { this.href = u; },
    },
    'node:url': null,
    'async_hooks': {
      AsyncLocalStorage: (function() {
        function ALS() { var s = undefined; this.run = function(store, fn) { var p = s; s = store; try { return fn(); } finally { s = p; } }; this.getStore = function() { return s; }; this.enterWith = function(store) { s = store; }; this.disable = function() {}; }
        return ALS;
      })(),
      AsyncResource: function(t) { this.type = t; this.runInAsyncScope = function(fn, ctx) { return fn.apply(ctx, Array.prototype.slice.call(arguments, 2)); }; this.emitDestroy = function() { return this; }; this.bind = function(fn) { return fn; }; },
      createHook: function() { return { enable: function(){}, disable: function(){} }; },
    },
    'node:async_hooks': null,
    'stream': {
      Readable: _EE, Writable: _EE, Duplex: _EE, Transform: _EE, PassThrough: _EE,
      pipeline: function() { var cb = arguments[arguments.length-1]; if (typeof cb === 'function') cb(new Error('stream.pipeline unavailable')); },
      finished: function(stream, cb) { if (typeof cb === 'function') cb(null); },
    },
    'node:stream': null,
    'string_decoder': { StringDecoder: function(enc) { this.write = function(b) { try { return b ? new TextDecoder(enc || 'utf-8').decode(b) : ''; } catch(e) { return ''; } }; this.end = function() { return ''; }; } },
    'net': { Socket: _EE, createConnection: function() { var s = new _EE(); s.pipe = function(){return s;}; s.write = function(){return true;}; s.end = function(){return s;}; s.destroy = function(){}; return s; }, createServer: function() { return { listen: function(){}, close: function(){}, on: function(){return this;} }; } },
    'node:net': null,
    'tls': { connect: function() { var s = new _EE(); s.write = function(){return true;}; s.end = function(){}; return s; } },
    'http': { request: function() { return { on: function(){return this;}, write: function(){}, end: function(){}, abort: function(){} }; }, get: function() { return { on: function(){return this;}, end: function(){} }; }, createServer: function() { return { listen: function(){}, on: function(){return this;} }; } },
    'https': { request: function() { return { on: function(){return this;}, write: function(){}, end: function(){}, abort: function(){} }; }, get: function() { return { on: function(){return this;}, end: function(){} }; } },
    'zlib': { createGzip: function() { return new _EE(); }, createGunzip: function() { return new _EE(); }, gzip: function(b, cb) { cb(null, b); }, gunzip: function(b, cb) { cb(null, b); } },
    'util': {
      promisify: function(fn) { return function() { var a = Array.prototype.slice.call(arguments); return new Promise(function(res, rej) { fn.apply(null, a.concat([function(err, val) { err ? rej(err) : res(val); }])); }); }; },
      inspect: function(o) { try { return JSON.stringify(o); } catch(e) { return String(o); } },
      inherits: function(ctor, sup) { ctor.prototype = Object.create(sup.prototype, { constructor: { value: ctor, writable: true, configurable: true } }); Object.setPrototypeOf(ctor, sup); },
      debuglog: function() { return function(){}; },
      format: function(s) { return String(s); },
      isBuffer: function() { return false; },
      TextEncoder: typeof TextEncoder !== 'undefined' ? TextEncoder : function() { this.encode = function(s) { return new Uint8Array(s.split('').map(function(c){return c.charCodeAt(0);})); }; },
      TextDecoder: typeof TextDecoder !== 'undefined' ? TextDecoder : function() { this.decode = function(b) { return String.fromCharCode.apply(null, b); }; },
    },
    'node:util': null,
    'assert': function assert(ok, msg) { if (!ok) throw new Error(msg || 'Assertion failed'); },
    'perf_hooks': { performance: typeof performance !== 'undefined' ? performance : { now: function() { return Date.now(); }, mark: function(){}, measure: function(){} } },
    'dns': { lookup: function(h, o, cb) { (typeof o === 'function' ? o : cb)(null, h, 4); }, resolve: function(h, cb) { cb(null, [h]); } },
    'v8': { serialize: function() { return new Uint8Array(0); }, deserialize: function() { return null; }, getHeapStatistics: function() { return {}; } },
    'buffer': typeof Buffer !== 'undefined' ? { Buffer: Buffer } : { Buffer: { alloc: function(n) { return new Uint8Array(n); }, from: function(d, enc) { if (typeof d === 'string') { try { return Uint8Array.from(atob(d), function(c){return c.charCodeAt(0);}); } catch(e) {} return new Uint8Array(d.split('').map(function(c){return c.charCodeAt(0);})); } return new Uint8Array(d); }, isBuffer: function() { return false; }, concat: function(list) { var total = list.reduce(function(n,b){return n+b.length;},0); var out = new Uint8Array(total); var off=0; list.forEach(function(b){out.set(b,off);off+=b.length;}); return out; } } },
    'node:buffer': null,
    'process': typeof process !== 'undefined' ? process : { env: {}, platform: 'linux', version: 'v0.0.0', versions: {}, argv: [], execPath: '', cwd: function() { return '/'; }, exit: function() {}, nextTick: function(fn) { setTimeout(fn, 0); }, hrtime: function() { return [0, Date.now() * 1e6]; }, uptime: function() { return 0; } },
    'node:process': null,
    'timers': { setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: setInterval, clearInterval: clearInterval, setImmediate: function(fn) { setTimeout(fn, 0); } },
    'node:timers': null,
    'querystring': { stringify: function(o) { return Object.keys(o).map(function(k){ return encodeURIComponent(k)+'='+encodeURIComponent(o[k]); }).join('&'); }, parse: function(s) { var o={}; s.split('&').forEach(function(p){ var kv=p.split('='); if(kv[0]) o[decodeURIComponent(kv[0])]=decodeURIComponent(kv[1]||''); }); return o; } },
    'punycode': { toASCII: function(d) { return d; }, toUnicode: function(d) { return d; } },
    'tty': { isatty: function() { return false; }, ReadStream: _EE, WriteStream: _EE },
    'constants': { O_RDONLY: 0, O_WRONLY: 1, O_RDWR: 2, O_CREAT: 64, O_TRUNC: 512, O_APPEND: 1024 },
    'domain': { create: function() { var d = new _EE(); d.run = function(fn) { try { fn(); } catch(e) { d.emit('error', e); } }; d.add = function(){}; d.remove = function(){}; d.bind = function(fn) { return fn; }; d.intercept = function(fn) { return fn; }; d.enter = function(){}; d.exit = function(){}; return d; } },
    'inspector': { open: function(){}, close: function(){}, url: function(){ return null; } },
    'worker_threads': { isMainThread: true, parentPort: null, Worker: function() { throw new Error('Worker threads unavailable'); }, workerData: null, threadId: 0 },
    'cluster': { isMaster: true, isWorker: false, fork: function() { throw new Error('cluster unavailable'); } },
    'dgram': { createSocket: function() { var s = new _EE(); s.bind = function(){}; s.send = function(){}; s.close = function(){}; return s; } },
    'wasi': {},
    'trace_events': { createTracing: function() { return { enable: function(){}, disable: function(){} }; } },
  };

  // Fill node:* aliases
  Object.keys(_stubs).forEach(function(k) {
    if (_stubs[k] === null) {
      var base = k.replace('node:', '');
      _stubs[k] = _stubs[base] || {};
    }
  });

  function _pRequire(id) {
    if (Object.prototype.hasOwnProperty.call(_stubs, id)) {
      return _stubs[id];
    }
    if (typeof __outer_require__ === 'function') {
      try { return __outer_require__(id); } catch(e) {
        if (_stubs[id] !== undefined) return _stubs[id];
        throw e;
      }
    }
    throw new Error("Cannot find module '" + id + "'");
  }

  // Copy properties from original require (like .resolve, .cache, etc.)
  if (typeof __outer_require__ === 'function') {
    try { Object.assign(_pRequire, __outer_require__); } catch(e) {}
  }

  // Check whether we're already in a Node.js / Electron environment
  // where built-in modules are real.  If so, skip stub injection and
  // just run the bundle with the real require.
  var _isNodeEnv = false;
  try {
    var _testFs = (typeof __outer_require__ === 'function') ? __outer_require__('fs') : null;
    _isNodeEnv = !!(_testFs && typeof _testFs.existsSync === 'function');
  } catch(e) { /* mobile — fs unavailable */ }

  // CJS globals that Node.js provides but mobile environments don't.
  // The SDK uses __filename for createRequire() calls at the top level.
  var __filename = typeof __filename !== 'undefined' ? __filename : 'main.js';
  var __dirname  = typeof __dirname  !== 'undefined' ? __dirname  : '/';

  // 'global' is the Node.js global object; browsers don't have it.
  // isexe (required by cross-spawn → which) accesses global.TESTING_WINDOWS
  // without a typeof guard at module init time.
  var global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : this));

  // Ensure Buffer exists (Electron provides it; mobile may not).
  if (typeof Buffer === 'undefined') {
    var Buffer = {
      alloc: function(n) { return new Uint8Array(n); },
      from: function(d, enc) {
        if (typeof d === 'string') {
          if (enc === 'base64') {
            try { return Uint8Array.from(atob(d), function(c) { return c.charCodeAt(0); }); } catch(e) {}
          }
          return new Uint8Array(d.split('').map(function(c) { return c.charCodeAt(0); }));
        }
        return new Uint8Array(d);
      },
      isBuffer: function() { return false; },
      concat: function(list) {
        var total = list.reduce(function(n, b) { return n + b.length; }, 0);
        var out = new Uint8Array(total), off = 0;
        list.forEach(function(b) { out.set(b, off); off += b.length; });
        return out;
      },
    };
  }

  // Ensure process exists (with EventEmitter methods — SDK calls process.on("exit", ...) at spawn)
  if (typeof process === 'undefined') {
    var process = (function() {
      var _h = {};
      return {
        env: {}, platform: 'linux', version: 'v0.0.0', versions: {},
        argv: [], execPath: '', cwd: function() { return '/'; }, exit: function() {},
        nextTick: function(fn) { setTimeout(fn, 0); },
        hrtime: function() { return [0, Date.now() * 1e6]; },
        on: function(ev, fn) { (_h[ev] = _h[ev] || []).push(fn); return this; },
        off: function(ev, fn) { if (_h[ev]) _h[ev] = _h[ev].filter(function(f) { return f !== fn; }); return this; },
        removeListener: function(ev, fn) { return this.off(ev, fn); },
        emit: function(ev) { var a = Array.prototype.slice.call(arguments, 1); (_h[ev] || []).forEach(function(f) { f.apply(null, a); }); return true; },
        addListener: function(ev, fn) { return this.on(ev, fn); },
        once: function(ev, fn) { var self = this; function w() { self.off(ev, w); fn.apply(this, arguments); } return this.on(ev, w); },
        listenerCount: function(ev) { return (_h[ev] || []).length; },
        stderr: { write: function() {} }, stdout: { write: function() {} },
        uptime: function() { return 0; },
      };
    })();
  }

  // Run the bundle with the appropriate require; catch and report errors.
  try {
    (function(require) {
${original}
    })(_isNodeEnv ? __outer_require__ : _pRequire);
  } catch(e) {
    // Store error so it can be retrieved via the browser console:
    //   localStorage.getItem('aidian_load_error')
    try { localStorage.setItem('aidian_load_error', (e && (e.stack || e.message)) || String(e)); } catch(_) {}
    throw e;
  }

})(typeof require !== 'undefined' ? require : undefined);
`;

fs.writeFileSync(mainJsPath, polyfill, 'utf-8');
console.log('[patch-mobile] main.js patched successfully (' + Math.round(polyfill.length / 1024) + ' KB)');
