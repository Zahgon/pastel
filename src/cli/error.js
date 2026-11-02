// Copyright (c) David Peter and pastel contributors.
// SPDX-License-Identifier: MIT OR Apache-2.0
// JavaScript port of src/cli/error.rs from sharkdp/pastel v0.12.0.

/**
 * Text of glibc's `strerror` on Linux, by error number (41 and 58 are unassigned). Rust's
 * `std::io::Error` displays OS errors as `<strerror text> (os error <errno>)`.
 */
const STRERROR = Object.freeze({
  1: 'Operation not permitted',
  2: 'No such file or directory',
  3: 'No such process',
  4: 'Interrupted system call',
  5: 'Input/output error',
  6: 'No such device or address',
  7: 'Argument list too long',
  8: 'Exec format error',
  9: 'Bad file descriptor',
  10: 'No child processes',
  11: 'Resource temporarily unavailable',
  12: 'Cannot allocate memory',
  13: 'Permission denied',
  14: 'Bad address',
  15: 'Block device required',
  16: 'Device or resource busy',
  17: 'File exists',
  18: 'Invalid cross-device link',
  19: 'No such device',
  20: 'Not a directory',
  21: 'Is a directory',
  22: 'Invalid argument',
  23: 'Too many open files in system',
  24: 'Too many open files',
  25: 'Inappropriate ioctl for device',
  26: 'Text file busy',
  27: 'File too large',
  28: 'No space left on device',
  29: 'Illegal seek',
  30: 'Read-only file system',
  31: 'Too many links',
  32: 'Broken pipe',
  33: 'Numerical argument out of domain',
  34: 'Numerical result out of range',
  35: 'Resource deadlock avoided',
  36: 'File name too long',
  37: 'No locks available',
  38: 'Function not implemented',
  39: 'Directory not empty',
  40: 'Too many levels of symbolic links',
  42: 'No message of desired type',
  43: 'Identifier removed',
  44: 'Channel number out of range',
  45: 'Level 2 not synchronized',
  46: 'Level 3 halted',
  47: 'Level 3 reset',
  48: 'Link number out of range',
  49: 'Protocol driver not attached',
  50: 'No CSI structure available',
  51: 'Level 2 halted',
  52: 'Invalid exchange',
  53: 'Invalid request descriptor',
  54: 'Exchange full',
  55: 'No anode',
  56: 'Invalid request code',
  57: 'Invalid slot',
  59: 'Bad font file format',
  60: 'Device not a stream',
  61: 'No data available',
  62: 'Timer expired',
  63: 'Out of streams resources',
  64: 'Machine is not on the network',
  65: 'Package not installed',
  66: 'Object is remote',
  67: 'Link has been severed',
  68: 'Advertise error',
  69: 'Srmount error',
  70: 'Communication error on send',
  71: 'Protocol error',
  72: 'Multihop attempted',
  73: 'RFS specific error',
  74: 'Bad message',
  75: 'Value too large for defined data type',
  76: 'Name not unique on network',
  77: 'File descriptor in bad state',
  78: 'Remote address changed',
  79: 'Can not access a needed shared library',
  80: 'Accessing a corrupted shared library',
  81: '.lib section in a.out corrupted',
  82: 'Attempting to link in too many shared libraries',
  83: 'Cannot exec a shared library directly',
  84: 'Invalid or incomplete multibyte or wide character',
  85: 'Interrupted system call should be restarted',
  86: 'Streams pipe error',
  87: 'Too many users',
  88: 'Socket operation on non-socket',
  89: 'Destination address required',
  90: 'Message too long',
  91: 'Protocol wrong type for socket',
  92: 'Protocol not available',
  93: 'Protocol not supported',
  94: 'Socket type not supported',
  95: 'Operation not supported',
  96: 'Protocol family not supported',
  97: 'Address family not supported by protocol',
  98: 'Address already in use',
  99: 'Cannot assign requested address',
  100: 'Network is down',
  101: 'Network is unreachable',
  102: 'Network dropped connection on reset',
  103: 'Software caused connection abort',
  104: 'Connection reset by peer',
  105: 'No buffer space available',
  106: 'Transport endpoint is already connected',
  107: 'Transport endpoint is not connected',
  108: 'Cannot send after transport endpoint shutdown',
  109: 'Too many references: cannot splice',
  110: 'Connection timed out',
  111: 'Connection refused',
  112: 'Host is down',
  113: 'No route to host',
  114: 'Operation already in progress',
  115: 'Operation now in progress',
  116: 'Stale file handle',
  117: 'Structure needs cleaning',
  118: 'Not a XENIX named type file',
  119: 'No XENIX semaphores available',
  120: 'Is a named type file',
  121: 'Remote I/O error',
  122: 'Disk quota exceeded',
  123: 'No medium found',
  124: 'Wrong medium type',
  125: 'Operation canceled',
  126: 'Required key not available',
  127: 'Key has expired',
  128: 'Key has been revoked',
  129: 'Key was rejected by service',
  130: 'Owner died',
  131: 'State not recoverable',
  132: 'Operation not possible due to RF-kill',
  133: 'Memory page has hardware error',
});

/**
 * Port of the parts of `std::io::Error` that pastel exposes: an OS error (errno) or one of the
 * standard library's fixed messages. The `message` is the text of Rust's `Display`
 * implementation, e.g. `No space left on device (os error 28)`.
 */
export class IoError extends Error {
  /**
   * @param {string} code Symbolic error code (`EPIPE`, ..., or `InvalidData`/`WriteZero`).
   * @param {number|null} errno OS error number, `null` for errors that do not come from the OS.
   * @param {string} description The error text without the `(os error N)` suffix.
   */
  constructor(code, errno, description) {
    super(errno === null ? description : `${description} (os error ${errno})`);
    this.name = 'IoError';
    this.code = code;
    this.errno = errno;
  }

  /**
   * Converts a Node.js system error (thrown by the `fs` and `child_process` functions) into an
   * `IoError`.
   * @param {Error & {code?: string, errno?: number}} err
   * @returns {IoError}
   */
  static fromNodeError(err) {
    const code = typeof err.code === 'string' ? err.code : 'EIO';
    const errno = typeof err.errno === 'number' ? Math.abs(err.errno) : 5;
    const text = STRERROR[errno] ?? `Unknown error ${errno}`;
    return new IoError(code, errno, text);
  }

  /**
   * The error returned by `read_to_string` for input that is not valid UTF-8.
   * @returns {IoError}
   */
  static invalidUtf8() {
    return new IoError('InvalidData', null, 'stream did not contain valid UTF-8');
  }

  /**
   * The error returned by `write_all` when the writer accepts no more bytes.
   * @returns {IoError}
   */
  static writeZero() {
    return new IoError('WriteZero', null, 'failed to write whole buffer');
  }

  /**
   * The error returned by `BufWriter::flush_buf` when the writer accepts no more bytes.
   * @returns {IoError}
   */
  static writeZeroBuffered() {
    return new IoError('WriteZero', null, 'failed to write the buffered data');
  }

  /** @returns {boolean} `true` for `std::io::ErrorKind::BrokenPipe` */
  isBrokenPipe() {
    return this.code === 'EPIPE';
  }
}

/** The variants of `PastelError`. */
export const ErrorKind = Object.freeze({
  UnknownColorMode: 'UnknownColorMode',
  ColorParseError: 'ColorParseError',
  ColorInvalidUTF8: 'ColorInvalidUTF8',
  CouldNotReadFromStdin: 'CouldNotReadFromStdin',
  ColorArgRequired: 'ColorArgRequired',
  CouldNotParseNumber: 'CouldNotParseNumber',
  StdoutClosed: 'StdoutClosed',
  GradientNumberMustBeLargerThanOne: 'GradientNumberMustBeLargerThanOne',
  GradientColorCountMustBeLargerThanOne: 'GradientColorCountMustBeLargerThanOne',
  DistinctColorCountMustBeLargerThanOne: 'DistinctColorCountMustBeLargerThanOne',
  DistinctColorFixedColorsCannotBeMoreThanCount: 'DistinctColorFixedColorsCannotBeMoreThanCount',
  ColorPickerExecutionError: 'ColorPickerExecutionError',
  NoColorPickerFound: 'NoColorPickerFound',
  IoError: 'IoError',
});

/**
 * Builds the user-facing message of an error (Rust `PastelError::message`).
 * @param {string} kind One of `ErrorKind`.
 * @param {string | IoError | undefined} detail The payload of the variant.
 * @returns {string}
 */
function messageOf(kind, detail) {
  switch (kind) {
    case ErrorKind.UnknownColorMode:
      return `Unknown PASTEL_COLOR_MODE value (${detail})`;
    case ErrorKind.ColorParseError:
      return `Could not parse color '${detail}'`;
    case ErrorKind.ColorInvalidUTF8:
      return 'Color input contains invalid UTF8';
    case ErrorKind.CouldNotReadFromStdin:
      return 'Could not read color from standard input';
    case ErrorKind.ColorArgRequired:
      return (
        'A color argument needs to be provided on the command line or via a pipe. ' +
        "Call this command again with '-h' or '--help' to get more information."
      );
    case ErrorKind.CouldNotParseNumber:
      return `Could not parse number '${detail}'`;
    case ErrorKind.StdoutClosed:
      return 'Output pipe has been closed';
    case ErrorKind.GradientNumberMustBeLargerThanOne:
      return 'The specified color count must be larger than one';
    case ErrorKind.GradientColorCountMustBeLargerThanOne:
      return 'The number of color arguments must be larger than one';
    case ErrorKind.DistinctColorCountMustBeLargerThanOne:
      return 'The number of colors must be larger than one';
    case ErrorKind.DistinctColorFixedColorsCannotBeMoreThanCount:
      return 'The number of fixed colors must be smaller than the total number of colors';
    case ErrorKind.ColorPickerExecutionError:
      return `Error while running color picker '${detail}'`;
    case ErrorKind.NoColorPickerFound:
      return "Could not find any external color picker tool. See 'pastel pick --help' for more information.";
    case ErrorKind.IoError:
      return `I/O error: ${detail.message}`;
    default:
      throw new TypeError(`unknown PastelError kind ${kind}`);
  }
}

/**
 * Error type of the pastel command line tool (Rust `PastelError`). `kind` identifies the variant,
 * `message` is the text shown as `[pastel error]: <message>`.
 */
export class PastelError extends Error {
  /**
   * @param {string} kind One of `ErrorKind`.
   * @param {string | IoError} [detail] The payload of the variant.
   */
  constructor(kind, detail) {
    super(messageOf(kind, detail));
    this.name = 'PastelError';
    this.kind = kind;
    this.detail = detail;
  }

  /**
   * @param {string} mode The invalid value of `PASTEL_COLOR_MODE`.
   * @returns {PastelError}
   */
  static unknownColorMode(mode) {
    return new PastelError(ErrorKind.UnknownColorMode, mode);
  }

  /**
   * @param {string} color The text that is not a valid color.
   * @returns {PastelError}
   */
  static colorParseError(color) {
    return new PastelError(ErrorKind.ColorParseError, color);
  }

  /** @returns {PastelError} */
  static colorInvalidUtf8() {
    return new PastelError(ErrorKind.ColorInvalidUTF8);
  }

  /** @returns {PastelError} */
  static couldNotReadFromStdin() {
    return new PastelError(ErrorKind.CouldNotReadFromStdin);
  }

  /** @returns {PastelError} */
  static colorArgRequired() {
    return new PastelError(ErrorKind.ColorArgRequired);
  }

  /**
   * @param {string} number The text that is not a valid number.
   * @returns {PastelError}
   */
  static couldNotParseNumber(number) {
    return new PastelError(ErrorKind.CouldNotParseNumber, number);
  }

  /** @returns {PastelError} */
  static stdoutClosed() {
    return new PastelError(ErrorKind.StdoutClosed);
  }

  /** @returns {PastelError} */
  static gradientNumberMustBeLargerThanOne() {
    return new PastelError(ErrorKind.GradientNumberMustBeLargerThanOne);
  }

  /** @returns {PastelError} */
  static gradientColorCountMustBeLargerThanOne() {
    return new PastelError(ErrorKind.GradientColorCountMustBeLargerThanOne);
  }

  /** @returns {PastelError} */
  static distinctColorCountMustBeLargerThanOne() {
    return new PastelError(ErrorKind.DistinctColorCountMustBeLargerThanOne);
  }

  /** @returns {PastelError} */
  static distinctColorFixedColorsCannotBeMoreThanCount() {
    return new PastelError(ErrorKind.DistinctColorFixedColorsCannotBeMoreThanCount);
  }

  /**
   * @param {string} name The command of the color picker tool.
   * @returns {PastelError}
   */
  static colorPickerExecutionError(name) {
    return new PastelError(ErrorKind.ColorPickerExecutionError, name);
  }

  /** @returns {PastelError} */
  static noColorPickerFound() {
    return new PastelError(ErrorKind.NoColorPickerFound);
  }

  /**
   * `From<std::io::Error> for PastelError`: a broken pipe becomes `StdoutClosed`.
   * @param {IoError} ioError
   * @returns {PastelError}
   */
  static fromIoError(ioError) {
    if (ioError.isBrokenPipe()) {
      return PastelError.stdoutClosed();
    }
    return new PastelError(ErrorKind.IoError, ioError);
  }

  /**
   * `From<ansi::UnknownColorModeError> for PastelError`.
   * @param {import('../lib/ansi.js').UnknownColorModeError} err
   * @returns {PastelError}
   */
  static fromUnknownColorModeError(err) {
    return PastelError.unknownColorMode(err.value);
  }
}

/**
 * Runs `write`, ignoring a `PastelError` it throws. Used where the original deliberately
 * discards the result of a write (`.ok()`, `let _ = ...`).
 * @param {() => void} write
 */
export function ignoreWriteError(write) {
  try {
    write();
  } catch (err) {
    if (!(err instanceof PastelError)) {
      throw err;
    }
  }
}

/**
 * A write went over the file size limit (`ulimit -f`). The kernel ends a Rust program with
 * `SIGXFSZ` there, so nothing on the way handles this: the command's entry ends the process the
 * same way.
 */
export class FileSizeLimitExceeded extends Error {}

/**
 * A Rust panic (failed assertion, `expect` on `None`, ...). The command prints it like the Rust
 * runtime does and exits with status 101.
 */
export class Panic extends Error {
  /**
   * @param {string} message The panic payload.
   * @param {string} location `file:line:column` of the panicking expression in the Rust source.
   */
  constructor(message, location) {
    super(message);
    this.name = 'Panic';
    this.location = location;
  }

  /** @returns {string} the text the Rust runtime writes to stderr for this panic */
  report() {
    return (
      `thread 'main' panicked at ${this.location}:\n${this.message}\n` +
      'note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace\n'
    );
  }
}
