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
const path = __importStar(require("path"));
const cacheHttpClient = __importStar(require("./cacheHttpClient"));
const constants_1 = require("./constants");
const tar_1 = require("./tar");
const utils = __importStar(require("./utils/actionUtils"));
function run() {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Validate inputs, this can cause task failure
            if (!utils.isValidEvent()) {
                utils.logWarning(`Event Validation Error: The event type ${process.env[constants_1.Events.Key]} is not supported. Only ${utils
                    .getSupportedEvents()
                    .join(", ")} events are supported at this time.`);
                return;
            }
            const cachePath = utils.resolvePath(core.getInput(constants_1.Inputs.Path, { required: true }));
            core.debug(`Cache Path: ${cachePath}`);
            const primaryKey = core.getInput(constants_1.Inputs.Key, { required: true });
            core.saveState(constants_1.State.CacheKey, primaryKey);
            const restoreKeys = core
                .getInput(constants_1.Inputs.RestoreKeys)
                .split("\n")
                .filter(x => x !== "");
            const keys = [primaryKey, ...restoreKeys];
            core.debug("Resolved Keys:");
            core.debug(JSON.stringify(keys));
            if (keys.length > 10) {
                core.setFailed(`Key Validation Error: Keys are limited to a maximum of 10.`);
                return;
            }
            for (const key of keys) {
                if (key.length > 512) {
                    core.setFailed(`Key Validation Error: ${key} cannot be larger than 512 characters.`);
                    return;
                }
                const regex = /^[^,]*$/;
                if (!regex.test(key)) {
                    core.setFailed(`Key Validation Error: ${key} cannot contain commas.`);
                    return;
                }
            }
            try {
                const cacheEntry = yield cacheHttpClient.getCacheEntry(keys);
                if (!((_a = cacheEntry) === null || _a === void 0 ? void 0 : _a.archiveLocation)) {
                    core.info(`Cache not found for input keys: ${keys.join(", ")}.`);
                    return;
                }
                const archivePath = path.join(yield utils.createTempDirectory(), "cache.tgz");
                core.debug(`Archive Path: ${archivePath}`);
                // Store the cache result
                utils.setCacheState(cacheEntry);
                // Download the cache from the cache entry
                yield cacheHttpClient.downloadCache(cacheEntry.archiveLocation, archivePath);
                const archiveFileSize = utils.getArchiveFileSize(archivePath);
                core.info(`Cache Size: ~${Math.round(archiveFileSize / (1024 * 1024))} MB (${archiveFileSize} B)`);
                yield tar_1.extractTar(archivePath, cachePath);
                const isExactKeyMatch = utils.isExactKeyMatch(primaryKey, cacheEntry);
                utils.setCacheHitOutput(isExactKeyMatch);
                core.info(`Cache restored from key: ${cacheEntry && cacheEntry.cacheKey}`);
            }
            catch (error) {
                utils.logWarning(error.message);
                utils.setCacheHitOutput(false);
            }
        }
        catch (error) {
            core.setFailed(error.message);
        }
    });
}
run();
exports.default = run;
