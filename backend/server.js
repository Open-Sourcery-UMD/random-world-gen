"use strict";

const { spawn } = require("node:child_process");
const { randomInt } = require("node:crypto");
const { createServer } = require("node:http");
const { join } = require("node:path");

const PORT = Number(process.env.PORT ?? 10000);
const LUA_SCRIPT = join(__dirname, "random_walk.lua");
const GENERATION_TIMEOUT_MS = 5_000;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_CONCURRENT_GENERATIONS = 2;
const MAX_SEED = 2_147_483_647;
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

let activeGenerations = 0;

function sendJson(response, status, body, extraHeaders = {}) {
    response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...extraHeaders,
    });
    response.end(JSON.stringify(body));
}

function sendJsonText(response, status, body, extraHeaders = {}) {
    response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...extraHeaders,
    });
    response.end(body);
}

function applyCors(request, response) {
    response.setHeader("Vary", "Origin");
    const origin = request.headers.origin;

    if (!origin) return true;
    if (!ALLOWED_CORS_ORIGINS.has(origin)) return false;

    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
    response.setHeader("Access-Control-Max-Age", "600");
    return true;
}

function readRequestBody(request) {
    const contentType = request.headers["content-type"]
        ?.split(";")[0]
        .trim()
        .toLowerCase();

    if (contentType !== "application/json") {
        const error = new Error("Send the request body as application/json.");
        error.status = 415;
        error.code = "unsupported_media_type";
        throw error;
    }

    return new Promise((resolve, reject) => {
        const chunks = [];
        let byteLength = 0;
        let tooLarge = false;

        request.on("data", (chunk) => {
            if (tooLarge) return;

            byteLength += chunk.length;
            if (byteLength > MAX_REQUEST_BYTES) {
                tooLarge = true;
                chunks.length = 0;
                return;
            }

            chunks.push(chunk);
        });

        request.on("end", () => {
            if (tooLarge) {
                const error = new Error("The JSON request body is too large.");
                error.status = 413;
                error.code = "request_too_large";
                reject(error);
                return;
            }
            if (byteLength === 0) {
                const error = new Error("The request body must contain JSON.");
                error.status = 400;
                error.code = "invalid_json";
                reject(error);
                return;
            }

            resolve(Buffer.concat(chunks, byteLength));
        });

        request.on("aborted", () => {
            const error = new Error("The request was interrupted.");
            error.status = 400;
            error.code = "request_aborted";
            reject(error);
        });
        request.on("error", reject);
    });
}

function runLuaGenerator(requestBody) {
    return new Promise((resolve, reject) => {
        const fallbackSeed = randomInt(0, MAX_SEED + 1);
        const child = spawn("lua5.4", [LUA_SCRIPT, String(fallbackSeed)], {
            cwd: __dirname,
            stdio: ["pipe", "pipe", "pipe"],
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

        child.stdin.on("error", () => {
            // Lua may exit early after rejecting malformed JSON.
        });
        child.stdin.end(requestBody);

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
                reject(Object.assign(new Error("Map generation took too long."), { status: 504, code: "generation_timeout" }));
                return;
            }
            if (outputTooLarge) {
                reject(new Error("Lua response exceeded the response limit."));
                return;
            }
            if (launchError) {
                reject(new Error("Could not start the Lua interpreter.", { cause: launchError }));
                return;
            }

            const body = Buffer.concat(stdoutChunks, stdoutBytes).toString("utf8");
            if (exitCode === 0) {
                resolve({ status: 200, body });
                return;
            }
            if ((exitCode === 2 || exitCode === 3) && body.trim() !== "") {
                resolve({ status: exitCode === 3 ? 422 : 400, body });
                return;
            }

            const details = Buffer.concat(stderrChunks).toString("utf8").trim();
            reject(new Error(details || `Lua generator exited with code ${exitCode}.`));
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

        if (url.pathname !== "/api/v1/generate") {
            sendJson(response, 404, { error: "not_found" });
            return;
        }

        if (request.method !== "POST") {
            sendJson(response, 405, { error: "method_not_allowed" }, { Allow: "POST, OPTIONS" });
            return;
        }
        if (url.search) {
            sendJson(response, 400, {
                error: "query_not_allowed",
                message: "Send generation settings in the JSON body.",
            });
            return;
        }

        const requestBody = await readRequestBody(request);
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
        let result;
        try {
            result = await runLuaGenerator(requestBody);
        } finally {
            activeGenerations -= 1;
        }

        sendJsonText(response, result.status, result.body);
    } catch (error) {
        if (Number.isInteger(error.status) && typeof error.code === "string") {
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
