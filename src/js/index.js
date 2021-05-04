const portAudio = require('naudiodon');
const grpc = require('@grpc/grpc-js');
const grpcMessages = require('./proto/voicebot_pb');
const grpcServices = require('./proto/voicebot_grpc_pb');

const nChannel = 1;
const samplingRate = 16000;

function getAudioIn() {
    return new portAudio.AudioIO({
        inOptions: {
          channelCount: nChannel,
          sampleFormat: portAudio.SampleFormat16Bit,
          sampleRate: samplingRate,
          deviceId: -1, // Use -1 or omit the deviceId to select the default device
          closeOnError: true // Close the stream if an audio error is detected, if set false then just log the error
        }
      });
}

function getAudioOut() {
    return new portAudio.AudioIO({
        outOptions: {
          channelCount: nChannel,
          sampleFormat: portAudio.SampleFormat16Bit,
          sampleRate: samplingRate,
          deviceId: -1, // Use -1 or omit the deviceId to select the default device
          closeOnError: true // Close the stream if an audio error is detected, if set false then just log the error
        }
      });
}

function getVoicebotStream() {
    // gRpc
    function connect() {
        const initalRequest = new grpcMessages.StreamingTalkRequest();
        const client = new grpcServices.VoicebotClient('aiq.skelterlabs.com:443', grpc.credentials.createSsl());
        const metadata = new grpc.Metadata();
        metadata.set('x-api-key', '<<Your API Key>>');
        return client.streamingTalk(metadata);
    }

    const stream = connect();

    return stream;
}

/* Declaration */
var botState = grpcMessages.StreamingTalkResponse.TalkEvent.LISTENING
const audioIn = getAudioIn();
const audioOut = getAudioOut();
const voicebotStream = getVoicebotStream();

// Receive from mic and send to voicebot
audioIn.on('data', (data) => {
  if (botState == grpcMessages.StreamingTalkResponse.TalkEvent.SPEAKING_FINISHED) {
    voicebotStream.write(new grpcMessages.StreamingTalkRequest().setAudioContent(data));
  }
});

// Receive from voicebot and send to speaker
voicebotStream.on('data', (res) => {
  const speechRes = res.getStreamingSynthesizeSpeechResponse();
  if (speechRes) {
    if (botState == grpcMessages.StreamingTalkResponse.TalkEvent.NOTHING) {
      audioOut.write(speechRes.getAudioContent_asU8());  
    }
  }
  botState = res.getTalkEvent();
});

audioOut.start();
audioIn.start();

// Send initial config
voicebotStream.write(
  new grpcMessages.StreamingTalkRequest().setStreamingTalkConfig(
    new grpcMessages.StreamingTalkRequest.StreamingTalkConfig()
      .setTalkId(new Date().getTime().toString())
      .setStreamingRecognitionConfig(
        new grpcMessages.StreamingRecognitionConfig().setConfig(
          new grpcMessages.RecognitionConfig()
          .setEncoding(grpcMessages.RecognitionConfig.AudioEncoding.LINEAR16)
          .setSampleRateHertz(16000)
        )
      )
  )
);
