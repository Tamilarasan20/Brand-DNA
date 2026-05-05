"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotImplementedError = void 0;
class NotImplementedError extends Error {
    constructor(platform, method) {
        super(`[${platform}] ${method}() is not implemented yet — wired in Phase 6.`);
        this.name = 'NotImplementedError';
    }
}
exports.NotImplementedError = NotImplementedError;
//# sourceMappingURL=platform-plugin.interface.js.map