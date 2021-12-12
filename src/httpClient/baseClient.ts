import { inject } from 'tsyringe';
import { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { Logger } from '@map-colonies/js-logger';
import { SERVICES } from '../common/constants';

type AxiosRequestArgs<T> = AxiosRequestArgsWithoutData | AxiosRequestArgsWithData<T>;
export type AxiosRequestArgsWithoutData = [string, AxiosRequestConfig?];
export type AxiosRequestArgsWithData<T> = [string, T?, AxiosRequestConfig?];

export interface HttpResponse<T> {
  data: T;
  contentType: string;
  code: number;
}

export abstract class BaseClient {
  public constructor(@inject(SERVICES.LOGGER) public readonly logger: Logger) {}

  public invokeHttp = async <T, A extends AxiosRequestArgs<T>, F extends (...args: A) => Promise<AxiosResponse<T>>>(
    func: F,
    ...args: A
  ): Promise<HttpResponse<T>> => {
    try {
      const response = await func(...args);
      return { data: response.data, contentType: response.headers['content-type'], code: response.status };
    } catch (error) {
      const axiosError = error as AxiosError<T>;
      this.logger.error(axiosError);
      if (axiosError.request !== undefined) {
        throw new Error();
        // throw new UpstreamUnavailableError('no response received from the upstream');
      } else {
        this.logger.error(axiosError.message);
        throw new Error('replication request failed to dispatch');
      }
    }
  };
}
