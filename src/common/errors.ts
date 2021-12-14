export class S3Error extends Error {
  public constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, S3Error.prototype);
  }
}

export class HttpUpstreamUnavailableError extends Error {
  public constructor(message?: string) {
    super(message);
    Object.setPrototypeOf(this, HttpUpstreamUnavailableError.prototype);
  }
}

export class HttpUpstreamResponseError extends Error {
  public constructor(message?: string) {
    super(message);
    Object.setPrototypeOf(this, HttpUpstreamResponseError.prototype);
  }
}

export class DumpServerEmptyResponseError extends Error {
  public constructor(message?: string) {
    super(message);
    Object.setPrototypeOf(this, DumpServerEmptyResponseError.prototype);
  }
}

export class Osm2pgsqlError extends Error {
  public constructor(message?: string) {
    super(message);
    Object.setPrototypeOf(this, Osm2pgsqlError.prototype);
  }
}

export class OsmiumError extends Error {
  public constructor(message?: string) {
    super(message);
    Object.setPrototypeOf(this, OsmiumError.prototype);
  }
}

export class InvalidStateFileError extends Error {
  public constructor(message?: string) {
    super(message);
    Object.setPrototypeOf(this, InvalidStateFileError.prototype);
  }
}
