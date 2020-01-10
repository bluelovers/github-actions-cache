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
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (!utils.isValidEvent()) {
                utils.logWarning(`Event Validation Error: The event type ${process.env[constants_1.Events.Key]} is not supported. Only ${utils
                    .getSupportedEvents()
                    .join(", ")} events are supported at this time.`);
                return;
            }
            const state = utils.getCacheState();
            // Inputs are re-evaluted before the post action, so we want the original key used for restore
            const primaryKey = core.getState(constants_1.State.CacheKey);
            if (!primaryKey) {
                utils.logWarning(`Error retrieving key from state.`);
                return;
            }
            if (utils.isExactKeyMatch(primaryKey, state)) {
                core.info(`Cache hit occurred on the primary key ${primaryKey}, not saving cache.`);
                return;
            }
            core.debug("Reserving Cache");
            const cacheId = yield cacheHttpClient.reserveCache(primaryKey);
            if (cacheId == -1) {
                core.info(`Unable to reserve cache with key ${primaryKey}, another job may be creating this cache.`);
                return;
            }
            core.debug(`Cache ID: ${cacheId}`);
            const cachePath = utils.resolvePath(core.getInput(constants_1.Inputs.Path, { required: true }));
            core.debug(`Cache Path: ${cachePath}`);
            const archivePath = path.join(yield utils.createTempDirectory(), "cache.tgz");
            core.debug(`Archive Path: ${archivePath}`);
            yield tar_1.createTar(archivePath, cachePath);
            const fileSizeLimit = 2 * 1024 * 1024 * 1024; // 2GB per repo limit
            const archiveFileSize = utils.getArchiveFileSize(archivePath);
            core.debug(`File Size: ${archiveFileSize}`);
            if (archiveFileSize > fileSizeLimit) {
                utils.logWarning(`Cache size of ~${Math.round(archiveFileSize / (1024 * 1024))} MB (${archiveFileSize} B) is over the 2GB limit, not saving cache.`);
                return;
            }
            core.debug(`Saving Cache (ID: ${cacheId})`);
            yield cacheHttpClient.saveCache(cacheId, archivePath);
        }
        catch (error) {
            utils.logWarning(error.message);
        }
    });
}
run();
exports.default = run;
