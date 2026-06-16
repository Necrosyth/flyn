import { Module } from '@nestjs/common';
import { WebRTCService } from './webrtc.service';
import { WebRTCGateway } from './webrtc.gateway';
import { WebRTCExecutor } from './webrtc.executor';
import { UnmuteService } from './unmute.service';

/**
 * WebRTC Audio Module
 *
 * Provides WebSocket-based audio streaming with AWS Lambda processing
 * and optional Kyutai Unmute voice-mode support.
 *
 * Components:
 * - WebRTCService:  Session management & Lambda invocation
 * - WebRTCGateway:  WebSocket signaling endpoint
 * - WebRTCExecutor: Workflow node executor
 * - UnmuteService:  Downstream bridge to local Unmute voice engine
 */
@Module({
    providers: [WebRTCService, WebRTCGateway, WebRTCExecutor, UnmuteService],
    exports: [WebRTCService, WebRTCExecutor],
})
export class WebRTCModule { }
