export interface IConfig {
  get: <T>(setting: string) => T;
  has: (setting: string) => boolean;
}

export interface IS3 {
  endpoint: string;
  region: string;
}
