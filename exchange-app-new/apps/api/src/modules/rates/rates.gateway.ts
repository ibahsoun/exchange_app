import type {
  OnGatewayConnection,
  OnGatewayDisconnect} from '@nestjs/websockets';
import {
  WebSocketGateway,
  WebSocketServer
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import type { LiveRate } from './rates.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/ws/rates',
})
export class RatesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RatesGateway.name);

  @WebSocketServer()
  server!: Server;

  private clientCount = 0;

  handleConnection(_client: Socket) {
    this.clientCount++;
    this.logger.log(`Client connected (${this.clientCount} total)`);
  }

  handleDisconnect(_client: Socket) {
    this.clientCount--;
    this.logger.log(`Client disconnected (${this.clientCount} total)`);
  }

  /** Called by scheduler to push rates to all connected clients */
  broadcastRates(rates: LiveRate[]) {
    if (this.clientCount > 0) {
      this.server.emit('rates:update', rates);
    }
  }
}
