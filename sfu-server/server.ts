// sfu-server/server.ts
// mediasoup v3 WebRTC Selective Forwarding Unit for Voice, Video & 1080p60 Go Live Screen Streams
import * as mediasoup from "mediasoup";

export async function startMediasoupWorker() {
  const worker = await mediasoup.createWorker({
    rtcMinPort: Number(process.env.MEDIASOUP_MIN_PORT || 40000),
    rtcMaxPort: Number(process.env.MEDIASOUP_MAX_PORT || 40100)
  });

  const router = await worker.createRouter({
    mediaCodecs: [
      { kind: "audio", mimeType: "audio/opus", clockRate: 48000, channels: 2 },
      { kind: "video", mimeType: "video/VP8", clockRate: 90000 },
      { kind: "video", mimeType: "video/H264", clockRate: 90000, parameters: { "packetization-mode": 1, "profile-level-id": "42e01f" } }
    ]
  });

  console.log("clerd mediasoup SFU router initialized for Voice & Go Live Streams:", router.id);
  return { worker, router };
}
