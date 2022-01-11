## Configuration

### Values

**job kind:**

- `job.enabled` - run has a job
- `cron.enabled` - run has a cronjob
- `cron.schedule` - the cronjob schedule interval in the format of [the cron schedule syntax](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/#cron-schedule-syntax)

**postgres:**

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

**environment:**

- `env.httpClient.timeout` - the amount of ms until a timeout is determinded by the http client
- `env.osm2pgsql.*` - see [official osm2pgsql docs](https://osm2pgsql.org/doc/manual.html)
- `env.osmium.verbose` - verbose mode flag
- `env.osmium.progress` - stream the progression of commands

**cli:**

- `cli.command` - the command to be run create or append
- `cli.append.replicationUrl` - the source of replication
- `cli.append.limit.value` - should limit the amount of appends in a single run
- `cli.append.limit.value` - the maximum amount of appends for a project as a whole in a single run
- `cli.append.config.mountPath` - the path for the config to be mounted to
- `cli.append.config.fileName` - the config file name to be used on append
- `cli.create.dumpSourceType` - the type of the dump source local-file, remote-url or dump-server
- `cli.create.dumpSource` - the dump source used for creation
- `cli.create.s3LuaScriptKey` - the project's lua script key located in s3
