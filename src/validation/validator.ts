import Ajv from 'ajv';
import { JSONSchemaType } from 'ajv';
import * as ajvKeywords from 'ajv-keywords';
import betterAjvErrors from 'better-ajv-errors';

const ajv = new Ajv({ $data: true, coerceTypes: true });
ajvKeywords.default(ajv);

export interface ValidationResponse<T> {
  isValid: boolean;
  errors?: string;
  content?: T;
}

export function validateBySchema<T>(content: unknown, schema: JSONSchemaType<T>): ValidationResponse<T> {
  const isValid = ajv.validate(schema, content);
  if (!isValid) {
    const generalError = `invalid content`;
    const errors = ajv.errors === undefined || ajv.errors === null ? generalError : betterAjvErrors(schema, content, ajv.errors);
    return { isValid, errors };
  }

  return { isValid, content };
}
