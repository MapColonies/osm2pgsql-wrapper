import { injectable } from 'tsyringe';
import axios, { AxiosInstance } from 'axios';
import { ILogger } from '../common/interfaces';

interface EnrollmentRequestBody {
  state: number;
  isFull: boolean;
  from: number;
  to: number;
  metadata?: Record<string, unknown>;
}

export interface EnrollmentStatus {
  count: number;
  latest?: number;
}

export interface MdrClientOptions {
  url: string;
  timeout: number;
  logger?: ILogger;
}

export interface IMdrClient {
  getStatus: () => Promise<EnrollmentStatus>;
  postEnrollment: (enrollment: EnrollmentRequestBody) => Promise<void>;
}

@injectable()
export class MdrClient {
  private readonly httpClient: AxiosInstance;
  private readonly logger: ILogger | undefined;

  public constructor(options: MdrClientOptions) {
    const { logger, ...clientOptions } = options;
    this.httpClient = axios.create({ baseURL: clientOptions.url, timeout: clientOptions.timeout });
    this.logger = logger;

    this.logger?.info({ msg: 'initialized mdr client', clientOptions });
  }

  public async getStatus(): Promise<EnrollmentStatus> {
    this.logger?.info({ msg: 'getting current enrollment status' });

    const { data } = await this.httpClient.get<EnrollmentStatus>('/enrollment/status');

    this.logger?.info({ msg: 'current enrollment status', data });

    return data;
  }

  public async postEnrollment(enrollment: EnrollmentRequestBody): Promise<void> {
    this.logger?.info({ msg: 'posting enrollment request', enrollment });

    await this.httpClient.post('/enrollment', enrollment);
  }
}
