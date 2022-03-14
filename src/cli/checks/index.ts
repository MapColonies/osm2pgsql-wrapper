import fsPromises from 'fs/promises';
import { existsSync } from 'fs';
import { Arguments } from 'yargs';
import { isWebUri } from 'valid-url';
import { AppendArguments, QueueSettings } from '../commands/append/interfaces';
import { validateBySchema, ValidationResponse } from '../../validation/validator';
import { LIMIT_SCHEMA, Limit, AppendEntity, QUEUE_SETTINGS_SCHEMA, APPEND_CONFIG_SCHEMA } from '../../validation/schemas';
import { NOT_FOUND_INDEX } from '../../common/constants';
import { CreateArguments } from '../commands/create/createFactory';
import { DumpSourceType } from '../commands/create/constants';

type InvalidHandler<T> = (validationResponse: ValidationResponse<T>) => void;
type CheckFunc<T> = (args: Arguments<T>) => Promise<boolean> | boolean;

export const limitCheck = (invalidHandler: InvalidHandler<unknown>): CheckFunc<AppendArguments> => {
  const check: CheckFunc<AppendArguments> = (args) => {
    const { limit } = args;
    const validationResponse = validateBySchema<Limit>({ limit }, LIMIT_SCHEMA);
    invalidHandler(validationResponse);
    return true;
  };
  return check;
};

export const configCheck = (invalidHandler: InvalidHandler<unknown>): CheckFunc<AppendArguments> => {
  const check: CheckFunc<AppendArguments> = async (args) => {
    const { config } = args;
    const configContent = await fsPromises.readFile(config, 'utf-8');
    const configContentAsJson: unknown = JSON.parse(configContent);
    const validationResponse = validateBySchema<AppendEntity[]>(configContentAsJson, APPEND_CONFIG_SCHEMA);
    invalidHandler(validationResponse);
    return true;
  };
  return check;
};

export const uploadTargetsCheck = (invalidHandler: InvalidHandler<unknown>): CheckFunc<AppendArguments> => {
  const check: CheckFunc<AppendArguments> = (args) => {
    const { uploadTargets } = args;
    if (uploadTargets.indexOf('queue') !== NOT_FOUND_INDEX) {
      const { name, minZoom, maxZoom } = args;
      const request: QueueSettings = {
        name: name as string,
        minZoom: minZoom as number,
        maxZoom: maxZoom as number,
      };
      const validationResponse = validateBySchema<QueueSettings>(request, QUEUE_SETTINGS_SCHEMA);
      invalidHandler(validationResponse);
    }
    return true;
  };
  return check;
};

export const dumpSourceCheck = (): CheckFunc<CreateArguments> => {
  const check: CheckFunc<CreateArguments> = (args) => {
    const { dumpSourceType, dumpSource } = args;

    const errorPrefix = `provided dump source of type ${dumpSourceType} is not valid`;
    if (dumpSourceType === DumpSourceType.LOCAL_FILE) {
      if (!existsSync(dumpSource)) {
        throw new Error(`${errorPrefix}, ${dumpSource} does not exist locally`);
      }
    } else if (isWebUri(dumpSource) === undefined) {
      throw new Error(`${errorPrefix}, ${dumpSource} is not a valid web uri`);
    }

    return true;
  };
  return check;
};
