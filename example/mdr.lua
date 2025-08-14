local SRID = 4326

local GFID_TAG = 'gfid'
local HISTORY_ID_TAG = 'history_id'
local LAYER_ID_TAG = 'layer_id'
local GEOMETRY_TYPE_TAG = 'geometry_type'

local ALTITUDE_TAG = 'altitude'
local PRECISED_LAT_TAG = 'precised_lat'
local PRECISED_LON_TAG = 'precised_lon'

local tables = {}

tables.dependent_nodes = osm2pgsql.define_table({
    name = 'dependent_nodes',
    ids = { type = 'node', id_column = 'osm_id' },
    columns = {
        { column = 'geom', type = 'point', projection = SRID, not_null = true },
        { column = 'altitude', type = 'real' },
        { column = 'tags', type = 'jsonb' }
    }
})

tables.nodes = osm2pgsql.define_table({
    name = 'nodes',
    ids = { type = 'node', id_column = 'osm_id' },
    columns = {
        { column = 'gfid', type = 'text', not_null = true },
        { column = 'history_id', type = 'text', not_null = true },
        { column = 'geom', type = 'point', projection = SRID, not_null = true },
        { column = 'altitude', type = 'real' },
        { column = 'tags', type = 'jsonb' }
    }
})

tables.ways = osm2pgsql.define_table({
    name = 'ways',
    ids = { type = 'way', id_column = 'osm_id' },
    columns = {
        { column = 'gfid', type = 'text', not_null = true },
        { column = 'history_id', type = 'text', not_null = true },
        { column = 'geom', type = 'geometry', projection = SRID }, -- nullable due to precision
        { column = 'nodes', type = 'text', sql_type = 'bigint[]', not_null = true },
        { column = 'tags', type = 'jsonb' }
    }
})

tables.expired = osm2pgsql.define_table{
    name = "expired",
    ids = { type = 'any', id_column = 'osm_id', type_column = 'osm_type' },
    columns = {
        { column = 'serial_id', sql_type = 'bigserial', create_only = true },
        { column = 'gfid', type = 'text' },
        { column = 'history_id', type = 'text' },
        { column = 'layer_id', type = 'text' },
        { column = 'geometry_type' type = 'text' }
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

function object_to_geom(object)
    if object.is_closed then return object:as_polygon() else return object:as_linestring() end
end

function osm2pgsql.process_node(object)
    local gfid = object:grab_tag(GFID_TAG)
    local history_id = object:grab_tag(HISTORY_ID_TAG)
    local altitude = object:grab_tag(ALTITUDE_TAG)
    local layer_id = object.tags[LAYER_ID_TAG]
    local geometry_type = object.tags[GEOMETRY_TYPE_TAG]

    local is_lat_precised = object.tags[PRECISED_LAT_TAG]
    local is_lon_precised = object.tags[PRECISED_LON_TAG]

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
            history_id = history_id,
            layer_id = layer_id,
            geometry_type = geometry_type
        })
    elseif (is_lat_precised or is_lon_precised) or (altitude and altitude ~= '0') then
        insert_safely("dependent_nodes", {
            geom = object:as_point(),
            altitude = altitude,
            tags = object.tags
        })
    end
end

function osm2pgsql.process_way(object)
    local gfid = object:grab_tag(GFID_TAG)
    local history_id = object:grab_tag(HISTORY_ID_TAG)
    local layer_id = object.tags[LAYER_ID_TAG]
    local geometry_type = object.tags[GEOMETRY_TYPE_TAG]

    insert_safely("ways", {
        gfid = gfid,
        history_id = history_id,
        geom = object_to_geom(object),
        nodes = '{' .. table.concat(object.nodes, ',') .. '}',
        tags = object.tags
    })

    insert_safely("expired", {
        gfid = gfid,
        history_id = history_id,
        layer_id = layer_id,
        geometry_type = geometry_type
    })
end
