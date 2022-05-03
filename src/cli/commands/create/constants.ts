export const command = 'create';
export const describe = 'initialize a database from scratch by creating it out of an osm pbf file';

export const CREATE_COMMAND_FACTORY = Symbol('CreateCommandFactory');
export const CREATE_MANAGER_FACTORY = Symbol('CreateManagerFactory');

export enum DumpSourceType {
  LOCAL_FILE = 'local-file',
  REMOTE_URL = 'remote-url',
  DUMP_SERVER = 'dump-server',
}
