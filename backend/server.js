"use strict";

const { spawn } = require("node:child_process");
const { randomInt } = require("node:crypto");
const { createServer } = require("node:http");
const { join } = require("node:path");

const PORT = Number(process.env.PORT ?? 10000);
const LUA_SCRIPT = join(__dirname, "random_walk.lua");
const GENERATION_TIMEOUT_MS = 5_000;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_CONCURRENT_GENERATIONS = 2;
const DEFAULT_CORS_ORIGINS = [
    "https://open-sourcery-umd.github.io",
    "http://localhost:5173",
];
const ALLOWED_CORS_ORIGINS = new Set(
    (process.env.CORS_ORIGINS ?? DEFAULT_CORS_ORIGINS.join(","))
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
);

const PARAMETER_LIMITS = {
    grid_width: { defaultValue: 50, min: 2, max: 200 },
    grid_height: { defaultValue: 30, min: 2, max: 200 },
    max_tunnels: { defaultValue: 80, min: 1, max: 500 },
    max_tunnel_length: { defaultValue: 20, min: 1, max: 200 },
};
const ALLOWED_QUERY_PARAMETERS = new Set([...Object.keys(PARAMETER_LIMITS), "seed"]);

let activeGenerations = 0;

class HttpError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

function sendJson(response, status, body, extraHeaders = {}) {
    response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...extraHeaders,
    });
    response.end(JSON.stringify(body));
}

function applyCors(request, response) {
    response.setHeader("Vary", "Origin");
    const origin = request.headers.origin;

    if (!origin) return true;
    if (!ALLOWED_CORS_ORIGINS.has(origin)) return false;

    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
    response.setHeader("Access-Control-Max-Age", "600");
    return true;
}

function parseIntegerParameter(searchParams, name, limits) {
    const values = searchParams.getAll(name);
    if (values.length > 1) {
        throw new HttpError(400, "invalid_parameter", `${name} must appear only once.`);
    }

    if (values.length === 0) return limits.defaultValue;

    const rawValue = values[0];
    if (!/^\d+$/.test(rawValue)) {
        throw new HttpError(400, "invalid_parameter", `${name} must be a whole number.`);
    }

    const value = Number(rawValue);
    if (!Number.isSafeInteger(value) || value < limits.min || value > limits.max) {
        throw new HttpError(
            400,
            "invalid_parameter",
            `${name} must be between ${limits.min} and ${limits.max}.`,
        );
    }

    return value;
}

function parseSettings(searchParams) {
    for (const name of searchParams.keys()) {
        if (!ALLOWED_QUERY_PARAMETERS.has(name)) {
            throw new HttpError(400, "unknown_parameter", `Unknown query parameter: ${name}.`);
        }
    }

    const settings = {};
    for (const [name, limits] of Object.entries(PARAMETER_LIMITS)) {
        settings[name] = parseIntegerParameter(searchParams, name, limits);
    }

    const area = settings.grid_width * settings.grid_height;
    if (area > 40_000) {
        throw new HttpError(400, "invalid_parameter", "The grid may contain at most 40,000 cells.");
    }

    const seeds = searchParams.getAll("seed");
    if (seeds.length > 1) {
        throw new HttpError(400, "invalid_parameter", "seed must appear only once.");
    }

    if (seeds.length === 0) {
        settings.seed = randomInt(0, 2_147_483_648);
    } else {
        if (!/^\d+$/.test(seeds[0])) {
            throw new HttpError(400, "invalid_parameter", "seed must be a whole number.");
        }

        settings.seed = Number(seeds[0]);
        if (!Number.isSafeInteger(settings.seed) || settings.seed > 2_147_483_647) {
            throw new HttpError(400, "invalid_parameter", "seed must be between 0 and 2147483647.");
        }
    }

    return settings;
}

function isGrid(value, width, height) {
    return Array.isArray(value)
        && value.length === height
        && value.every((row) => Array.isArray(row)
            && row.length === width
            && row.every((cell) => cell === 0 || cell === 1));
}

function runLuaGenerator(settings) {
    return new Promise((resolve, reject) => {
        const argumentsList = [
            LUA_SCRIPT,
            String(settings.grid_width),
            String(settings.grid_height),
            String(settings.max_tunnels),
            String(settings.max_tunnel_length),
            String(settings.seed),
        ];
        const child = spawn("lua5.4", argumentsList, {
            cwd: __dirname,
            stdio: ["ignore", "pipe", "pipe"],
        });

        const stdoutChunks = [];
        const stderrChunks = [];
        let stdoutBytes = 0;
        let stderrBytes = 0;
        let timedOut = false;
        let outputTooLarge = false;
        let launchError;

        const timeout = setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
        }, GENERATION_TIMEOUT_MS);

        child.stdout.on("data", (chunk) => {
            stdoutBytes += chunk.length;
            if (stdoutBytes > MAX_OUTPUT_BYTES) {
                outputTooLarge = true;
                child.kill("SIGKILL");
                return;
            }
            stdoutChunks.push(chunk);
        });

        child.stderr.on("data", (chunk) => {
            const remaining = 8_192 - stderrBytes;
            if (remaining <= 0) return;
            const keptChunk = chunk.subarray(0, remaining);
            stderrChunks.push(keptChunk);
            stderrBytes += keptChunk.length;
        });

        child.once("error", (error) => {
            launchError = error;
        });

        child.once("close", (exitCode) => {
            clearTimeout(timeout);

            if (timedOut) {
                reject(new HttpError(504, "generation_timeout", "Map generation took too long."));
                return;
            }
            if (outputTooLarge) {
                reject(new Error("Lua generator output exceeded the response limit."));
                return;
            }
            if (launchError) {
                reject(new Error("Could not start the Lua interpreter.", { cause: launchError }));
                return;
            }
            if (exitCode !== 0) {
                const details = Buffer.concat(stderrChunks).toString("utf8").trim();
                reject(new Error(details || `Lua generator exited with code ${exitCode}.`));
                return;
            }

            try {
                const grid = JSON.parse(Buffer.concat(stdoutChunks, stdoutBytes).toString("utf8"));
                if (!isGrid(grid, settings.grid_width, settings.grid_height)) {
                    throw new Error("Lua generator returned a grid with an unexpected shape.");
                }
                resolve(grid);
            } catch (error) {
                reject(new Error("Lua generator did not return valid grid JSON.", { cause: error }));
            }
        });
    });
}

async function handleRequest(request, response) {
    try {
        if (!applyCors(request, response)) {
            sendJson(response, 403, { error: "origin_not_allowed" });
            return;
        }

        if (request.method === "OPTIONS") {
            response.writeHead(204, { "Cache-Control": "no-store" });
            response.end();
            return;
        }

        const url = new URL(request.url ?? "/", "http://localhost");

        if (url.pathname === "/health") {
            if (request.method !== "GET") {
                sendJson(response, 405, { error: "method_not_allowed" }, { Allow: "GET, OPTIONS" });
                return;
            }
            sendJson(response, 200, { status: "ok" });
            return;
        }

        if (url.pathname !== "/generate") {
            sendJson(response, 404, { error: "not_found" });
            return;
        }

        if (request.method !== "GET") {
            sendJson(response, 405, { error: "method_not_allowed" }, { Allow: "GET, OPTIONS" });
            return;
        }

        const settings = parseSettings(url.searchParams);
        if (activeGenerations >= MAX_CONCURRENT_GENERATIONS) {
            sendJson(
                response,
                503,
                { error: "server_busy", message: "Please retry shortly." },
                { "Retry-After": "2" },
            );
            return;
        }

        activeGenerations += 1;
        let grid;
        try {
            grid = await runLuaGenerator(settings);
        } finally {
            activeGenerations -= 1;
        }

        sendJson(response, 200, { ...settings, grid });
    } catch (error) {
        if (error instanceof HttpError) {
            sendJson(response, error.status, { error: error.code, message: error.message });
            return;
        }

        console.error(error);
        sendJson(response, 500, { error: "generation_failed", message: "The map could not be generated." });
    }
}

const server = createServer((request, response) => {
    void handleRequest(request, response);
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Random walk API listening on port ${PORT}`);
});
