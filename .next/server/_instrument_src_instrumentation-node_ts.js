"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "_instrument_src_instrumentation-node_ts";
exports.ids = ["_instrument_src_instrumentation-node_ts"];
exports.modules = {

/***/ "(instrument)/./src/instrumentation-node.ts":
/*!*************************************!*\
  !*** ./src/instrumentation-node.ts ***!
  \*************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   register: () => (/* binding */ register)\n/* harmony export */ });\n/**\n * Node-only startup tasks. Imported from instrumentation.ts exclusively when\n * NEXT_RUNTIME is \"nodejs\" — never from client or Edge code.\n */ async function register() {\n    const { ensureScanScheduled } = await __webpack_require__.e(/*! import() */ \"_instrument_src_lib_server_scanner_ts\").then(__webpack_require__.bind(__webpack_require__, /*! ./lib/server/scanner */ \"(instrument)/./src/lib/server/scanner.ts\"));\n    ensureScanScheduled();\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGluc3RydW1lbnQpLy4vc3JjL2luc3RydW1lbnRhdGlvbi1ub2RlLnRzIiwibWFwcGluZ3MiOiI7Ozs7QUFBQTs7O0NBR0MsR0FDTSxlQUFlQTtJQUNwQixNQUFNLEVBQUVDLG1CQUFtQixFQUFFLEdBQUcsTUFBTSwwTUFBOEI7SUFDcEVBO0FBQ0YiLCJzb3VyY2VzIjpbIkQ6XFxMb2NhbFN0ZWFtXFxzcmNcXGluc3RydW1lbnRhdGlvbi1ub2RlLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogTm9kZS1vbmx5IHN0YXJ0dXAgdGFza3MuIEltcG9ydGVkIGZyb20gaW5zdHJ1bWVudGF0aW9uLnRzIGV4Y2x1c2l2ZWx5IHdoZW5cbiAqIE5FWFRfUlVOVElNRSBpcyBcIm5vZGVqc1wiIOKAlCBuZXZlciBmcm9tIGNsaWVudCBvciBFZGdlIGNvZGUuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZWdpc3RlcigpIHtcbiAgY29uc3QgeyBlbnN1cmVTY2FuU2NoZWR1bGVkIH0gPSBhd2FpdCBpbXBvcnQoXCIuL2xpYi9zZXJ2ZXIvc2Nhbm5lclwiKTtcbiAgZW5zdXJlU2NhblNjaGVkdWxlZCgpO1xufVxuIl0sIm5hbWVzIjpbInJlZ2lzdGVyIiwiZW5zdXJlU2NhblNjaGVkdWxlZCJdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(instrument)/./src/instrumentation-node.ts\n");

/***/ })

};
;