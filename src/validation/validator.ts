import ajv, { AnySchemaObject, JSONSchemaType } from 'ajv';
import * as ajvKeywords from 'ajv-keywords';
import { betterAjvErrors, ValidationError } from '@apideck/better-ajv-errors';

const GENERAL_VALIDATION_ERROR = `invalid content`;

const ajvInstance = new ajv({ $data: true, coerceTypes: true, allErrors: true });
ajvKeywords.default(ajvInstance);

export interface ValidationResponse<T> {
  isValid: boolean;
  errors?: ValidationError[] | string;
  content?: T;
}

export function ajvWrapper<T>(content: unknown, schema: JSONSchemaType<T>): ValidationResponse<T> {
  const isValid = ajvInstance.validate(schema, content);
  if (!isValid) {
    const errors =
      ajvInstance.errors === undefined || ajvInstance.errors === null
        ? GENERAL_VALIDATION_ERROR
        : betterAjvErrors({ schema: schema as AnySchemaObject, data: content, errors: ajvInstance.errors });
    return { isValid, errors };
  }

  return { isValid, content };
}
