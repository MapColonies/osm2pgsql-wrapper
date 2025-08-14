import { get, set } from 'lodash';
import { NOT_FOUND_INDEX } from './constants';
import { IConfig } from './interfaces';

export class ConfigStore implements IConfig {
  private readonly store: Record<string, unknown> = {};

  public get<T>(key: string): T {
    return get(this.store, key) as T;
  }

  public has(key: string): boolean {
    return Object.keys(this.store).indexOf(key) !== NOT_FOUND_INDEX;
  }

  public set(key: string, value: unknown): void {
    set(this.store, key, value);
  }
}
