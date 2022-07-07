# osm2pgsql-wrapper

A wrapper for osm2pgsql supporting job / cronjob functionality for creating and appending data

## Usage

```
Usage: index.js <command> [options]

Commands:
  index.js create  initialize a database from scratch by creating it out of an
                   osm pbf file
  index.js append  update existing database from an osm change file

Options:
      --version                             Show version number        [boolean]
  -e, --s3Endpoint, --s3-endpoint           The s3 endpoint  [string] [required]
  -b, --s3BucketName, --s3-bucket-name      The bucket name containing the state
                                            and the lua script
                                                             [string] [required]
  -p, --s3ProjectId, --s3-project-id,       The unique project id used as s3
  --project-id                              object prefix for the state and lua
                                            scripts          [string] [required]
  -h, --help                                Show help                  [boolean]
```

A project represents a single database, the project may consist of multiple sub parts, each sub part is being appended to the database separately in a single job and has its own lua script style.

A job is successfull only if all sub parts have been appended, this results in updating the state of the project, an incremental sequence number coupled to the replication source a.k.a the osm diffs state.

Each project has its unique id, this id is represented has a key prefix in the project's s3 objects,
The s3 bucket structure is as follows:

```
someProjectId/
  state.txt
  script.lua
  script1.lua
  script2.lua
  sub1/
    sequenceNumber1/expire.list
    sequenceNumber2/expire.list
  sub2/
    sequenceNumber1/expire.list
    sequenceNumber2/expire.list
anotherProjectId/
  state.txt
  script.lua
  theOnlySub/
    sequenceNumber1/expire.list
    sequenceNumber2/expire.list
```

## Create command
For the creation of a project the lua script representing the whole project needs to be placed in the bucket under the projectId.
Project can be created from a dump source provided from a local file, remote url or from [dump-server](https://github.com/MapColonies/dump-server) who provides the latest created dump.

## Append command
After the initial creation of a project, data can be appended.
A project can be divided into multiple sub parts, each sub part's lua script needs to be placed in the bucket under the projectId meaning with the projectId as the script's key prefix.

On append a config representing the job is required, the config specifies each sub part's s3 lua script key and it's expired tiles zoom levels.

The output of the append command of `osm2pgsql` is an expire list of tiles in requested zoom levels.

The expired tiles list can be uploaded\pushed to a source of your choice, `s3`, `queue` (using `pgboss`) or both.
- For the `s3` option the expired tiles a.k.a `expire.list` of each sub part will be uploaded to the bucket as well under `/projectId/subId/sequenceNumber/expire.list`.
- For the `queue` option the expired tiles will be parsed into bounding boxes in WGS84 and pushed into the `pgboss` job queue for further processing.
tiles can be filtered by geometry with given `geometryKey` as geojson or bbox key fetched from remote resource, only the filtered tiles will be pushed to the queue.

Before appending a `state.txt` needs to be placed on the bucket under the projectId, the state's `sequenceNumber` will be updated for each append. On the first append the `sequenceNumber` of the creation dump needs to be placed in the `state.txt`.

for additional information see [example](example/README.md)
## Environment Variables

Any option that can be set using the cli command line, can be also set by writing its value in `SNAKE_CASE`.

For example, the option `--s3-bucket-name` can be set by using the `S3_BUCKET_NAME` environment variables.

## Setting AWS SDK authentication

In order to authenticate to S3, you need to supply the AWS credentials.

The easiest way to do this is to define the following env varaibles:

`AWS_ACCESS_KEY_ID`

`AWS_SECRET_ACCESS_KEY`

## Setting Postgres authentication

Postgres authentication should be defined by the following env varaibles: `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` and `PGPASSWORD`

**Exit Codes:**

*Exit codes mapping:*

| Exit Code Number | Name                          | Meaning                                                                         |
|------------------|-------------------------------|---------------------------------------------------------------------------------|
| 0                | success                       | the program finished successfuly.                                               |
| 1                | general error                 | catchall for general errors.                                                    |
| 100              | osm2pgsql error               | failure occoured while running an osm2pgsql command.                            |
| 101              | state fetch error             | failure occoured while interacting with s3.                                     |
| 102              | invalid state error           | state file located in s3 is invalid.                                            |
| 103              | remote service response error | remote service responded with an error.                                         |
| 104              | remote service unavailable    | could not reach to remote service.                                              |
| 105              | dump server empty response    | dump server could not find any dumps metadata.                                  |
| 106              | osmium error                  | failure occoured while running an osmium.                                       |
| 107              | queue error                   | failure occoured while interacting with the queue.                              |
| 108              | bucket does not exist error   | the requested bucket does not exist.                                            |
| 109              | invalid geometry error        | given filter geometry is invalid.                                               |
| 110              | remote resource not found     | resource was not found on remote                                                |

## Building and Running

### Build argument variables
- `NODE_VERSION` - the version of node. currently supports 14 and 16, defaults to 16
- `OSM2PGSQL_REPOSITORY` - the repository of osm2pgsql to be built, defaults to [MapColonies forked osm2pgsql](https://github.com/MapColonies/osm2pgsql.git).
- `OSM2PGSQL_COMMIT_SHA` - the commit SHA of osm2pgsql to be built.
- `OSMIUM_TOOL_TAG` - the tag version of osm2pgsql to be built, defaults to v1.13.2.
- `PROTOZERO_TAG` - the tag version of osm2pgsql to be built, defaults to v1.7.0.
- `LIBOSMIUM_TAG` - the tag version of osm2pgsql to be built, defaults to v2.17.2.

### Building the container

```
    docker build \
    --build-arg NODE_VERSION=16 \
    -f ./Dockerfile -t osm2pgsql-wrapper:latest .
```

### Running the container

```
    docker run \
    --env-file .env \
    -t osm2pgsql-wrapper:latest
```
