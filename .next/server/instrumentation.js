"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(() => {
var exports = {};
exports.id = "instrumentation";
exports.ids = ["instrumentation"];
exports.modules = {

/***/ "better-sqlite3":
/*!*********************************!*\
  !*** external "better-sqlite3" ***!
  \*********************************/
/***/ ((module) => {

module.exports = require("better-sqlite3");

/***/ }),

/***/ "node:crypto":
/*!******************************!*\
  !*** external "node:crypto" ***!
  \******************************/
/***/ ((module) => {

module.exports = require("node:crypto");

/***/ }),

/***/ "node:fs":
/*!**************************!*\
  !*** external "node:fs" ***!
  \**************************/
/***/ ((module) => {

module.exports = require("node:fs");

/***/ }),

/***/ "node:path":
/*!****************************!*\
  !*** external "node:path" ***!
  \****************************/
/***/ ((module) => {

module.exports = require("node:path");

/***/ }),

/***/ "(instrument)/./src/instrumentation.ts":
/*!********************************!*\
  !*** ./src/instrumentation.ts ***!
  \********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   register: () => (/* binding */ register)\n/* harmony export */ });\n/**\n * Next.js instrumentation runs once when the server process starts.\n * This schedules the first library scan and periodic refreshes.\n *\n * The actual work lives in instrumentation-node.ts so the Edge bundle never\n * pulls in the native SQLite dependency.\n */ async function register() {\n    if (true) {\n        await __webpack_require__.e(/*! import() */ \"_instrument_src_instrumentation-node_ts\").then(__webpack_require__.bind(__webpack_require__, /*! ./instrumentation-node */ \"(instrument)/./src/instrumentation-node.ts\"));\n    }\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGluc3RydW1lbnQpLy4vc3JjL2luc3RydW1lbnRhdGlvbi50cyIsIm1hcHBpbmdzIjoiOzs7O0FBQUE7Ozs7OztDQU1DLEdBQ00sZUFBZUE7SUFDcEIsSUFBSUMsSUFBcUMsRUFBRTtRQUN6QyxNQUFNLGdOQUFnQztJQUN4QztBQUNGIiwic291cmNlcyI6WyJEOlxcTG9jYWxTdGVhbVxcc3JjXFxpbnN0cnVtZW50YXRpb24udHMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBOZXh0LmpzIGluc3RydW1lbnRhdGlvbiBydW5zIG9uY2Ugd2hlbiB0aGUgc2VydmVyIHByb2Nlc3Mgc3RhcnRzLlxuICogVGhpcyBzY2hlZHVsZXMgdGhlIGZpcnN0IGxpYnJhcnkgc2NhbiBhbmQgcGVyaW9kaWMgcmVmcmVzaGVzLlxuICpcbiAqIFRoZSBhY3R1YWwgd29yayBsaXZlcyBpbiBpbnN0cnVtZW50YXRpb24tbm9kZS50cyBzbyB0aGUgRWRnZSBidW5kbGUgbmV2ZXJcbiAqIHB1bGxzIGluIHRoZSBuYXRpdmUgU1FMaXRlIGRlcGVuZGVuY3kuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZWdpc3RlcigpIHtcbiAgaWYgKHByb2Nlc3MuZW52Lk5FWFRfUlVOVElNRSA9PT0gXCJub2RlanNcIikge1xuICAgIGF3YWl0IGltcG9ydChcIi4vaW5zdHJ1bWVudGF0aW9uLW5vZGVcIik7XG4gIH1cbn1cbiJdLCJuYW1lcyI6WyJyZWdpc3RlciIsInByb2Nlc3MiLCJlbnYiLCJORVhUX1JVTlRJTUUiXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(instrument)/./src/instrumentation.ts\n");

/***/ })

};
;

// load runtime
var __webpack_require__ = require("./webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = (__webpack_exec__("(instrument)/./src/instrumentation.ts"));
module.exports = __webpack_exports__;

})();