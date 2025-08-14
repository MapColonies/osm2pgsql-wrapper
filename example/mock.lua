local SRID = 4326

local tables = {}

local counter = 1

tables.buildings = osm2pgsql.define_table({
    name = 'buildings',
    ids = { type = 'area', id_column = 'osm_id' },
    columns = {
        { column = 'id', type = 'int8' },
        { column = 'geom', type = 'polygon', projection = SRID },
        { column = 'relative_feature_height', type = 'real' },
        { column = 'all_entity_names', type = 'text' },
        { column = 'building_type', type = 'text' },
        { column = 'entity', type = 'text' },
        { column = 'sensitivity', type = 'text' },
        { column = 'entity_id', type = 'text' },
        { column = 'is_sensitive', type = 'bool' },
        { column = 'date', sql_type = 'timestamp' }
    }
})

tables.roads = osm2pgsql.define_table({
    name = 'roads',
    ids = { type = 'way', id_column = 'osm_id' },
    columns = {
        { column = 'id', type = 'int8' },
        { column = 'geom', type = 'linestring', projection = SRID },
        { column = 'entity', type = 'text' },
        { column = 'entity_id', type = 'text' },
        { column = 'date', sql_type = 'timestamp' },
        { column = 'length', type = 'real' }
    }
})

tables.sites = osm2pgsql.define_table({
    name = 'sites',
    ids = { type = 'node', id_column = 'osm_id' },
    columns = {
        { column = 'id', type = 'int8' },
        { column = 'geom', type = 'point', projection = SRID },
        { column = 'entity', type = 'text' },
        { column = 'entity_id', type = 'text' },
        { column = 'date', sql_type = 'timestamp' }
    }
})

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

function random_uuid_v4()
    local template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
    local uuid = string.gsub(template, "[xy]", function(c)
        local v = (c == "x") and math.random(0, 15) or math.random(8, 11)
        return string.format("%x", v)
    end)
    return "{" .. uuid .. "}"
end

function random_boolean()
    return math.random(0, 1) == 1
end

function random_double(min, max)
    return min + math.random() * (max-min)
end

function unix_to_pg_timestamp(unix_time)
    return os.date("%Y-%m-%d %H:%M:%S", unix_time)
end

function osm2pgsql.process_node(object)
    local isRestaurant = object.tags['amenity']
    local name = object.tags['name']

    if isRestaurant == 'restaurant' then
        insert_safely("sites", {
            id = counter,
            geom = object:as_point(),
            entity_id = random_uuid_v4(),
            entity = name,
            date = unix_to_pg_timestamp(object.timestamp)
        })
    end

    counter = counter + 1
end

function osm2pgsql.process_way(object)
    local buildingType = object.tags['building']
    local highwayType = object.tags['highway']
    local name = object.tags['name']

    if object.is_closed and buildingType then
        local is_sensitive = random_boolean()
        if is_sensitive then
            local sensitivity = 'רגיש'
        else
            local sensitivity = 'ללא התייחסות'
        end

        insert_safely("buildings", {
            id = counter,
            entity = name,
            entity_id = random_uuid_v4(),
            geom = object:as_polygon(),
            building_type = buildingType,
            is_sensitive = is_sensitive,
            sensitivity = sensitivity,
            all_entity_names = name,
            relative_feature_height = random_double(0, 1000),
            date = unix_to_pg_timestamp(object.timestamp)
        })
    elseif not object.is_closed and highwayType then
        insert_safely("roads", {
            id = counter,
            entity = name,
            geom = object:as_linestring(),
            entity_id = random_uuid_v4(),
            length = random_double(0, 1000),
            date = unix_to_pg_timestamp(object.timestamp)
        })
    end

    counter = counter + 1
end
