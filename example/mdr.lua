local SRID = 4326
local GFID_TAG = 'gfid_tag'
local HISTORY_ID_TAG = 'history_id_tag'
local ALTITUDE_TAG = 'altitude'
local DEFAULT_ALTITUDE = 0

function object_to_geom(object)
    if object.is_closed then return object:as_polygon() else return object:as_linestring() end
end

local tables = {}

tables.dependent_nodes = osm2pgsql.define_table({
    name = 'dependent_nodes',
    ids = { type = 'node', id_column = 'osm_id' },
    columns = {
        { column = 'geom', type = 'point', projection = SRID, not_null = true },
        { column = 'altitude', type = 'real' },
    }
})

tables.nodes = osm2pgsql.define_table({
    name = 'nodes',
    ids = { type = 'node', id_column = 'osm_id' },
    columns = {
        { column = 'gfid', type = 'text' },
        { column = 'history_id', type = 'text' },
        { column = 'geom', type = 'point', projection = SRID, not_null = true },
        { column = 'altitude', type = 'real' },
        { column = 'tags', type = 'jsonb' }
    }
})

tables.ways = osm2pgsql.define_table({
    name = 'ways',
    ids = { type = 'way', id_column = 'osm_id' },
    columns = {
        { column = 'gfid', type = 'text' },
        { column = 'history_id', type = 'text' },
        { column = 'geom', type = 'geometry', projection = SRID, not_null = true },
        { column = 'nodes', type = 'text', sql_type = 'bigint[]' },
        { column = 'tags', type = 'jsonb' }
    }
})

tables.expired = osm2pgsql.define_table{
    name = "expired",
    ids = { type = 'any', id_column = 'osm_id', type_column = 'osm_type' },
    columns = {
        { column = 'serial_id', sql_type = 'serial', create_only = true },
        { column = 'gfid', type = 'text' },
        { column = 'history_id', type = 'text' }
    }
}

function insert_safely(table_key, insert_object)
    if not tables or not tables[table_key] then
        error("Table '" .. tostring(table_key) .. "' does not exist.")
    end

    local inserted, message, column, object = tables[table_key]:insert(insert_object)

    if not inserted then
        print("Insert failed: ", message)
        print("gfid ", insert_object.gfid)
        print("column ", column)
        print("object ", object)
    end

    return true
end

function osm2pgsql.process_node(object)
    local gfid = object:grab_tag(GFID_TAG)
    local history_id = object:grab_tag(HISTORY_ID_TAG)
    local altitude = object:grab_tag(ALTITUDE_TAG)

    if gfid then
        insert_safely("nodes", {
            gfid = gfid,
            history_id = history_id,
            geom = object:as_point(),
            altitude = altitude,
            tags = object.tags
        })

        insert_safely("expired", {
            gfid = gfid,
            history_id = history_id
        })
    elseif altitude then
        insert_safely("dependent_nodes", {
            geom = object:as_point(),
            altitude = altitude
        })
    end
end

function osm2pgsql.process_way(object)
    local gfid = object:grab_tag(GFID_TAG)
    local history_id = object:grab_tag(HISTORY_ID_TAG)

    insert_safely("ways", {
        gfid = gfid,
        history_id = history_id,
        geom = object_to_geom(object),
        nodes = '{' .. table.concat(object.nodes, ',') .. '}',
        tags = object.tags
    })

    insert_safely("expired", {
        gfid = gfid,
        history_id = history_id
    })
end
