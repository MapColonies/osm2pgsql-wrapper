import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import fsPromises from 'fs/promises';
import Ajv from 'ajv';
import * as ajvKeywords from 'ajv-keywords';
import betterAjvErrors from 'better-ajv-errors';
import { SERVICES } from '../common/constants';
import { AppendEntity, APPEND_CONFIG_SCHEMA } from './schema';

export interface ValidationResponse<T> {
  isValid: boolean;
  errors?: string;
  content?: T;
}

@injectable()
export class Validator<T> {
  private ajv: Ajv;
  public constructor(@inject(SERVICES.LOGGER) private readonly logger: Logger) {
    this.ajv = new Ajv({ $data: true });
    ajvKeywords.default(this.ajv);
  }
  public async validate(filePath: string): Promise<ValidationResponse<T>> {
    const fileContent = await fsPromises.readFile(filePath, 'utf-8');
    const jsonContent: T = JSON.parse(fileContent);
    const isValid = this.ajv.validate(APPEND_CONFIG_SCHEMA, jsonContent);
    if (!isValid) {
      const generalError = `${filePath} is invalid`;
      const errors =
        this.ajv.errors === undefined || this.ajv.errors === null
          ? generalError
          : betterAjvErrors(APPEND_CONFIG_SCHEMA, jsonContent, this.ajv.errors);
      return { isValid, errors };
    }

    return { isValid, content: jsonContent };
  }
}
