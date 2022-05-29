import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import qs from 'qs';
import { AxiosInstance } from 'axios';
import { SERVICES } from '../common/constants';
import { AxiosRequestArgsWithoutData, BaseClient, HttpResponse } from './baseClient';

const DUMP_METADATA_ENDPOINT = 'dumps';

interface DumpMetadataRequestParams {
  limit?: number;
  from?: Date;
  to?: Date;
  sort?: 'asc' | 'desc';
}

export interface DumpMetadataResponse {
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

  public async getDumpsMetadata(dumpServerUrl: string, params: DumpMetadataRequestParams): Promise<HttpResponse<DumpMetadataResponse[]>> {
    this.logger.debug({ msg: 'invoking http GET request', url: `${dumpServerUrl}/${DUMP_METADATA_ENDPOINT}`, params });

    const funcRef = this.httpClient.get.bind(this.httpClient);
    return this.invokeHttp<DumpMetadataResponse[], undefined, AxiosRequestArgsWithoutData, typeof funcRef>(funcRef, DUMP_METADATA_ENDPOINT, {
      baseURL: dumpServerUrl,
      params,
      paramsSerializer: (params: DumpMetadataRequestParams) => qs.stringify(params, { indices: false }),
    });
  }

  public async getDump(url: string): Promise<HttpResponse<NodeJS.ReadStream>> {
    this.logger.debug({ msg: 'invoking http GET request', url });

    const funcRef = this.httpClient.get.bind(this.httpClient);
    return this.invokeHttp<NodeJS.ReadStream, undefined, AxiosRequestArgsWithoutData, typeof funcRef>(funcRef, url, {
      responseType: 'stream',
    });
  }
}
