import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateMessageDto {
  @IsNumber()
  from_id: number;

  @IsNumber()
  to_id: number;

  @IsString()
  content: string;

  @IsOptional()
  @IsBoolean()
  is_free?: boolean;
}
