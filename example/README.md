# example
In this example we create a project for andorra's data.

We'll create a project with two sub parts. one for pois and the other for ways.

1. We have the following lua scripts:
    - `simple.lua` - representing the whole project style and used on the initial creation.
    - `sub-simple-pois.lua` - used for appending the pois sub part
    - `sub-simple-ways.lua` - used for appending the ways sub part

2. We'll create the project from an initial dump file taken from [geofabrik](http://download.geofabrik.de/), `andorra-latest.osm.pbf` the sequence number of the dump file represents the statring point of the project.

3. Create a bucket and put the lua style files and a `state.txt` containing the dump sequence number with the project's unique id prefix as key.

The bucket looks like that:
```
andorra/
    state.txt
    simple.lua
    sub-simple-pois.lua
    sub-simple-ways.lua
```

4. Set the s3 and postgres authentication environment variables.

5. Run create command `index.js create -e https://s3-endpoint.com -b andorraBucket -p andorra -t local-file -s ./andorra-latest.osm.pbf -l simple.lua`

6. From now on we can append replications to the project we'll fetch [minute replications](https://planet.openstreetmap.org/replication/minute) from global osm. on append command we'll provide a config specifing for each sub part the lua script key on the bucket and the expiration tiles zoom levels, a range or minimum.

7. Run append command `index.js append -e https://s3-endpoint.com -b andorraBucket -p andorra -a public-read -c ./example-config.json -r  https://planet.openstreetmap.org/replication/minute`

8. We haven't set a limit on the append command (-l) so the project is up to date with the global osm and the expired tiles for each append are located on the bucket with a key of `/andorra/{pois or ways}/{sequenceNumber}/expire.list` the `expire.list` contains the expired tiles in the zoom level specified on the config provided in the append command
