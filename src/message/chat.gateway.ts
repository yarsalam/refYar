import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MessageService } from '../message/message.service';
import { forwardRef, Inject } from '@nestjs/common';

@WebSocketGateway({ cors: true })
export class ChatGateway {
  @WebSocketServer()
  server: Server;

  constructor(
    @Inject(forwardRef(() => MessageService))
    private messageService: MessageService,
  ) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth.token;
    // TODO: بررسی JWT
  }

  @SubscribeMessage('join')
  handleJoin(
    @MessageBody() data: { room: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(data.room);
  }

  @SubscribeMessage('leave')
  handleLeave(
    @MessageBody() data: { room: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(data.room);
  }

  // Room name به صورت normalized: min_max تا دو طرف همان room را ببینند
  static getRoomName(a: number, b: number): string {
    return `chat_${Math.min(a, b)}_${Math.max(a, b)}`;
  }

  async emitNewMessage(room: string, message: any) {
    this.server.to(room).emit('new_message', message);
  }

  async emitMessageRead(room: string, messageId: number) {
    this.server.to(room).emit('message_read', { messageId });
  }
}
