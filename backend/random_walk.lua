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

        local length = find_max_bounds(x, y, dx, dy, width, height, max_length)

        local len = 0

        for i = 1, length do
            if (x >= 1 and x <= width and y >= 1 and y <= height) then
                dungeon[y][x] = 1
                x = x + dx
                y = y + dy
                len = len + 1
            else
                break
            end
        end

        if (len ~= 0) then
            curr_tunnels = curr_tunnels + 1
        end

        direction = math.random(4)
        length = math.random(max_length)
    end

    return dungeon
end

local function read_integer_argument(index, name, default_value, minimum, maximum)
    local raw_value = arg[index]
    local value = raw_value == nil and default_value or tonumber(raw_value)

    if value == nil or value % 1 ~= 0 or value < minimum or value > maximum then
        error(name .. " must be a whole number between " .. minimum .. " and " .. maximum, 0)
    end

    return value
end

local width = read_integer_argument(1, "grid_width", 50, 2, 200)
local height = read_integer_argument(2, "grid_height", 30, 2, 200)
local max_tunnels = read_integer_argument(3, "max_tunnels", 80, 1, 500)
local max_tunnel_length = read_integer_argument(4, "max_tunnel_length", 20, 1, 200)
local seed = read_integer_argument(5, "seed", os.time() % 2147483648, 0, 2147483647)

math.randomseed(seed)

local dungeon = rand_walk_generate(width, height, max_tunnels, max_tunnel_length)
local encoded_rows = {}

for row = 1, #dungeon do
    local encoded_cells = {}
    for column = 1, #dungeon[row] do
        encoded_cells[column] = tostring(dungeon[row][column])
    end
    encoded_rows[row] = "[" .. table.concat(encoded_cells, ",") .. "]"
end

io.write("[" .. table.concat(encoded_rows, ",") .. "]\n")

