## Configuration

### Values

**job kind:**

- `job.enabled` - run has a job
- `cron.enabled` - run has a cronjob
- `cron.schedule` - the cronjob schedule interval in the format of [the cron schedule syntax](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/#cron-schedule-syntax)

**postgres:**

the postgres database target for osm2pgsql

- `postgres.host` - results as `PGHOST`
- `postgres.username` - results as `PGUSER`
- `postgres.password` - results as `PGPASSWORD`
- `postgres.database` - results as `PGDATABASE`
- `postgres.port` - defaults to 5432, results as `PGPORT`
- `postgres.sslAuth.enabled` - enabling postgres certificate auth
- `postgres.sslAuth.secretName` - secret name containing the certificates for `cert-conf` volume
- `postgres.sslAuth.mountPath` - the path for the mounted certificates

**s3:**

- `s3.protocol` - the protocol for the s3 endpoint
- `s3.host` - the host for the s3 endpoint
- `s3.port` - the port for the s3 endpoint
- `s3.bucketName` - s3 bucket name, results as `S3_BUCKET_NAME`
- `s3.projectId` - the projectId in s3, results as `S3_PROJECT_ID`
- `s3.accessKey` - s3 access key id, results as `AWS_ACCESS_KEY_ID`
- `s3.secretKey` - s3 secret access key, results as `AWS_SECRET_ACCESS_KEY`
- `s3.acl` - The Access-Control-List for the uploaded objects [read more](https://docs.aws.amazon.com/AmazonS3/latest/userguide/acl-overview.html#canned-acl) results as `S3_ACL`

**pgboss:**

pgboss is used for queueing the payload if requested on `append` command

- `pgboss.host` - results as `PGBOSS_HOST`
- `pgboss.username` - results as `PGBOSS_USERNAME`
- `pgboss.password` - results as `PGBOSS_PASSWORD`
- `pgboss.database` - results as `PGBOSS_DATABASE`
- `pgboss.schema` - results as `PGBOSS_SCHEMA`
- `pgboss.port` - defaults to 5432, results as `PGBOSS_PORT`
- `pgboss.sslAuth.enabled` - enabling postgres certificate auth
- `pgboss.sslAuth.secretName` - secret name containing the certificates for `pgboss-cert-conf` volume
- `pgboss.sslAuth.mountPath` - the path for the mounted certificates
- `pgboss.sslAuth.certFileName` - the name of the cert file
- `pgboss.sslAuth.keyFileName` - the name of the key file
- `pgboss.sslAuth.caFileName` - the name of the root ca file

**environment:**

- `env.httpClient.timeout` - the amount of ms until a timeout is determinded by the http client
- `env.osm2pgsql.*` - see [official osm2pgsql docs](https://osm2pgsql.org/doc/manual.html)
- `env.osmium.verbose` - verbose mode flag
- `env.osmium.progress` - stream the progression of commands

**cli:**

- `cli.command` - the command to be run create or append

*append*
- `cli.append.replicationUrl` - the source of replication
- `cli.append.limit.enabled` - a boolean flag indicating the limiting of appends in a single run
- `cli.append.limit.value` - the maximum amount of appends for a project as a whole in a single run
- `cli.append.config.mountPath` - the inner container path for the config to be mounted to
- `cli.append.config.fileName` - the inner container config file name to be used on append
- `cli.append.config.path` - the config file local path to be used on append
- `cli.append.uploadTargets` - list of the targets the expired tiles should be uploaded to, choices are `s3` (the genereated output expire.list from osm2pgsql) or `queue` (a payload consisting the bounding boxes of the expired tiles on the top zoom level). the list items are separated with comma without spaces e.g. "s3,queue"
- `cli.append.queue.name` - the name of the queue the payload should be uploaded to
- `cli.append.queue.minZoom` - the queue payload min zoom
- `cli.append.queue.maxZoom` - the queue payload max zoom

*create*
- `cli.create.dumpSourceType` - the type of the dump source local-file, remote-url or dump-server
- `cli.create.dumpSource` - the dump source used for creation
- `cli.create.s3LuaScriptKey` - the project's lua script key located in s3
