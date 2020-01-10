"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const fs = __importStar(require("fs"));
const Handlers_1 = require("typed-rest-client/Handlers");
const HttpClient_1 = require("typed-rest-client/HttpClient");
const RestClient_1 = require("typed-rest-client/RestClient");
const utils = __importStar(require("./utils/actionUtils"));
function isSuccessStatusCode(statusCode) {
    return statusCode >= 200 && statusCode < 300;
}
function isRetryableStatusCode(statusCode) {
    const retryableStatusCodes = [
        HttpClient_1.HttpCodes.BadGateway,
        HttpClient_1.HttpCodes.ServiceUnavailable,
        HttpClient_1.HttpCodes.GatewayTimeout
    ];
    return retryableStatusCodes.includes(statusCode);
}
function getCacheApiUrl() {
    // Ideally we just use ACTIONS_CACHE_URL
    const baseUrl = (process.env["ACTIONS_CACHE_URL"] ||
        process.env["ACTIONS_RUNTIME_URL"] ||
        "").replace("pipelines", "artifactcache");
    if (!baseUrl) {
        throw new Error("Cache Service Url not found, unable to restore cache.");
    }
    core.debug(`Cache Url: ${baseUrl}`);
    return `${baseUrl}_apis/artifactcache/`;
}
function createAcceptHeader(type, apiVersion) {
    return `${type};api-version=${apiVersion}`;
}
function getRequestOptions() {
    const requestOptions = {
        acceptHeader: createAcceptHeader("application/json", "6.0-preview.1")
    };
    return requestOptions;
}
function createRestClient() {
    const token = process.env["ACTIONS_RUNTIME_TOKEN"] || "";
    const bearerCredentialHandler = new Handlers_1.BearerCredentialHandler(token);
    return new RestClient_1.RestClient("actions/cache", getCacheApiUrl(), [
        bearerCredentialHandler
    ]);
}
function getCacheEntry(keys) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const restClient = createRestClient();
        const resource = `cache?keys=${encodeURIComponent(keys.join(","))}`;
        const response = yield restClient.get(resource, getRequestOptions());
        if (response.statusCode === 204) {
            return null;
        }
        if (!isSuccessStatusCode(response.statusCode)) {
            throw new Error(`Cache service responded with ${response.statusCode}`);
        }
        const cacheResult = response.result;
        const cacheDownloadUrl = (_a = cacheResult) === null || _a === void 0 ? void 0 : _a.archiveLocation;
        if (!cacheDownloadUrl) {
            throw new Error("Cache not found.");
        }
        core.setSecret(cacheDownloadUrl);
        core.debug(`Cache Result:`);
        core.debug(JSON.stringify(cacheResult));
        return cacheResult;
    });
}
exports.getCacheEntry = getCacheEntry;
function pipeResponseToStream(response, stream) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise(resolve => {
            response.message.pipe(stream).on("close", () => {
                resolve();
            });
        });
    });
}
function downloadCache(archiveLocation, archivePath) {
    return __awaiter(this, void 0, void 0, function* () {
        const stream = fs.createWriteStream(archivePath);
        const httpClient = new HttpClient_1.HttpClient("actions/cache");
        const downloadResponse = yield httpClient.get(archiveLocation);
        yield pipeResponseToStream(downloadResponse, stream);
    });
}
exports.downloadCache = downloadCache;
// Reserve Cache
function reserveCache(key) {
    var _a, _b, _c;
    return __awaiter(this, void 0, void 0, function* () {
        const restClient = createRestClient();
        const reserveCacheRequest = {
            key
        };
        const response = yield restClient.create("caches", reserveCacheRequest, getRequestOptions());
        return _c = (_b = (_a = response) === null || _a === void 0 ? void 0 : _a.result) === null || _b === void 0 ? void 0 : _b.cacheId, (_c !== null && _c !== void 0 ? _c : -1);
    });
}
exports.reserveCache = reserveCache;
function getContentRange(start, end) {
    // Format: `bytes start-end/filesize
    // start and end are inclusive
    // filesize can be *
    // For a 200 byte chunk starting at byte 0:
    // Content-Range: bytes 0-199/*
    return `bytes ${start}-${end}/*`;
}
function uploadChunk(restClient, resourceUrl, data, start, end) {
    return __awaiter(this, void 0, void 0, function* () {
        core.debug(`Uploading chunk of size ${end -
            start +
            1} bytes at offset ${start} with content range: ${getContentRange(start, end)}`);
        const requestOptions = getRequestOptions();
        requestOptions.additionalHeaders = {
            "Content-Type": "application/octet-stream",
            "Content-Range": getContentRange(start, end)
        };
        const uploadChunkRequest = () => __awaiter(this, void 0, void 0, function* () {
            return yield restClient.uploadStream("PATCH", resourceUrl, data, requestOptions);
        });
        const response = yield uploadChunkRequest();
        if (isSuccessStatusCode(response.statusCode)) {
            return;
        }
        if (isRetryableStatusCode(response.statusCode)) {
            core.debug(`Received ${response.statusCode}, retrying chunk at offset ${start}.`);
            const retryResponse = yield uploadChunkRequest();
            if (isSuccessStatusCode(retryResponse.statusCode)) {
                return;
            }
        }
        throw new Error(`Cache service responded with ${response.statusCode} during chunk upload.`);
    });
}
function parseEnvNumber(key) {
    const value = Number(process.env[key]);
    if (Number.isNaN(value) || value < 0) {
        return undefined;
    }
    return value;
}
function uploadFile(restClient, cacheId, archivePath) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        // Upload Chunks
        const fileSize = fs.statSync(archivePath).size;
        const resourceUrl = getCacheApiUrl() + "caches/" + cacheId.toString();
        const fd = fs.openSync(archivePath, "r");
        const concurrency = (_a = parseEnvNumber("CACHE_UPLOAD_CONCURRENCY"), (_a !== null && _a !== void 0 ? _a : 4)); // # of HTTP requests in parallel
        const MAX_CHUNK_SIZE = (_b = parseEnvNumber("CACHE_UPLOAD_CHUNK_SIZE"), (_b !== null && _b !== void 0 ? _b : 32 * 1024 * 1024)); // 32 MB Chunks
        core.debug(`Concurrency: ${concurrency} and Chunk Size: ${MAX_CHUNK_SIZE}`);
        const parallelUploads = [...new Array(concurrency).keys()];
        core.debug("Awaiting all uploads");
        let offset = 0;
        try {
            yield Promise.all(parallelUploads.map(() => __awaiter(this, void 0, void 0, function* () {
                while (offset < fileSize) {
                    const chunkSize = Math.min(fileSize - offset, MAX_CHUNK_SIZE);
                    const start = offset;
                    const end = offset + chunkSize - 1;
                    offset += MAX_CHUNK_SIZE;
                    const chunk = fs.createReadStream(archivePath, {
                        fd,
                        start,
                        end,
                        autoClose: false
                    });
                    yield uploadChunk(restClient, resourceUrl, chunk, start, end);
                }
            })));
        }
        finally {
            fs.closeSync(fd);
        }
        return;
    });
}
function commitCache(restClient, cacheId, filesize) {
    return __awaiter(this, void 0, void 0, function* () {
        const requestOptions = getRequestOptions();
        const commitCacheRequest = { size: filesize };
        return yield restClient.create(`caches/${cacheId.toString()}`, commitCacheRequest, requestOptions);
    });
}
function saveCache(cacheId, archivePath) {
    return __awaiter(this, void 0, void 0, function* () {
        const restClient = createRestClient();
        core.debug("Upload cache");
        yield uploadFile(restClient, cacheId, archivePath);
        // Commit Cache
        core.debug("Commiting cache");
        const cacheSize = utils.getArchiveFileSize(archivePath);
        const commitCacheResponse = yield commitCache(restClient, cacheId, cacheSize);
        if (!isSuccessStatusCode(commitCacheResponse.statusCode)) {
            throw new Error(`Cache service responded with ${commitCacheResponse.statusCode} during commit cache.`);
        }
        core.info("Cache saved successfully");
    });
}
exports.saveCache = saveCache;
