import { ExitCodes } from './constants';

export class ErrorWithExitCode extends Error {
  public constructor(message?: string, public exitCode: number = ExitCodes.GENERAL_ERROR) {
    super(message);
    this.exitCode = exitCode;
    Object.setPrototypeOf(this, ErrorWithExitCode.prototype);
  }
}

export class S3Error extends ErrorWithExitCode {
  public constructor(message?: string) {
    super(message, ExitCodes.S3_ERROR);
    Object.setPrototypeOf(this, S3Error.prototype);
  }
}

export class HttpUpstreamUnavailableError extends ErrorWithExitCode {
  public constructor(message?: string) {
    super(message, ExitCodes.REMOTE_SERVICE_UNAVAILABLE);
    Object.setPrototypeOf(this, HttpUpstreamUnavailableError.prototype);
  }
}

export class HttpUpstreamResponseError extends ErrorWithExitCode {
  public constructor(message?: string) {
    super(message, ExitCodes.REMOTE_SERVICE_RESPONSE_ERROR);
    Object.setPrototypeOf(this, HttpUpstreamResponseError.prototype);
  }
}

export class DumpServerEmptyResponseError extends ErrorWithExitCode {
  public constructor(message?: string) {
    super(message, ExitCodes.DUMP_SERVER_EMPTY_RESPONSE_ERROR);
    Object.setPrototypeOf(this, DumpServerEmptyResponseError.prototype);
  }
}

export class Osm2pgsqlError extends ErrorWithExitCode {
  public constructor(message?: string) {
    super(message, ExitCodes.OSM2PGSQL_ERROR);
    Object.setPrototypeOf(this, Osm2pgsqlError.prototype);
  }
}

export class OsmiumError extends ErrorWithExitCode {
  public constructor(message?: string) {
    super(message, ExitCodes.OSMIUM_ERROR);
    Object.setPrototypeOf(this, OsmiumError.prototype);
  }
}

export class InvalidStateFileError extends ErrorWithExitCode {
  public constructor(message?: string) {
    super(message, ExitCodes.INVALID_STATE_FILE_ERROR);
    Object.setPrototypeOf(this, InvalidStateFileError.prototype);
  }
}
