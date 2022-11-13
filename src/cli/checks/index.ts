import fsPromises from 'fs/promises';
import { existsSync } from 'fs';
import { Arguments } from 'yargs';
import { isWebUri } from 'valid-url';
import { AppendArguments, QueueSettings } from '../commands/append/interfaces';
import { ajvWrapper, ValidationResponse } from '../../validation/validator';
import { LIMIT_SCHEMA, Limit, AppendEntity, QUEUE_SETTINGS_SCHEMA, APPEND_CONFIG_SCHEMA } from '../../validation/schemas';
import { NOT_FOUND_INDEX } from '../../common/constants';
import { CreateArguments } from '../commands/create/createFactory';
import { DumpSourceType } from '../commands/create/constants';

const HTTP_HEADERS_CHECK_ARG = 'dump-server-headers';
const HEADER_KEY_VALUE_PAIR_LENGTH = 2;

type InvalidHandler<T> = (validationResponse: ValidationResponse<T>) => void;
type CheckFunc<T> = (args: Arguments<T>) => Promise<boolean> | boolean;

// checks the validity of the limit argument
export const limitCheck = (invalidHandler: InvalidHandler<unknown>): CheckFunc<AppendArguments> => {
  const check: CheckFunc<AppendArguments> = (args) => {
    const { limit } = args;
    const validationResponse = ajvWrapper<Limit>({ limit }, LIMIT_SCHEMA);
    invalidHandler(validationResponse);
    return true;
  };
  return check;
};

// checks the validity of the append config
export const configCheck = (invalidHandler: InvalidHandler<unknown>): CheckFunc<AppendArguments> => {
  const check: CheckFunc<AppendArguments> = async (args) => {
    const { config } = args;
    const configContent = await fsPromises.readFile(config, 'utf-8');
    const configContentAsJson: unknown = JSON.parse(configContent);
    const validationResponse = ajvWrapper<AppendEntity[]>(configContentAsJson, APPEND_CONFIG_SCHEMA);
    invalidHandler(validationResponse);
    return true;
  };
  return check;
};

// checks the validity of argumented upload targets, specificly the queue's
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
      const validationResponse = ajvWrapper<QueueSettings>(request, QUEUE_SETTINGS_SCHEMA);
      invalidHandler(validationResponse);
    }
    return true;
  };
  return check;
};

// checks whether the dump source arg is a valid existing local file or valid web uri
export const dumpSourceCheck = (invalidHandler: InvalidHandler<undefined>): CheckFunc<CreateArguments> => {
  const check: CheckFunc<CreateArguments> = (args) => {
    const { dumpSourceType, dumpSource } = args;

    const errorPrefix = `provided dump source of type ${dumpSourceType} is not valid`;
    if (dumpSourceType === DumpSourceType.LOCAL_FILE) {
      if (!existsSync(dumpSource)) {
        invalidHandler({ isValid: false, errors: `${errorPrefix}, ${dumpSource} does not exist locally` });
      }
    } else if (isWebUri(dumpSource) === undefined) {
      invalidHandler({ isValid: false, errors: `${errorPrefix}, ${dumpSource} is not a valid web uri` });
    }

    return true;
  };
  return check;
};

// checks whether the dump server headers is in the correct format
export const dumpServerHeadersCheck = (invalidHandler: InvalidHandler<undefined>): CheckFunc<CreateArguments> => {
  const check: CheckFunc<CreateArguments> = (args) => {
    const { dumpServerHeaders } = args;

    if (dumpServerHeaders.length > 0) {
      if (dumpServerHeaders.some((headerKeyValue) => headerKeyValue.trim().split('=').length !== HEADER_KEY_VALUE_PAIR_LENGTH)) {
        invalidHandler({ isValid: false, errors: `${HTTP_HEADERS_CHECK_ARG} must be provided in a key=value format` });
      }
    }
    return true;
  };
  return check;
};
