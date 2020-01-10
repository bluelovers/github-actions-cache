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
const exec_1 = require("@actions/exec");
const io = __importStar(require("@actions/io"));
const fs_1 = require("fs");
function getTarPath() {
    return __awaiter(this, void 0, void 0, function* () {
        // Explicitly use BSD Tar on Windows
        const IS_WINDOWS = process.platform === "win32";
        if (IS_WINDOWS) {
            const systemTar = `${process.env["windir"]}\\System32\\tar.exe`;
            if (fs_1.existsSync(systemTar)) {
                return systemTar;
            }
        }
        return yield io.which("tar", true);
    });
}
function execTar(args) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield exec_1.exec(`"${yield getTarPath()}"`, args);
        }
        catch (error) {
            const IS_WINDOWS = process.platform === "win32";
            if (IS_WINDOWS) {
                throw new Error(`Tar failed with error: ${(_a = error) === null || _a === void 0 ? void 0 : _a.message}. Ensure BSD tar is installed and on the PATH.`);
            }
            throw new Error(`Tar failed with error: ${(_b = error) === null || _b === void 0 ? void 0 : _b.message}`);
        }
    });
}
function extractTar(archivePath, targetDirectory) {
    return __awaiter(this, void 0, void 0, function* () {
        // Create directory to extract tar into
        yield io.mkdirP(targetDirectory);
        const args = ["-xz", "-f", archivePath, "-C", targetDirectory];
        yield execTar(args);
    });
}
exports.extractTar = extractTar;
function createTar(archivePath, sourceDirectory) {
    return __awaiter(this, void 0, void 0, function* () {
        const args = ["-cz", "-f", archivePath, "-C", sourceDirectory, "."];
        yield execTar(args);
    });
}
exports.createTar = createTar;
