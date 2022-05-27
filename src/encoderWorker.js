"use strict";

function toInt16(n) {
  var v = n < 0 ? n * 32768 : n * 32767;       // convert in range [-32768, 32767]
  return Math.max(-32768, Math.min(32768, v)); // clamp
}

function toInt16Array(a) {
  var i16 = [];
  a.forEach(v => i16.push(toInt16(v)));
  return i16;
}

function toFloat32(n) {
  return n / (n >= 0 ? 32767 : 32768);
}

function toFloat32Array(a) {
  var f32 = [];
  a.forEach(v => f32.push(toFloat32(v)));
  return f32;
}

const OggOpusEncoder = function( config, Module ){

  if ( !Module ) {
    throw new Error('Module with exports required to initialize an encoder instance');
  }

  this.config = Object.assign({ 
    encoderApplication: 2049, // 2048 = Voice (Lower fidelity)
                              // 2049 = Full Band Audio (Highest fidelity)
                              // 2051 = Restricted Low Delay (Lowest latency)
    encoderFrameSize: 20, // Specified in ms.
    encoderSampleRate: 48000, // Desired encoding sample rate. Audio will be resampled
    maxFramesPerPage: 40, // Tradeoff latency with overhead
    numberOfChannels: 1,
    originalSampleRate: 48000,
    resampleQuality: 3, // Value between 0 and 10 inclusive. 10 being highest quality.
    serial: Math.floor(Math.random() * 4294967296)
  }, config );

  this._opus_encoder_create = Module._opus_encoder_create;
  this._opus_encoder_destroy = Module._opus_encoder_destroy;
  this._opus_encoder_ctl = Module._opus_encoder_ctl;
  this._speex_resampler_process_interleaved_float = Module._speex_resampler_process_interleaved_float;
  this._speex_resampler_init = Module._speex_resampler_init;
  this._speex_resampler_destroy = Module._speex_resampler_destroy;
  this._speex_echo_state_init = Module._speex_echo_state_init;
  this._speex_echo_ctl = Module._speex_echo_ctl;
  this._speex_echo_cancellation = Module._speex_echo_cancellation;
  this._speex_echo_state_destroy = Module._speex_echo_state_destroy;
  this._speex_preprocess_state_init = Module._speex_preprocess_state_init;
  this._speex_preprocess_ctl = Module._speex_preprocess_ctl;
  this._speex_preprocess_run = Module._speex_preprocess_run;
  this._speex_preprocess_state_destroy = Module._speex_preprocess_state_destroy;
  this._opus_encode_float = Module._opus_encode_float;
  this._free = Module._free;
  this._malloc = Module._malloc;
  this.HEAPU8 = Module.HEAPU8;
  this.HEAP16 = Module.HEAP16;
  this.HEAP32 = Module.HEAP32;
  this.HEAPF32 = Module.HEAPF32;

  this.pageIndex = 0;
  this.granulePosition = 0;
  this.segmentData = new Uint8Array( 65025 ); // Maximum length of oggOpus data
  this.segmentDataIndex = 0;
  this.segmentTable = new Uint8Array( 255 ); // Maximum data segments
  this.segmentTableIndex = 0;
  this.framesInPage = 0;

  this.frameSize = 4096;

  this.inputBuffer = [];
  this.outputBuffer = [];
  this.echoBuffer = {};
  this.outputIndex = 0;

  this.initChecksumTable();
  this.initCodec();
  this.initResampler();

  this.echoCancellerOpen( this.config.originalSampleRate, this.frameSize, this.frameSize * 8 );

  if ( this.config.numberOfChannels === 1 ) {
    this.interleave = function( buffers ) { return buffers[0]; };
  }
};

OggOpusEncoder.prototype.encode = function( buffers ) {

  // Determine bufferLength dynamically
  if ( !this.bufferLength ) {
    this.bufferLength = buffers[0].length;
    this.interleavedBuffers = new Float32Array( this.bufferLength * this.config.numberOfChannels );


  }

  var samples = this.interleave( buffers );
  var sampleIndex = 0;
  var exportPages = [];

  while ( sampleIndex < samples.length ) {

    var lengthToCopy = Math.min( this.resampleBufferLength - this.resampleBufferIndex, samples.length - sampleIndex );
    this.resampleBuffer.set( samples.subarray( sampleIndex, sampleIndex+lengthToCopy ), this.resampleBufferIndex );
    sampleIndex += lengthToCopy;
    this.resampleBufferIndex += lengthToCopy;

    if ( this.resampleBufferIndex === this.resampleBufferLength ) {
      this._speex_resampler_process_interleaved_float( this.resampler, this.resampleBufferPointer, this.resampleSamplesPerChannelPointer, this.encoderBufferPointer, this.encoderSamplesPerChannelPointer );
      var packetLength = this._opus_encode_float( this.encoder, this.encoderBufferPointer, this.encoderSamplesPerChannel, this.encoderOutputPointer, this.encoderOutputMaxLength );
      exportPages = exportPages.concat(this.segmentPacket( packetLength ));
      this.resampleBufferIndex = 0;

      this.framesInPage++;
      if ( this.framesInPage >= this.config.maxFramesPerPage ) {
        exportPages.push( this.generatePage() );
      }
    }
  }

  return exportPages;
};

OggOpusEncoder.prototype.destroy = function() {
  if ( this.encoder ) {
    this._free(this.encoderSamplesPerChannelPointer);
    delete this.encoderSamplesPerChannelPointer;
    this._free(this.encoderBufferPointer);
    delete this.encoderBufferPointer;
    this._free(this.encoderOutputPointer);
    delete this.encoderOutputPointer;
    this._free(this.resampleSamplesPerChannelPointer);
    delete this.resampleSamplesPerChannelPointer;
    this._free(this.resampleBufferPointer);
    delete this.resampleBufferPointer;
    this._speex_resampler_destroy(this.resampler);
    delete this.resampler;
    this._opus_encoder_destroy(this.encoder);
    delete this.encoder;
  }
};

OggOpusEncoder.prototype.flush = function() {
  var exportPage;
  if ( this.framesInPage ) {
    exportPage = this.generatePage();
  }
  // discard any pending data in resample buffer (only a few ms worth)
  this.resampleBufferIndex = 0;
  return exportPage;
};

OggOpusEncoder.prototype.encodeFinalFrame = function() {
  var exportPages = [];

  // Encode the data remaining in the resample buffer.
  if ( this.resampleBufferIndex > 0 ) {
    const dataToFill = (this.resampleBufferLength - this.resampleBufferIndex) / this.config.numberOfChannels;
    const numBuffers = Math.ceil(dataToFill / this.bufferLength);

    for ( var i = 0; i < numBuffers; i++ ) { 
      var finalFrameBuffers = [];
      for ( var j = 0; j < this.config.numberOfChannels; j++ ) {
        finalFrameBuffers.push( new Float32Array( this.bufferLength ));
      }
      exportPages = exportPages.concat(this.encode( finalFrameBuffers ));
    }
  }

  this.headerType += 4;
  exportPages.push(this.generatePage());
  return exportPages;
};

OggOpusEncoder.prototype.getChecksum = function( data ){
  var checksum = 0;
  for ( var i = 0; i < data.length; i++ ) {
    checksum = (checksum << 8) ^ this.checksumTable[ ((checksum>>>24) & 0xff) ^ data[i] ];
  }
  return checksum >>> 0;
};

OggOpusEncoder.prototype.generateCommentPage = function(){
  var segmentDataView = new DataView( this.segmentData.buffer );
  segmentDataView.setUint32( 0, 1937076303, true ) // Magic Signature 'Opus'
  segmentDataView.setUint32( 4, 1936154964, true ) // Magic Signature 'Tags'
  segmentDataView.setUint32( 8, 10, true ); // Vendor Length
  segmentDataView.setUint32( 12, 1868784978, true ); // Vendor name 'Reco'
  segmentDataView.setUint32( 16, 1919247474, true ); // Vendor name 'rder'
  segmentDataView.setUint16( 20, 21322, true ); // Vendor name 'JS'
  segmentDataView.setUint32( 22, 0, true ); // User Comment List Length
  this.segmentTableIndex = 1;
  this.segmentDataIndex = this.segmentTable[0] = 26;
  this.headerType = 0;
  return this.generatePage();
};

OggOpusEncoder.prototype.generateIdPage = function(){
  var segmentDataView = new DataView( this.segmentData.buffer );
  segmentDataView.setUint32( 0, 1937076303, true ) // Magic Signature 'Opus'
  segmentDataView.setUint32( 4, 1684104520, true ) // Magic Signature 'Head'
  segmentDataView.setUint8( 8, 1, true ); // Version
  segmentDataView.setUint8( 9, this.config.numberOfChannels, true ); // Channel count
  segmentDataView.setUint16( 10, 3840, true ); // pre-skip (80ms)
  segmentDataView.setUint32( 12, this.config.originalSampleRateOverride || this.config.originalSampleRate, true ); // original sample rate
  segmentDataView.setUint16( 16, 0, true ); // output gain
  segmentDataView.setUint8( 18, 0, true ); // channel map 0 = mono or stereo
  this.segmentTableIndex = 1;
  this.segmentDataIndex = this.segmentTable[0] = 19;
  this.headerType = 2;
  return this.generatePage();
};

OggOpusEncoder.prototype.generatePage = function(){
  var granulePosition = ( this.lastPositiveGranulePosition === this.granulePosition) ? -1 : this.granulePosition;
  var pageBuffer = new ArrayBuffer(  27 + this.segmentTableIndex + this.segmentDataIndex );
  var pageBufferView = new DataView( pageBuffer );
  var page = new Uint8Array( pageBuffer );

  pageBufferView.setUint32( 0, 1399285583, true); // Capture Pattern starts all page headers 'OggS'
  pageBufferView.setUint8( 4, 0, true ); // Version
  pageBufferView.setUint8( 5, this.headerType, true ); // 1 = continuation, 2 = beginning of stream, 4 = end of stream

  // Number of samples upto and including this page at 48000Hz, into signed 64 bit Little Endian integer
  // Javascript Number maximum value is 53 bits or 2^53 - 1 
  pageBufferView.setUint32( 6, granulePosition, true );
  if (granulePosition < 0) {
    pageBufferView.setInt32( 10, Math.ceil(granulePosition/4294967297) - 1, true );
  }
  else {
    pageBufferView.setInt32( 10, Math.floor(granulePosition/4294967296), true );
  }

  pageBufferView.setUint32( 14, this.config.serial, true ); // Bitstream serial number
  pageBufferView.setUint32( 18, this.pageIndex++, true ); // Page sequence number
  pageBufferView.setUint8( 26, this.segmentTableIndex, true ); // Number of segments in page.
  page.set( this.segmentTable.subarray(0, this.segmentTableIndex), 27 ); // Segment Table
  page.set( this.segmentData.subarray(0, this.segmentDataIndex), 27 + this.segmentTableIndex ); // Segment Data
  pageBufferView.setUint32( 22, this.getChecksum( page ), true ); // Checksum

  var exportPage = { message: 'page', page: page, samplePosition: this.granulePosition };
  this.segmentTableIndex = 0;
  this.segmentDataIndex = 0;
  this.framesInPage = 0;
  if ( granulePosition > 0 ) {
    this.lastPositiveGranulePosition = granulePosition;
  }

  return exportPage;
};

OggOpusEncoder.prototype.initChecksumTable = function(){
  this.checksumTable = [];
  for ( var i = 0; i < 256; i++ ) {
    var r = i << 24;
    for ( var j = 0; j < 8; j++ ) {
      r = ((r & 0x80000000) != 0) ? ((r << 1) ^ 0x04c11db7) : (r << 1);
    }
    this.checksumTable[i] = (r & 0xffffffff);
  }
};

OggOpusEncoder.prototype.setOpusControl = function( control, value ){
  var location = this._malloc( 4 );
  this.HEAP32[ location >> 2 ] = value;
  this._opus_encoder_ctl( this.encoder, control, location );
  this._free( location );
};

OggOpusEncoder.prototype.initCodec = function() {
  var errLocation = this._malloc( 4 );
  this.encoder = this._opus_encoder_create( this.config.encoderSampleRate, this.config.numberOfChannels, this.config.encoderApplication, errLocation );
  this._free( errLocation );

  if ( this.config.encoderBitRate ) {
    this.setOpusControl( 4002, this.config.encoderBitRate );
  }

  if ( this.config.encoderComplexity ) {
    this.setOpusControl( 4010, this.config.encoderComplexity );
  }

  this.encoderSamplesPerChannel = this.config.encoderSampleRate * this.config.encoderFrameSize / 1000;
  this.encoderSamplesPerChannelPointer = this._malloc( 4 );
  this.HEAP32[ this.encoderSamplesPerChannelPointer >> 2 ] = this.encoderSamplesPerChannel;

  this.encoderBufferLength = this.encoderSamplesPerChannel * this.config.numberOfChannels;
  this.encoderBufferPointer = this._malloc( this.encoderBufferLength * 4 ); // 4 bytes per sample
  this.encoderBuffer = this.HEAPF32.subarray( this.encoderBufferPointer >> 2, (this.encoderBufferPointer >> 2) + this.encoderBufferLength );

  this.encoderOutputMaxLength = 4000;
  this.encoderOutputPointer = this._malloc( this.encoderOutputMaxLength );
  this.encoderOutputBuffer = this.HEAPU8.subarray( this.encoderOutputPointer, this.encoderOutputPointer + this.encoderOutputMaxLength );
};

OggOpusEncoder.prototype.initResampler = function() {
  var errLocation = this._malloc( 4 );
  this.resampler = this._speex_resampler_init( this.config.numberOfChannels, this.config.originalSampleRate, this.config.encoderSampleRate, this.config.resampleQuality, errLocation );
  this._free( errLocation );

  this.resampleBufferIndex = 0;
  this.resampleSamplesPerChannel = this.config.originalSampleRate * this.config.encoderFrameSize / 1000;
  this.resampleSamplesPerChannelPointer = this._malloc( 4 );
  this.HEAP32[ this.resampleSamplesPerChannelPointer >> 2 ] = this.resampleSamplesPerChannel;

  this.resampleBufferLength = this.resampleSamplesPerChannel * this.config.numberOfChannels;
  this.resampleBufferPointer = this._malloc( this.resampleBufferLength * 4 ); // 4 bytes per sample
  this.resampleBuffer = this.HEAPF32.subarray( this.resampleBufferPointer >> 2, (this.resampleBufferPointer >> 2) + this.resampleBufferLength );
};

OggOpusEncoder.prototype.interleave = function( buffers ) {
  for ( var i = 0; i < this.bufferLength; i++ ) {
    for ( var channel = 0; channel < this.config.numberOfChannels; channel++ ) {
      this.interleavedBuffers[ i * this.config.numberOfChannels + channel ] = buffers[ channel ][ i ];
    }
  }

  return this.interleavedBuffers;
};

OggOpusEncoder.prototype.segmentPacket = function( packetLength ) {
  var packetIndex = 0;
  var exportPages = [];

  while ( packetLength >= 0 ) {

    if ( this.segmentTableIndex === 255 ) {
      exportPages.push( this.generatePage() );
      this.headerType = 1;
    }

    var segmentLength = Math.min( packetLength, 255 );
    this.segmentTable[ this.segmentTableIndex++ ] = segmentLength;
    this.segmentData.set( this.encoderOutputBuffer.subarray( packetIndex, packetIndex + segmentLength ), this.segmentDataIndex );
    this.segmentDataIndex += segmentLength;
    packetIndex += segmentLength;
    packetLength -= 255;
  }

  this.granulePosition += ( 48 * this.config.encoderFrameSize );
  if ( this.segmentTableIndex === 255 ) {
    exportPages.push( this.generatePage() );
    this.headerType = 0;
  }

  return exportPages;
};

OggOpusEncoder.prototype.echoCancellerOpen = function( sampleRate, bufSize, totalSize ) {
  const SPEEX_ECHO_SET_SAMPLING_RATE = 24;
  const SPEEX_PREPROCESS_SET_ECHO_STATE = 24;

  //init
  this.echoCancellerSampleRatePointer = this._malloc( 4 );
  this.HEAP32[ this.echoCancellerSampleRatePointer >> 2 ] = sampleRate;

  this.echoState = this._speex_echo_state_init(bufSize, totalSize);
  this.preprocessState = this._speex_preprocess_state_init(bufSize, sampleRate);
  this._speex_echo_ctl(this.echoState, SPEEX_ECHO_SET_SAMPLING_RATE, this.echoCancellerSampleRatePointer);
  this._speex_preprocess_ctl(this.preprocessState, SPEEX_PREPROCESS_SET_ECHO_STATE, this.echoState);

  this.input_frame = this._malloc(this.frameSize * 2);
  this.echo_frame = this._malloc(this.frameSize * 2);
  this.out_frame = this._malloc(this.frameSize * 2);
};

OggOpusEncoder.prototype.echoCancellerProcess = function( input_frame, echo_frame, output_frame ) {
  //call echo cancellation
  this._speex_echo_cancellation(this.echoState, input_frame, echo_frame, output_frame);
  //preprocess output frame
  this._speex_preprocess_run(this.preprocessState, output_frame);
}

OggOpusEncoder.prototype.echoCancellerClose = function() {
  //close
  this._speex_echo_state_destroy(this.echoState);
  this._speex_preprocess_state_destroy(this.preprocessState);
  this._free(this.echoCancellerSampleRatePointer);
  this._free(this.input_frame);
  this._free(this.echo_frame);
  this._free(this.out_frame);
}

OggOpusEncoder.prototype.echoProcess = function(inputs) {
  var inp = inputs[0][0].slice();
  this.inputBuffer.push(inp);
  var inputSize = inp.length;
  if (this.outputBuffer.length == 0 || this.outputIndex >= this.outputBuffer.length) {
    if (this.inputBuffer.length >= this.frameSize / inputSize) {
      var buffer = [];
      this.inputBuffer.forEach(b => {
        b.forEach(v => {
          buffer.push(v);
        })
      });
      var inputInt16Array = new Int16Array(toInt16Array(buffer));
      this.inputBuffer = [];
      var echoTemp = [];
      Object.keys(this.echoBuffer).forEach(id => {
        if (this.echoBuffer[id].length > 0 && this.echoBuffer[id][0].length > 0) {
          this.echoBuffer[id][0][0].forEach((data, i) => {
            if (echoTemp.length <= i) {
              echoTemp[i] = 0;
            }
            echoTemp[i] += data;
          });
          this.echoBuffer[id].shift();
        }
      });
      if (echoTemp.length == 0) {
        return new Float32Array;
      }
      echoTemp.forEach(data => data /= Object.keys(this.echoBuffer).length);
      var echoInt16Array = new Int16Array(toInt16Array(echoTemp));
      this.HEAP16.set(inputInt16Array, this.input_frame / 2);
      this.HEAP16.set(echoInt16Array, this.echo_frame / 2);
      this.echoCancellerProcess(this.input_frame, this.echo_frame, this.out_frame);
      var outputInt16Array = this.HEAP16.slice(this.out_frame / 2, this.out_frame / 2 + this.frameSize);
      this.outputBuffer = new Float32Array(toFloat32Array(outputInt16Array));
      this.outputIndex = 0;
    }
  }
  if (this.outputBuffer.length > this.outputIndex) {
    var output_float = this.outputBuffer.slice(this.outputIndex, this.outputIndex +
      inputSize);
    this.outputIndex += inputSize;
    return output_float;
  }
  return new Float32Array
}

OggOpusEncoder.prototype.echoPush = function( id, buffer ) {
  if (!(id in this.echoBuffer)) {
    this.echoBuffer[id] = [];
  }
  this.echoBuffer[id].push(buffer);
}

// Run in AudioWorkletGlobal scope
if (typeof registerProcessor === 'function') {
  class EncoderWorklet extends AudioWorkletProcessor {

    constructor(){
      super();
      this.continueProcess = true;
      this.port.onmessage = ({ data }) => {
        if (this.encoder) {
          switch( data['command'] ){

            case 'getHeaderPages':
              this.postPage(this.encoder.generateIdPage());
              this.postPage(this.encoder.generateCommentPage());
              break;

            case 'sendEchoBuffer':
              var id = data['echoBufferId'];
              var buffer = data['echoBuffer'];
              this.encoder.echoPush(id, buffer);
              break;

            case 'done':
              this.encoder.encodeFinalFrame().forEach(pageData => this.postPage(pageData));
              this.encoder.destroy();
              delete this.encoder;
              this.port.postMessage( {message: 'done'} );
              break;

            case 'flush':
              this.postPage(this.encoder.flush());
              this.port.postMessage( {message: 'flushed'} );
              break;

            default:
              // Ignore any unknown commands and continue recieving commands
          }
        }

        switch( data['command'] ){

          case 'close':
            this.continueProcess = false;
            break;

          case 'init':
            this.encoder = new OggOpusEncoder( data, Module );
            this.port.postMessage( {message: 'ready'} );
            break;

          default:
            // Ignore any unknown commands and continue recieving commands
        }
      }
    }

    process(inputs) {         // エコーキャンセル入力１（マイク側）
      if (this.encoder && inputs[0] && inputs[0].length && inputs[0][0] && inputs[0][0].length){
        //console.log("mic input length:" + inputs[0][0].length);
        var buffer = this.encoder.echoProcess(inputs);
        if (buffer.length > 0) {
          var buffers = [];
          buffers[0] = buffer;
          this.encoder.encode( buffers ).forEach(pageData => this.postPage(pageData));
        } else {
          // エコーキャンセルの初回バッファリング中はマイク入力をそのまま渡す
          this.encoder.encode( inputs[0] ).forEach(pageData => this.postPage(pageData));
        }
      }
      return this.continueProcess;
    }

    postPage(pageData) {
      if (pageData) {
        this.port.postMessage( pageData, [pageData.page.buffer] );
      }
    }
  }

  registerProcessor('encoder-worklet', EncoderWorklet);
}

// run in scriptProcessor worker scope
else {
  var encoder;
  var postPageGlobal = (pageData) => {
    if (pageData) {
      postMessage( pageData, [pageData.page.buffer] );
    }
  }

  onmessage = ({ data }) => {
    if (encoder) {
      switch( data['command'] ){

        case 'encode':
          encoder.encode( data['buffers'] ).forEach(pageData => postPageGlobal(pageData));
          break;

        case 'getHeaderPages':
          postPageGlobal(encoder.generateIdPage());
          postPageGlobal(encoder.generateCommentPage());
          break;

        case 'done':
          encoder.encodeFinalFrame().forEach(pageData => postPageGlobal(pageData));
          encoder.destroy();
          encoder = null;
          postMessage( {message: 'done'} );
          break;

        case 'flush':
          postPageGlobal(encoder.flush());
          postMessage( {message: 'flushed'} );
          break;

        default:
          // Ignore any unknown commands and continue recieving commands
      }
    }

    switch( data['command'] ){

      case 'close':
        close();
        break;

      case 'init':
        encoder = new OggOpusEncoder( data, Module );
        postMessage( {message: 'ready'} );
        break;

      default:
        // Ignore any unknown commands and continue recieving commands
    }
  };
}


// Exports for unit testing.
var module = module || {};
module.exports = {
  Module: Module,
  OggOpusEncoder: OggOpusEncoder
};
