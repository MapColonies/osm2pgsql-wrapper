import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

export const httpClientFactory = (httpClientConfig: AxiosRequestConfig): AxiosInstance => {
  const axiosClient = axios.create(httpClientConfig);
  return axiosClient;
};
