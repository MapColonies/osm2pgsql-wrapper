import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import qs from 'qs';
import { AxiosInstance, ResponseType } from 'axios';
import { SERVICES } from '../common/constants';
import { AxiosRequestArgsWithoutData, BaseClient, HttpResponse } from './baseClient';

const DUMP_METADATA_ENDPOINT = 'dumps';

interface DumpRequestParams {
  limit?: number;
  from?: Date;
  to?: Date;
  sort?: 'asc' | 'desc';
}

interface DumpResponse {
  id: string;
  name: string;
  timestamp: string;
  description: string;
  url: string;
}

@injectable()
export class DumpClient extends BaseClient {
  public constructor(@inject(SERVICES.LOGGER) logger: Logger, @inject(SERVICES.HTTP_CLIENT) private readonly httpClient: AxiosInstance) {
    super(logger);
  }

  public async getDumpsMetadata(dumpServerUrl: string, params: DumpRequestParams): Promise<HttpResponse<DumpResponse[]>> {
    this.logger.info(`invoking GET to ${dumpServerUrl}/${DUMP_METADATA_ENDPOINT}`);

    const funcRef = this.httpClient.get.bind(this.httpClient);
    return this.invokeHttp<DumpResponse[], AxiosRequestArgsWithoutData, typeof funcRef>(funcRef, DUMP_METADATA_ENDPOINT, {
      baseURL: dumpServerUrl,
      params,
      paramsSerializer: (params: DumpRequestParams) => qs.stringify(params, { indices: false }),
    });
  }

  public async getDump(url: string): Promise<HttpResponse<Buffer>> {
    this.logger.info(`invoking GET to ${url}`);

    const funcRef = this.httpClient.get.bind(this.httpClient);
    return this.invokeHttp<Buffer, AxiosRequestArgsWithoutData, typeof funcRef>(funcRef, url, {
      responseType: 'arraybuffer' as ResponseType,
      headers: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'Content-Type': 'application/gzip',
      },
    });
  }
}
