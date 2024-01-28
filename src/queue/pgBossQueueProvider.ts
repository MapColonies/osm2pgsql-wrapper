import { createHash } from 'crypto';
import { Logger } from '@map-colonies/js-logger';
import PgBoss from 'pg-boss';
import { inject, injectable } from 'tsyringe';
import client from 'prom-client';
import { SERVICES } from '../common/constants';
import { QueueError, RequestAlreadyInQueueError } from '../common/errors';
import { IConfig } from '../common/interfaces';
import { QueueProvider } from './queueProvider';

@injectable()
export class PgBossQueueProvider implements QueueProvider {
  private readonly queueName;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    private readonly pgBoss: PgBoss,
    @inject(SERVICES.CONFIG_STORE) configStore: IConfig,
    @inject(SERVICES.METRICS_REGISTRY) registry?: client.Registry
  ) {
    this.queueName = configStore.get<string>('queue.name');

    if (registry !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self = this;
      new client.Gauge({
        name: 'osm2pgsql_wrapper_requests_queue_current_count',
        help: 'The number of jobs currently in the requests queue',
        async collect(): Promise<void> {
          const currentQueueSize = await self.pgBoss.getQueueSize(self.queueName);
          this.set(currentQueueSize);
        },
        registers: [registry],
      });
    }
  }

  public get activeQueueName(): string {
    return this.queueName;
  }

  public async startQueue(): Promise<void> {
    this.logger.info({ msg: 'starting pgboss queue', queueName: this.queueName });

    this.pgBoss.on('error', (err) => {
      this.logger.error({ msg: 'pgboss error', err, queueName: this.queueName });
    });

    try {
      await this.pgBoss.start();
    } catch (error) {
      const queueError = error as Error;
      this.logger.error({ msg: 'failed to start queue', err: queueError, queueName: this.queueName });
      throw new QueueError(queueError.message);
    }
  }

  public async stopQueue(): Promise<void> {
    this.logger.info({ msg: 'stopping pgboss queue', queueName: this.queueName });

    await this.pgBoss.stop();
  }

  public async push(payload: object): Promise<void> {
    this.logger.info({ msg: 'pushing request into queue', queueName: this.queueName });

    const hash = createHash('md5');
    hash.update(JSON.stringify(payload));
    try {
      const response = await this.pgBoss.sendOnce(this.queueName, payload, {}, hash.digest('hex'));

      if (response === null) {
        throw new RequestAlreadyInQueueError(`request already in queue: ${this.queueName}`);
      }
    } catch (error) {
      const queueError = error as Error;
      this.logger.error({ msg: 'failed to push request into queue', err: queueError, queueName: this.queueName });
      throw new QueueError(queueError.message);
    }
  }
}
