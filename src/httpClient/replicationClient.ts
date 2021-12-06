import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { SERVICES, STATE_FILE } from '../common/constants';
import { AxiosError, AxiosInstance } from 'axios';

export interface HttpResponse<T> {
  data: T;
  contentType: string;
  code: number;
}

@injectable()
export class ReplicationClient {
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.HTTP_CLIENT) private readonly httpClient: AxiosInstance
  ) {}
  public async getState(url: string): Promise<HttpResponse<string>> {
    try {
      const response = await this.httpClient.get<string>(STATE_FILE, {
        baseURL: url,
      });
      return { data: response.data, contentType: response.headers['content-type'], code: response.status };
    } catch (error) {
      const axiosError = error as AxiosError<NodeJS.ReadStream>;
      if (axiosError.request !== undefined) {
        throw new Error();
        // throw new UpstreamUnavailableError('no response received from the upstream');
      } else {
        this.logger.error(axiosError.message);
        throw new Error('replication request failed to dispatch');
      }
    }
  }
}
