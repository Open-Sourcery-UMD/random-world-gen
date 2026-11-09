local json = require("dkjson")

local function find_max_bounds(x, y, dx, dy, width, height, max_length)
    local length = 0

    while (length < max_length) do
        local new_x = x + dx * (length + 1)
        local new_y = y + dy * (length + 1)

        if (new_x < 1 or new_x > width or new_y < 1 or new_y > height) then
            break
        end

        length = length + 1
    end

    return length
end

local function rand_walk_generate(width, height, max_tunnels, max_length)

    if (width < 2 or height < 2 or max_tunnels <= 0 or max_length < 1) then
        error("Invalid parameters for dungeon generation")
    end

    local x = math.random(width)
    local y = math.random(height)

    local curr_tunnels = 0
    local dungeon = {}

    for i = 1, height do
        dungeon[i] = {}
        for j = 1, width do
            dungeon[i][j] = 0
        end
    end

    while curr_tunnels < max_tunnels do
        local direction = math.random(4)
        local dx, dy = 0, 0

        if direction < 3 then
            dx = (direction == 1) and 1 or -1
        else
            dy = (direction == 3) and 1 or -1
        end

        local max_available_length = find_max_bounds(x, y, dx, dy, width, height, max_length)

        if max_available_length > 0 then
            local length = math.random(max_available_length)
            local len = 0

            for i = 1, length do
                dungeon[y][x] = 1
                x = x + dx
                y = y + dy
                len = len + 1
            end

            if len ~= 0 then
                curr_tunnels = curr_tunnels + 1
            end
        end
    end

    return dungeon
end

local function write_request_error(status, code, message)
    io.write(json.encode({ error = code, message = message }), "\n")
    io.stdout:flush()
    os.exit(status == 422 and 3 or 2)
end

local function is_json_object(value)
    if type(value) ~= "table" then
        return false
    end

    local metatable = getmetatable(value)
    return metatable ~= nil and metatable.__jsontype == "object"
end

local request_body = io.read("*a")
local decoded, payload, next_position, decode_error = pcall(json.decode, request_body, 1, json.null)

if not decoded or decode_error ~= nil then
    write_request_error(400, "invalid_json", "The request body is not valid JSON.")
end

if next_position == nil or request_body:sub(next_position):match("%S") then
    write_request_error(400, "invalid_json", "The request body must contain one JSON value.")
end

if not is_json_object(payload) then
    write_request_error(400, "invalid_request", "The JSON body must be an object.")
end

local allowed_request_fields = {
    algorithm = true,
    seed = true,
    settings = true,
}

for name in pairs(payload) do
    if not allowed_request_fields[name] then
        write_request_error(400, "unknown_field", "Unknown request field: " .. tostring(name) .. ".")
    end
end

if type(payload.algorithm) ~= "string" then
    write_request_error(400, "invalid_algorithm", "algorithm must be a string.")
end

if payload.algorithm ~= "random_walk" then
    write_request_error(422, "unsupported_algorithm", "Unsupported algorithm: " .. payload.algorithm .. ".")
end

local settings = payload.settings
if settings == nil then
    settings = {}
elseif not is_json_object(settings) then
    write_request_error(400, "invalid_settings", "settings must be a JSON object.")
end

local parameter_limits = {
    grid_width = { default_value = 50, minimum = 2, maximum = 200 },
    grid_height = { default_value = 30, minimum = 2, maximum = 200 },
    max_tunnels = { default_value = 80, minimum = 1, maximum = 500 },
    max_tunnel_length = { default_value = 20, minimum = 1, maximum = 200 },
}

for name in pairs(settings) do
    if parameter_limits[name] == nil then
        write_request_error(400, "unknown_setting", "Unknown random_walk setting: " .. tostring(name) .. ".")
    end
end

local function read_setting(name, limits)
    local value = settings[name]
    if value == nil then
        value = limits.default_value
    end

    if type(value) ~= "number" or value % 1 ~= 0
        or value < limits.minimum or value > limits.maximum then
        write_request_error(
            400,
            "invalid_setting",
            name .. " must be an integer between " .. limits.minimum .. " and " .. limits.maximum .. "."
        )
    end

    return value
end

local width = read_setting("grid_width", parameter_limits.grid_width)
local height = read_setting("grid_height", parameter_limits.grid_height)
local max_tunnels = read_setting("max_tunnels", parameter_limits.max_tunnels)
local max_tunnel_length = read_setting("max_tunnel_length", parameter_limits.max_tunnel_length)

if width * height > 40000 then
    write_request_error(400, "invalid_setting", "The grid may contain at most 40,000 cells.")
end

local fallback_seed = tonumber(arg[1]) or (os.time() % 2147483648)
local seed = payload.seed
if seed == nil then
    seed = fallback_seed
elseif type(seed) ~= "number" or seed % 1 ~= 0 or seed < 0 or seed > 2147483647 then
    write_request_error(400, "invalid_seed", "seed must be an integer between 0 and 2147483647.")
end

math.randomseed(seed)

local dungeon = rand_walk_generate(width, height, max_tunnels, max_tunnel_length)
local response = {
    algorithm = payload.algorithm,
    seed = seed,
    map = {
        width = width,
        height = height,
        cells = dungeon,
    },
}

io.write(json.encode(response), "\n")

