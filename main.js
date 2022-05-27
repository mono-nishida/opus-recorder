let jitterBuffer = {};
const JITTER_MAX = 3;

let myId = getUniqueStr();

function VoiceFrame(id, array) {
  this.id = id;
  this.array = array;
}

function getUniqueStr(myStrong) {
  var strong = 1000;
  if (myStrong) strong = myStrong;
  return new Date().getTime().toString(16)  + Math.floor(strong*Math.random()).toString(16)
}

function screenLogger(text, data) {
  log.innerHTML = "\n" + text + " " + (data || '');
}

function buf2hex(buffer) { // buffer is an ArrayBuffer
  return [...new Uint8Array(buffer)]
    .map(x => x.toString(16).padStart(2, '0'))
    .join('');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

if (!Recorder.isRecordingSupported()) {
  screenLogger("Recording features are not supported in your browser.");
} else {
  init.addEventListener("click", main);
}

async function main() {
  init.disabled = true;
  start.disabled = false;
  monitorGain.disabled = true;
  recordingGain.disabled = true;
  numberOfChannels.disabled = true;
  encoderBitRate.disabled = true;
  encoderSampleRate.disabled = true;
  closeButton.disabled = false;
  encoderApplication.disabled = true;
  encoderComplexity.disabled = true;

  let options = {
    monitorGain: parseInt(monitorGain.value, 10),
    recordingGain: parseInt(recordingGain.value, 10),
    numberOfChannels: parseInt(numberOfChannels.value, 10),
    encoderSampleRate: parseInt(encoderSampleRate.value, 10),
    encoderPath: "../dist/encoderWorker.min.js"
  };

  if (encoderBitRate.value) {
    Object.assign(options, {
      encoderBitRate: parseInt(encoderBitRate.value, 10)
    });
  }

  if (encoderApplication.value) {
    Object.assign(options, {
      encoderApplication: parseInt(encoderApplication.value, 10)
    });
  }

  if (encoderComplexity.value) {
    Object.assign(options, {
      encoderComplexity: parseInt(encoderComplexity.value, 3)
    });
  }

  let recorder = new Recorder(options);

  let recorderStart = function() {
    recorder.start().catch(function(e) {
      screenLogger('Error encountered:', e.message);
    });
  };
  let recorderClose = function() {
    screenLogger('Recorder is closed');
    recorder.close();
    init.disabled = false;

    start.disabled = true;
    closeButton.disabled = true;

    monitorGain.disabled = false;
    recordingGain.disabled = false;
    numberOfChannels.disabled = false;
    encoderBitRate.disabled = false;
    encoderSampleRate.disabled = false
    encoderApplication.disabled = false;
    encoderComplexity.disabled = false;

    start.removeEventListener("click", recorderStart);
    closeButton.removeEventListener("click", recorderClose);
  }

  start.addEventListener("click", recorderStart);
  closeButton.addEventListener("click", recorderClose);

  recorder.onstart = function(e) {
    screenLogger('Recorder is started');
  };


  let decoderWorker = new Worker('../dist/decoderWorker.min.js');
  let desiredSampleRate = parseInt(encoderSampleRate.value, 10);
  decoderWorker.postMessage({
    command: 'init',
    decoderSampleRate: desiredSampleRate,
    outputBufferSampleRate: desiredSampleRate
  });

  decoderWorker.onmessage = function(e) {
    // null means decoder is finished
    if (e.data === null) {
      decoderWorker.postMessage({
        command: 'done'
      });
    } else if (e.data.length == 2) {
      var id = e.data[1];
      console.log('decoderWorker.onmessage voice:' + id);
      if (id != myId) {
        if (!(id in jitterBuffer)) {
          jitterBuffer[id] = [];
          //echoBuffer[id] = [];
          enqueueWait(id).then(() => walk(id));
        }
        //if (jitterBuffer[id].length > JITTER_MAX) 
        //{
        //  jitterBuffer[id].shift();   // trash
        //}
        {
          jitterBuffer[id].push(e.data);
          recorder.sendEchoBuffer(id, e.data);
          //echoBuffer[id].push(e.data);  // エコーキャンセル入力２（受信側）
          console.log("id:"+id+"/"+jitterBuffer[id].length);  
          //console.log("decoded length:" + e.data[0].length);
        }
      }
    }
  };

  let socket = io();
  recorder.ondataavailable = function(typedArray) {
    socket.emit('voice', new VoiceFrame(myId, typedArray));
  };

  socket.on('voice', function(obj) {
    //console.log('socket.on voice:' + obj.id);
    if (obj.id != myId) {
      let receivedArray = new Uint8Array(Object.values(obj.array));
      screenLogger(buf2hex(receivedArray));
      decoderWorker.postMessage({
        command: 'decode',
        pages: receivedArray,
        id: obj.id
      }, [receivedArray.buffer]);
    }
  });

  async function enqueueWait(id) {
    while (jitterBuffer[id].length < JITTER_MAX) 
    {
      await sleep(10);
    }
  }

  async function walk(id) {
    while (true) {
      //await enqueueWait(id);
      await dequeueAndPlay(id);
    }
  }



  

}

let AudioContext = window.AudioContext || window.webkitAudioContext || window.mozAudioContext || window.msAudioContext;
let audioCtx = new AudioContext({
  latencyHint: 'interactive',
  sampleRate: 48000,
});

async function play(id, waves) {
  let waveData = waves[0];
  let trim = jitterBuffer[id].length * 32;
  let wavLength = waveData.length-trim;
  let buffer = audioCtx.createBuffer(1, wavLength, encoderSampleRate.value);
  let data = buffer.getChannelData(0);
  for (let i = 0; i < wavLength; i++) {
    data[i] = waveData[i];
  }
  for (var i = 0; i < 32; i++) {
    data[i] = data[i]*i/32;
    data[wavLength-i-1] = data[wavLength-i-1]*i/32;
  }

  let node = audioCtx.createBufferSource();
  node.loop = false;
  node.buffer = buffer;
  node.connect(audioCtx.destination);
  await new Promise(resolve => { node.onended = resolve; node.start(0); });
};

async function dequeueAndPlay(id) {
  while (jitterBuffer[id].length == 0) 
  {
    await sleep(100);
  }
  var waves = jitterBuffer[id].shift();
  //console.log("id:"+id+"/"+jitterBuffer[id].length);  
  await play(id, waves);
}

