import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { AxiosInstance } from 'axios';
import { SERVICES, STATE_FILE } from '../common/constants';
import { AxiosRequestArgsWithoutData, BaseClient, HttpResponse } from './baseClient';

@injectable()
export class ReplicationClient extends BaseClient {
  public constructor(@inject(SERVICES.LOGGER) logger: Logger, @inject(SERVICES.HTTP_CLIENT) private readonly httpClient: AxiosInstance) {
    super(logger);
  }

  public async getState(url: string): Promise<HttpResponse<string>> {
    this.logger.debug({ msg: 'invoking http GET request', url: `${url}/${STATE_FILE}` });

    const funcRef = this.httpClient.get.bind(this.httpClient);
    return this.invokeHttp<string, undefined, AxiosRequestArgsWithoutData, typeof funcRef>(funcRef, STATE_FILE, {
      baseURL: url,
    });
  }

  public async getDiff(base: string, diffUrl: string): Promise<HttpResponse<NodeJS.ReadStream>> {
    this.logger.debug({ msg: 'invoking http GET request', url: `${base}/${diffUrl}` });

    const funcRef = this.httpClient.get.bind(this.httpClient);
    return this.invokeHttp<NodeJS.ReadStream, undefined, AxiosRequestArgsWithoutData, typeof funcRef>(funcRef, diffUrl, {
      baseURL: base,
      responseType: 'stream',
    });
  }
}
