import fsPromises from 'fs/promises';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import Ajv from 'ajv';
import { JSONSchemaType } from 'ajv';
import * as ajvKeywords from 'ajv-keywords';
import betterAjvErrors from 'better-ajv-errors';
import { SERVICES } from '../common/constants';

export interface ValidationResponse<T> {
  isValid: boolean;
  errors?: string;
  content?: T;
}

@injectable()
export class Validator<T> {
  private readonly ajv: Ajv;
  public constructor(@inject(SERVICES.LOGGER) private readonly logger: Logger) {
    this.ajv = new Ajv({ $data: true });
    ajvKeywords.default(this.ajv);
  }
  public async validate(filePath: string, schema: JSONSchemaType<T>): Promise<ValidationResponse<T>> {
    const fileContent = await fsPromises.readFile(filePath, 'utf-8');
    const jsonContent: unknown = JSON.parse(fileContent);
    const isValid = this.ajv.validate(schema, jsonContent);
    if (!isValid) {
      const generalError = `${filePath} is invalid`;
      const errors = this.ajv.errors === undefined || this.ajv.errors === null ? generalError : betterAjvErrors(schema, jsonContent, this.ajv.errors);
      return { isValid, errors };
    }

    return { isValid, content: jsonContent };
  }
}
