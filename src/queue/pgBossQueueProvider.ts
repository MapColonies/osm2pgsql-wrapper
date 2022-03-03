import { createHash } from 'crypto';
import { Logger } from '@map-colonies/js-logger';
import PgBoss from 'pg-boss';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../common/constants';
import { RequestAlreadyInQueueError } from '../common/errors';
import { IConfig } from '../common/interfaces';
import { QueueProvider } from './queueProvider';

@injectable()
export class PgBossQueueProvider implements QueueProvider {
  private readonly queueName;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    private readonly pgBoss: PgBoss,
    @inject(SERVICES.CONFIG_STORE) config: IConfig
  ) {
    this.queueName = config.get<string>('queue.name');
  }

  public async startQueue(): Promise<void> {
    this.logger.info('starting pg-boss queue');

    this.pgBoss.on('error', (err) => {
      this.logger.error(err, 'pg-boss error');
    });

    await this.pgBoss.start();
  }

  public async stopQueue(): Promise<void> {
    this.logger.info('stopping pg-boss queue');
    await this.pgBoss.stop();
  }

  public async push(payload: object): Promise<void> {
    this.logger.info(`pushing payload into ${this.queueName}`);

    const hash = createHash('md5');
    hash.update(JSON.stringify(payload));
    const response = await this.pgBoss.sendOnce(this.queueName, payload, {}, hash.digest('hex'));
    if (response === null) {
      throw new RequestAlreadyInQueueError(`Request already in queue ${this.queueName}`);
    }
  }
}
