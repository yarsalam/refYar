import { IsNotEmpty, IsString } from 'class-validator';

export class SendMessageDto {
  @IsNotEmpty()
  @IsString()
  convId: string;

  @IsNotEmpty()
  @IsString()
  message: string;
}
