/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define([], factory);
	else if(typeof exports === 'object')
		exports["test"] = factory();
	else
		root["test"] = root["test"] || {}, root["test"]["Recorder"] = factory();
})(typeof self !== 'undefined' ? self : this, function() {
return /******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/recorder.js":
/*!*************************!*\
  !*** ./src/recorder.js ***!
  \*************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

eval("\n\nfunction _objectWithoutProperties(source, excluded) { if (source == null) return {}; var target = _objectWithoutPropertiesLoose(source, excluded); var key, i; if (Object.getOwnPropertySymbols) { var sourceSymbolKeys = Object.getOwnPropertySymbols(source); for (i = 0; i < sourceSymbolKeys.length; i++) { key = sourceSymbolKeys[i]; if (excluded.indexOf(key) >= 0) continue; if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue; target[key] = source[key]; } } return target; }\n\nfunction _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; }\n\nvar AudioContext = __webpack_require__.g.AudioContext || __webpack_require__.g.webkitAudioContext; // Constructor\n\nvar Recorder = function Recorder() {\n  var _this = this;\n\n  var config = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};\n\n  if (!Recorder.isRecordingSupported()) {\n    throw new Error(\"Recording is not supported in this browser\");\n  }\n\n  this.state = \"inactive\";\n  this.config = Object.assign({\n    bufferLength: 4096,\n    encoderApplication: 2049,\n    encoderFrameSize: 20,\n    encoderPath: 'encoderWorker.min.js',\n    encoderSampleRate: 48000,\n    maxFramesPerPage: 40,\n    mediaTrackConstraints: true,\n    monitorGain: 0,\n    numberOfChannels: 1,\n    recordingGain: 1,\n    resampleQuality: 3,\n    streamPages: false,\n    wavBitDepth: 16,\n    sourceNode: {\n      context: null\n    }\n  }, config);\n  this.encodedSamplePosition = 0;\n  this.initAudioContext();\n  this.initialize = this.initWorklet().then(function () {\n    return _this.initEncoder();\n  });\n}; // Static Methods\n\n\nRecorder.isRecordingSupported = function () {\n  var getUserMediaSupported = __webpack_require__.g.navigator && __webpack_require__.g.navigator.mediaDevices && __webpack_require__.g.navigator.mediaDevices.getUserMedia;\n  return AudioContext && getUserMediaSupported && __webpack_require__.g.WebAssembly;\n};\n\nRecorder.version = '8.0.3'; // Instance Methods\n\nRecorder.prototype.clearStream = function () {\n  if (this.stream) {\n    if (this.stream.getTracks) {\n      this.stream.getTracks().forEach(function (track) {\n        return track.stop();\n      });\n    } else {\n      this.stream.stop();\n    }\n  }\n};\n\nRecorder.prototype.close = function () {\n  this.monitorGainNode.disconnect();\n  this.recordingGainNode.disconnect();\n\n  if (this.sourceNode) {\n    this.sourceNode.disconnect();\n  }\n\n  this.clearStream();\n\n  if (this.encoder) {\n    this.encoderNode.disconnect();\n    this.encoder.postMessage({\n      command: \"close\"\n    });\n  }\n\n  if (!this.config.sourceNode.context) {\n    return this.audioContext.close();\n  }\n\n  return Promise.resolve();\n};\n\nRecorder.prototype.encodeBuffers = function (inputBuffer) {\n  if (this.state === \"recording\") {\n    var buffers = [];\n\n    for (var i = 0; i < inputBuffer.numberOfChannels; i++) {\n      buffers[i] = inputBuffer.getChannelData(i);\n    }\n\n    this.encoder.postMessage({\n      command: \"encode\",\n      buffers: buffers\n    });\n  }\n};\n\nRecorder.prototype.initAudioContext = function () {\n  this.audioContext = this.config.sourceNode.context ? this.config.sourceNode.context : new AudioContext();\n  this.monitorGainNode = this.audioContext.createGain();\n  this.setMonitorGain(this.config.monitorGain);\n  this.recordingGainNode = this.audioContext.createGain();\n  this.setRecordingGain(this.config.recordingGain);\n};\n\nRecorder.prototype.initEncoder = function () {\n  var _this2 = this;\n\n  if (this.audioContext.audioWorklet) {\n    this.encoderNode = new AudioWorkletNode(this.audioContext, 'encoder-worklet', {\n      numberOfOutputs: 0\n    });\n    this.encoder = this.encoderNode.port;\n  } else {\n    console.log('audioWorklet support not detected. Falling back to scriptProcessor'); // Skip the first buffer\n\n    this.encodeBuffers = function () {\n      return delete _this2.encodeBuffers;\n    };\n\n    this.encoderNode = this.audioContext.createScriptProcessor(this.config.bufferLength, this.config.numberOfChannels, this.config.numberOfChannels);\n\n    this.encoderNode.onaudioprocess = function (_ref) {\n      var inputBuffer = _ref.inputBuffer;\n      return _this2.encodeBuffers(inputBuffer);\n    };\n\n    this.encoderNode.connect(this.audioContext.destination); // Requires connection to destination to process audio\n\n    this.encoder = new __webpack_require__.g.Worker(this.config.encoderPath);\n  }\n};\n\nRecorder.prototype.initSourceNode = function () {\n  var _this3 = this;\n\n  if (this.config.sourceNode.context) {\n    this.sourceNode = this.config.sourceNode;\n    return Promise.resolve();\n  }\n\n  return __webpack_require__.g.navigator.mediaDevices.getUserMedia({\n    audio: this.config.mediaTrackConstraints\n  }).then(function (stream) {\n    _this3.stream = stream;\n    _this3.sourceNode = _this3.audioContext.createMediaStreamSource(stream);\n  });\n};\n\nRecorder.prototype.initWorker = function () {\n  var _this4 = this;\n\n  var onPage = (this.config.streamPages ? this.streamPage : this.storePage).bind(this);\n  this.recordedPages = [];\n  this.totalLength = 0;\n  return new Promise(function (resolve) {\n    var callback = function callback(_ref2) {\n      var data = _ref2.data;\n\n      switch (data['message']) {\n        case 'ready':\n          resolve();\n          break;\n\n        case 'page':\n          _this4.encodedSamplePosition = data['samplePosition'];\n          onPage(data['page']);\n          break;\n\n        case 'done':\n          _this4.encoder.removeEventListener(\"message\", callback);\n\n          _this4.finish();\n\n          break;\n      }\n    };\n\n    _this4.encoder.addEventListener(\"message\", callback); // must call start for messagePort messages\n\n\n    if (_this4.encoder.start) {\n      _this4.encoder.start();\n    } // exclude sourceNode\n\n\n    var _this4$config = _this4.config,\n        sourceNode = _this4$config.sourceNode,\n        config = _objectWithoutProperties(_this4$config, [\"sourceNode\"]);\n\n    _this4.encoder.postMessage(Object.assign({\n      command: 'init',\n      originalSampleRate: _this4.audioContext.sampleRate,\n      wavSampleRate: _this4.audioContext.sampleRate\n    }, config));\n  });\n};\n\nRecorder.prototype.initWorklet = function () {\n  if (this.audioContext.audioWorklet) {\n    return this.audioContext.audioWorklet.addModule(this.config.encoderPath);\n  }\n\n  return Promise.resolve();\n};\n\nRecorder.prototype.pause = function (flush) {\n  var _this5 = this;\n\n  if (this.state === \"recording\") {\n    this.state = \"paused\";\n    this.recordingGainNode.disconnect();\n\n    if (flush && this.config.streamPages) {\n      return new Promise(function (resolve) {\n        var callback = function callback(_ref3) {\n          var data = _ref3.data;\n\n          if (data[\"message\"] === 'flushed') {\n            _this5.encoder.removeEventListener(\"message\", callback);\n\n            _this5.onpause();\n\n            resolve();\n          }\n        };\n\n        _this5.encoder.addEventListener(\"message\", callback); // must call start for messagePort messages\n\n\n        if (_this5.encoder.start) {\n          _this5.encoder.start();\n        }\n\n        _this5.encoder.postMessage({\n          command: \"flush\"\n        });\n      });\n    }\n\n    this.onpause();\n    return Promise.resolve();\n  }\n};\n\nRecorder.prototype.resume = function () {\n  if (this.state === \"paused\") {\n    this.state = \"recording\";\n    this.recordingGainNode.connect(this.encoderNode);\n    this.onresume();\n  }\n};\n\nRecorder.prototype.setRecordingGain = function (gain) {\n  this.config.recordingGain = gain;\n\n  if (this.recordingGainNode && this.audioContext) {\n    this.recordingGainNode.gain.setTargetAtTime(gain, this.audioContext.currentTime, 0.01);\n  }\n};\n\nRecorder.prototype.setMonitorGain = function (gain) {\n  this.config.monitorGain = gain;\n\n  if (this.monitorGainNode && this.audioContext) {\n    this.monitorGainNode.gain.setTargetAtTime(gain, this.audioContext.currentTime, 0.01);\n  }\n};\n\nRecorder.prototype.start = function () {\n  var _this6 = this;\n\n  if (this.state === \"inactive\") {\n    this.state = 'loading';\n    this.encodedSamplePosition = 0;\n    return this.audioContext.resume().then(function () {\n      return _this6.initialize;\n    }).then(function () {\n      return Promise.all([_this6.initSourceNode(), _this6.initWorker()]);\n    }).then(function () {\n      _this6.state = \"recording\";\n\n      _this6.encoder.postMessage({\n        command: 'getHeaderPages'\n      });\n\n      _this6.sourceNode.connect(_this6.monitorGainNode);\n\n      _this6.sourceNode.connect(_this6.recordingGainNode);\n\n      _this6.monitorGainNode.connect(_this6.audioContext.destination);\n\n      _this6.recordingGainNode.connect(_this6.encoderNode);\n\n      _this6.onstart();\n    })[\"catch\"](function (error) {\n      _this6.state = 'inactive';\n      throw error;\n    });\n  }\n\n  return Promise.resolve();\n};\n\nRecorder.prototype.stop = function () {\n  var _this7 = this;\n\n  if (this.state === \"paused\" || this.state === \"recording\") {\n    this.state = \"inactive\"; // macOS and iOS requires the source to remain connected (in case stopped while paused)\n\n    this.recordingGainNode.connect(this.encoderNode);\n    this.monitorGainNode.disconnect();\n    this.clearStream();\n    return new Promise(function (resolve) {\n      var callback = function callback(_ref4) {\n        var data = _ref4.data;\n\n        if (data[\"message\"] === 'done') {\n          _this7.encoder.removeEventListener(\"message\", callback);\n\n          resolve();\n        }\n      };\n\n      _this7.encoder.addEventListener(\"message\", callback); // must call start for messagePort messages\n\n\n      if (_this7.encoder.start) {\n        _this7.encoder.start();\n      }\n\n      _this7.encoder.postMessage({\n        command: \"done\"\n      });\n    });\n  }\n\n  return Promise.resolve();\n};\n\nRecorder.prototype.storePage = function (page) {\n  this.recordedPages.push(page);\n  this.totalLength += page.length;\n};\n\nRecorder.prototype.streamPage = function (page) {\n  this.ondataavailable(page);\n};\n\nRecorder.prototype.finish = function () {\n  if (!this.config.streamPages) {\n    var outputData = new Uint8Array(this.totalLength);\n    this.recordedPages.reduce(function (offset, page) {\n      outputData.set(page, offset);\n      return offset + page.length;\n    }, 0);\n    this.ondataavailable(outputData);\n  }\n\n  this.onstop();\n}; // Callback Handlers\n\n\nRecorder.prototype.ondataavailable = function () {};\n\nRecorder.prototype.onpause = function () {};\n\nRecorder.prototype.onresume = function () {};\n\nRecorder.prototype.onstart = function () {};\n\nRecorder.prototype.onstop = function () {};\n\nmodule.exports = Recorder;\n\n//# sourceURL=webpack://test.Recorder/./src/recorder.js?");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/global */
/******/ 	(() => {
/******/ 		__webpack_require__.g = (function() {
/******/ 			if (typeof globalThis === 'object') return globalThis;
/******/ 			try {
/******/ 				return this || new Function('return this')();
/******/ 			} catch (e) {
/******/ 				if (typeof window === 'object') return window;
/******/ 			}
/******/ 		})();
/******/ 	})();
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__("./src/recorder.js");
/******/ 	
/******/ 	return __webpack_exports__;
/******/ })()
;
});